import Database from 'better-sqlite3'
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  CandidateModelSchema,
  TranscriptSchema,
} from '../../../shared/profile-schemas.js'
import { UiCandidateModelSchema } from '../../../shared/ui-model.js'
import {
  type JobStatus,
  RepositoryError,
  createRepository,
} from '../../src/db/repository.js'
import { runMigrations } from '../../src/db/migrate.js'

const transcript = TranscriptSchema.parse({
  candidate_id: 'candidate-1',
  source_type: 'chat-export',
  conversations: [
    {
      conversation_id: 'conversation-1',
      title: 'Architecture',
      messages: [
        {
          message_id: 'message-1',
          role: 'user',
          content: 'Keep domain ownership explicit.',
          timestamp: '2026-08-21T06:00:00.000Z',
          authorship: 'user',
        },
      ],
    },
  ],
})

const canonicalModel = CandidateModelSchema.parse({
  working_archetype: {
    name_cn: '待验证',
    name_en: 'Unresolved',
    definition: 'Insufficient evidence.',
    explanatory_confidence: 0.2,
    outcome_validation_confidence: 0.2,
    evidence_status: 'unknown',
    claim_polarity: 'neutral',
    supporting_evidence_ids: [],
  },
  core_loop: [],
  why_different: {
    claim: 'Insufficient evidence.',
    evidence_status: 'unknown',
    claim_polarity: 'neutral',
    confidence: 0.2,
    supporting_evidence_ids: [],
  },
  high_signal_episodes: [],
  mechanisms: [],
  capabilities: [],
  archetype_competition_winner: null,
  archetype_competition: [],
  strongest_counterargument: {
    argument: 'Insufficient evidence.',
    what_it_explains: '',
    what_it_fails_to_explain: '',
    why_it_does_or_does_not_win: '',
    evidence_status: 'unknown',
    claim_polarity: 'neutral',
    confidence: 0.2,
    supporting_evidence_ids: [],
  },
  strength_risk_pairs: [],
  role_fit: [],
  evidence_boundaries: [],
  hiring_manager_summary: {
    claims: [
      {
        claim: 'More evidence is required.',
        evidence_status: 'unknown',
        claim_polarity: 'neutral',
        confidence: 0.2,
        supporting_evidence_ids: [],
      },
    ],
    seniority_claims: [],
  },
})

const uiModel = UiCandidateModelSchema.parse({
  generatedAt: 1,
  headline: 'More evidence required',
  thesis: 'No supported conclusion yet.',
  dimensionCount: 0,
  sourceLabel: 'Chat export',
  unknownCount: 1,
  dimensions: [],
  cannotProve: ['Role readiness'],
  capabilities: [],
  strengths: [],
  risks: [],
  riskNote: 'Unknown is not weakness.',
  roles: [],
  nextQuestions: [],
})

function expectRepositoryCode(action: () => unknown, code: string) {
  try {
    action()
    throw new Error(`Expected ${code}`)
  } catch (error) {
    expect(error).toBeInstanceOf(RepositoryError)
    expect((error as RepositoryError).code).toBe(code)
  }
}

function advanceToValidating(
  repo: ReturnType<typeof createRepository>,
  jobId: string,
) {
  repo.updateJobStatus(jobId, 'parsing')
  repo.updateJobStatus(jobId, 'inferring')
  repo.updateJobStatus(jobId, 'validating')
}

describe('ProfileRepository', () => {
  let directory: string
  let dbPath: string
  let repo: ReturnType<typeof createRepository>

  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'workgraph-repository-'))
    dbPath = join(directory, 'workgraph.db')
    repo = createRepository(dbPath)
  })

  afterEach(() => {
    try {
      repo.close()
    } catch {
      // A close test may already have closed the repository.
    }
    rmSync(directory, { recursive: true, force: true })
  })

  it('runs migrations idempotently', () => {
    repo.close()
    repo = createRepository(dbPath)

    const db = new Database(dbPath, { readonly: true })
    const versions = db
      .prepare('SELECT version FROM schema_migrations ORDER BY version')
      .all()
    db.close()

    expect(versions).toEqual([
      { version: '001_initial' },
      { version: '002_nullable_provider_call_job' },
    ])
  })

  it('rechecks migration versions after acquiring the write lock', () => {
    let appliedByAnotherProcess = false
    let insideImmediate = false
    let migrationExecutions = 0
    let transactionCount = 0
    const checksInsideLock: boolean[] = []
    const fakeDb = {
      exec(sql: string) {
        if (sql.includes('CREATE TABLE transcripts')) {
          migrationExecutions += 1
        }
      },
      prepare(sql: string) {
        if (sql.includes('SELECT 1 FROM schema_migrations')) {
          return {
            get() {
              checksInsideLock.push(insideImmediate)
              return appliedByAnotherProcess ? { found: 1 } : undefined
            },
          }
        }
        return {
          run() {
            appliedByAnotherProcess = true
          },
        }
      },
      transaction(callback: () => void) {
        return {
          immediate() {
            transactionCount += 1
            if (transactionCount === 2) {
              appliedByAnotherProcess = true
            }
            insideImmediate = true
            try {
              callback()
            } finally {
              insideImmediate = false
            }
          },
        }
      },
    }

    runMigrations(
      fakeDb as unknown as Parameters<typeof runMigrations>[0],
    )

    expect(checksInsideLock).toEqual([true, true])
    expect(migrationExecutions).toBe(0)
  })

  it('closes the database when migration initialization fails', () => {
    repo.close()
    const failingPath = join(directory, 'failing.db')
    const setupDb = new Database(failingPath)
    setupDb.exec('CREATE TABLE transcripts (id TEXT PRIMARY KEY)')
    setupDb.close()
    const closeSpy = vi.spyOn(Database.prototype, 'close')

    expect(() => createRepository(failingPath)).toThrow()
    expect(closeSpy).toHaveBeenCalledTimes(1)

    closeSpy.mockRestore()
  })

  it('creates transcripts and enforces idempotent job requests', () => {
    const storedTranscript = repo.createTranscript(
      transcript,
      new Date('2026-08-28T00:00:00.000Z'),
    )
    const job = repo.createJob({
      candidateId: transcript.candidate_id,
      transcriptId: storedTranscript.id,
      idempotencyKey: 'request-1',
      requestHash: 'hash-1',
    })

    expect(storedTranscript.id).toMatch(/^tr_/)
    expect(job).toMatchObject({
      status: 'queued',
      progress: 0.05,
      stageMessage: '任务已排队',
    })
    expect(repo.findIdempotentJob('request-1', 'hash-1')?.id).toBe(job.id)
    expectRepositoryCode(
      () => repo.findIdempotentJob('request-1', 'different'),
      'IDEMPOTENCY_CONFLICT',
    )
  })

  it('atomically creates or reuses an idempotent job and its Transcript', () => {
    const input = {
      candidateId: transcript.candidate_id,
      transcript,
      retentionDate: new Date('2026-08-28T00:00:00.000Z'),
      idempotencyKey: 'atomic-request',
      requestHash: 'atomic-hash',
      options: { enableCritic: false },
    }

    const first = repo.createOrGetProfileJob(input)
    const second = repo.createOrGetProfileJob(input)
    const db = new Database(dbPath, { readonly: true })
    const counts = {
      transcripts: (
        db.prepare('SELECT COUNT(*) AS count FROM transcripts').get() as {
          count: number
        }
      ).count,
      jobs: (
        db.prepare('SELECT COUNT(*) AS count FROM analysis_jobs').get() as {
          count: number
        }
      ).count,
    }
    db.close()

    expect(first.created).toBe(true)
    expect(second).toEqual({ job: first.job, created: false })
    expect(counts).toEqual({ transcripts: 1, jobs: 1 })
  })

  it('uses two connections concurrently without duplicate jobs or orphan Transcripts', async () => {
    const input = {
      candidateId: transcript.candidate_id,
      transcript,
      retentionDate: new Date('2026-08-28T00:00:00.000Z'),
      idempotencyKey: 'two-connection-request',
      requestHash: 'two-connection-hash',
      options: { enableCritic: false },
    }

    const repositoryUrl = pathToFileURL(
      join(process.cwd(), 'server/src/db/repository.ts'),
    ).href
    const childCode = `
      import { createRepository } from ${JSON.stringify(repositoryUrl)}
      const input = JSON.parse(process.env.TEST_INPUT)
      input.retentionDate = new Date(input.retentionDate)
      process.send({ ready: true })
      process.once('message', () => {
        const repository = createRepository(process.env.TEST_DB_PATH)
        try {
          const result = repository.createOrGetProfileJob(input)
          process.send({ result })
        } finally {
          repository.close()
        }
      })
    `
    const children = Array.from({ length: 2 }, () =>
      spawn(
        process.execPath,
        ['--import', 'tsx', '--input-type=module', '--eval', childCode],
        {
          env: {
            ...process.env,
            TEST_DB_PATH: dbPath,
            TEST_INPUT: JSON.stringify(input),
          },
          stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
        },
      ),
    )
    const ready = (child: ChildProcess) =>
      new Promise<void>((resolve, reject) => {
        child.once('error', reject)
        child.once('message', () => resolve())
      })
    const result = (child: ChildProcess) =>
      new Promise<{ job: { id: string }; created: boolean }>(
        (resolve, reject) => {
          child.once('error', reject)
          child.once('message', (message) => {
            resolve(
              (message as {
                result: { job: { id: string }; created: boolean }
              }).result,
            )
          })
        },
      )

    try {
      await Promise.all(children.map(ready))
      const resultsPromise = Promise.all(children.map(result))
      children.forEach((child) => child.send('go'))
      const results = await resultsPromise
      const db = new Database(dbPath, { readonly: true })
      const transcriptCount = (
        db.prepare('SELECT COUNT(*) AS count FROM transcripts').get() as {
          count: number
        }
      ).count
      const jobCount = (
        db.prepare('SELECT COUNT(*) AS count FROM analysis_jobs').get() as {
          count: number
        }
      ).count
      const orphanCount = (
        db
          .prepare(
            `SELECT COUNT(*) AS count
             FROM transcripts
             LEFT JOIN analysis_jobs
               ON analysis_jobs.transcript_id = transcripts.id
             WHERE analysis_jobs.id IS NULL`,
          )
          .get() as { count: number }
      ).count
      db.close()

      expect(results.map(({ job }) => job.id)).toEqual([
        results[0]!.job.id,
        results[0]!.job.id,
      ])
      expect(results.filter(({ created }) => created)).toHaveLength(1)
      expect({ transcriptCount, jobCount, orphanCount }).toEqual({
        transcriptCount: 1,
        jobCount: 1,
        orphanCount: 0,
      })
    } finally {
      children.forEach((child) => child.kill())
    }
  })

  it('lists every persisted nonterminal job for restart recovery', () => {
    const first = repo.createOrGetProfileJob({
      candidateId: transcript.candidate_id,
      transcript,
      retentionDate: new Date('2026-08-28T00:00:00.000Z'),
      idempotencyKey: null,
      requestHash: 'restart-1',
      options: { enableCritic: false },
    }).job
    const second = repo.createOrGetProfileJob({
      candidateId: transcript.candidate_id,
      transcript,
      retentionDate: new Date('2026-08-28T00:00:00.000Z'),
      idempotencyKey: null,
      requestHash: 'restart-2',
      options: { enableCritic: true },
    }).job
    repo.updateJobStatus(second.id, 'failed')

    expect(repo.listNonterminalJobs().map(({ id }) => id)).toEqual([first.id])
  })

  it('converts duplicate idempotency-key inserts to a stable conflict', () => {
    const storedTranscript = repo.createTranscript(
      transcript,
      new Date('2026-08-28T00:00:00.000Z'),
    )
    const original = repo.createJob({
      candidateId: transcript.candidate_id,
      transcriptId: storedTranscript.id,
      idempotencyKey: 'request-race',
      requestHash: 'hash-1',
    })

    expectRepositoryCode(
      () =>
        repo.createJob({
          candidateId: transcript.candidate_id,
          transcriptId: storedTranscript.id,
          idempotencyKey: 'request-race',
          requestHash: 'hash-2',
        }),
      'IDEMPOTENCY_CONFLICT',
    )
    expect(repo.findIdempotentJob('request-race', 'hash-1')?.id).toBe(
      original.id,
    )
  })

  it.each([
    ['queued', 'parsing'],
    ['parsing', 'inferring'],
    ['parsing', 'extracting'],
    ['parsing', 'failed'],
    ['parsing', 'cancelled'],
    ['extracting', 'inferring'],
    ['extracting', 'failed'],
    ['extracting', 'cancelled'],
    ['inferring', 'criticizing'],
    ['inferring', 'validating'],
    ['inferring', 'unresolved'],
    ['inferring', 'failed'],
    ['inferring', 'cancelled'],
    ['criticizing', 'validating'],
    ['criticizing', 'unresolved'],
    ['criticizing', 'failed'],
    ['criticizing', 'cancelled'],
    ['validating', 'completed'],
    ['validating', 'unresolved'],
    ['validating', 'failed'],
    ['validating', 'cancelled'],
  ] satisfies [JobStatus, JobStatus][])(
    'allows approved transition %s → %s',
    (from, to) => {
      const storedTranscript = repo.createTranscript(
        transcript,
        new Date('2026-08-28T00:00:00.000Z'),
      )
      const job = repo.createJob({
        candidateId: transcript.candidate_id,
        transcriptId: storedTranscript.id,
        idempotencyKey: null,
        requestHash: `hash-${from}-${to}`,
      })
      const db = new Database(dbPath)
      db.prepare('UPDATE analysis_jobs SET status = ? WHERE id = ?').run(
        from,
        job.id,
      )
      db.close()

      expect(repo.updateJobStatus(job.id, to).status).toBe(to)
    },
  )

  it.each([
    'completed',
    'unresolved',
    'failed',
    'cancelled',
  ] satisfies JobStatus[])(
    'rejects transitions from terminal state %s',
    (terminalStatus) => {
      const storedTranscript = repo.createTranscript(
        transcript,
        new Date('2026-08-28T00:00:00.000Z'),
      )
      const job = repo.createJob({
        candidateId: transcript.candidate_id,
        transcriptId: storedTranscript.id,
        idempotencyKey: null,
        requestHash: `hash-${terminalStatus}`,
      })
      const db = new Database(dbPath)
      db.prepare('UPDATE analysis_jobs SET status = ? WHERE id = ?').run(
        terminalStatus,
        job.id,
      )
      db.close()

      expectRepositoryCode(
        () => repo.updateJobStatus(job.id, 'parsing'),
        'INVALID_STATUS_TRANSITION',
      )
    },
  )

  it('rejects illegal non-terminal status transitions', () => {
    const storedTranscript = repo.createTranscript(
      transcript,
      new Date('2026-08-28T00:00:00.000Z'),
    )
    const job = repo.createJob({
      candidateId: transcript.candidate_id,
      transcriptId: storedTranscript.id,
      idempotencyKey: null,
      requestHash: 'hash-1',
    })

    expectRepositoryCode(
      () => repo.updateJobStatus(job.id, 'completed'),
      'INVALID_STATUS_TRANSITION',
    )
  })

  it('writes progress and stageMessage from real status transitions', () => {
    const storedTranscript = repo.createTranscript(
      transcript,
      new Date('2026-08-28T00:00:00.000Z'),
    )
    const job = repo.createJob({
      candidateId: transcript.candidate_id,
      transcriptId: storedTranscript.id,
      idempotencyKey: null,
      requestHash: 'hash-progress',
    })

    expect(repo.updateJobStatus(job.id, 'parsing')).toMatchObject({
      progress: 0.15,
      stageMessage: '正在解析对话记录',
    })
    expect(repo.updateJobStatus(job.id, 'inferring')).toMatchObject({
      progress: 0.7,
      stageMessage: '正在生成画像',
    })
    const failed = repo.updateJobStatus(job.id, 'failed', {
      errorCode: 'INTERNAL_ERROR',
      errorMessage: 'Profile inference failed.',
    })
    expect(failed.progress).toBe(0.7)
    expect(failed.stageMessage).toBe('生成失败')
  })

  it('marks saved models as fully progressed', () => {
    const storedTranscript = repo.createTranscript(
      transcript,
      new Date('2026-08-28T00:00:00.000Z'),
    )
    const job = repo.createJob({
      candidateId: transcript.candidate_id,
      transcriptId: storedTranscript.id,
      idempotencyKey: null,
      requestHash: 'hash-save-progress',
    })
    advanceToValidating(repo, job.id)
    repo.saveModel({
      candidateId: transcript.candidate_id,
      jobId: job.id,
      canonicalModel,
      uiModel,
      critic: null,
      status: 'completed',
    })

    expect(repo.getJob(job.id)).toMatchObject({
      status: 'completed',
      progress: 1,
      stageMessage: '画像已生成',
    })
  })

  it('schema-validates stored Transcript, Canonical, and UI JSON on read', () => {
    const storedTranscript = repo.createTranscript(
      transcript,
      new Date('2026-08-28T00:00:00.000Z'),
    )
    const job = repo.createJob({
      candidateId: transcript.candidate_id,
      transcriptId: storedTranscript.id,
      idempotencyKey: null,
      requestHash: 'hash-1',
    })
    advanceToValidating(repo, job.id)
    const model = repo.saveModel({
      candidateId: transcript.candidate_id,
      jobId: job.id,
      canonicalModel,
      uiModel,
      critic: null,
      status: 'unresolved',
    })

    const db = new Database(dbPath)
    db.prepare('UPDATE transcripts SET content_json = ? WHERE id = ?').run(
      '{"candidate_id":42}',
      storedTranscript.id,
    )
    expectRepositoryCode(
      () => repo.getTranscript(storedTranscript.id),
      'CORRUPT_STORED_JSON',
    )

    db.prepare('UPDATE candidate_models SET ui_json = ? WHERE id = ?').run(
      '{"headline":42}',
      model.id,
    )
    db.close()
    expectRepositoryCode(() => repo.getModel(model.id), 'CORRUPT_STORED_JSON')
  })

  it('rejects corrupt stored canonical JSON explicitly', () => {
    const storedTranscript = repo.createTranscript(
      transcript,
      new Date('2026-08-28T00:00:00.000Z'),
    )
    const job = repo.createJob({
      candidateId: transcript.candidate_id,
      transcriptId: storedTranscript.id,
      idempotencyKey: null,
      requestHash: 'canonical-corruption',
    })
    advanceToValidating(repo, job.id)
    const model = repo.saveModel({
      candidateId: transcript.candidate_id,
      jobId: job.id,
      canonicalModel,
      uiModel,
      critic: null,
      status: 'unresolved',
    })
    const db = new Database(dbPath)
    db.prepare(
      'UPDATE candidate_models SET canonical_json = ? WHERE id = ?',
    ).run('{"working_archetype":42}', model.id)
    db.close()

    expectRepositoryCode(() => repo.getModel(model.id), 'CORRUPT_STORED_JSON')
  })

  it('deletes candidate models without deleting their Transcript', () => {
    const storedTranscript = repo.createTranscript(
      transcript,
      new Date('2026-08-28T00:00:00.000Z'),
    )
    const job = repo.createJob({
      candidateId: transcript.candidate_id,
      transcriptId: storedTranscript.id,
      idempotencyKey: null,
      requestHash: 'hash-1',
    })
    advanceToValidating(repo, job.id)
    const model = repo.saveModel({
      candidateId: transcript.candidate_id,
      jobId: job.id,
      canonicalModel,
      uiModel,
      critic: null,
      status: 'unresolved',
    })

    expect(repo.deleteModelsByCandidate(transcript.candidate_id)).toBe(1)
    expectRepositoryCode(() => repo.getModel(model.id), 'NOT_FOUND')
    expect(repo.getTranscript(storedTranscript.id).transcript).toEqual(
      transcript,
    )
  })

  it('deletes only expired unreferenced transcripts', () => {
    const expired = repo.createTranscript(
      { ...transcript, candidate_id: 'expired' },
      new Date('2026-08-20T00:00:00.000Z'),
    )
    const retained = repo.createTranscript(
      { ...transcript, candidate_id: 'retained' },
      new Date('2026-08-22T00:00:00.000Z'),
    )

    expect(
      repo.deleteExpiredTranscripts(new Date('2026-08-21T00:00:00.000Z')),
    ).toBe(1)
    expectRepositoryCode(() => repo.getTranscript(expired.id), 'NOT_FOUND')
    expect(repo.getTranscript(retained.id).id).toBe(retained.id)
  })

  it('deletes expired terminal-job transcripts but retains active-job transcripts', () => {
    const expiredAt = new Date('2026-08-20T00:00:00.000Z')
    const terminalTranscript = repo.createTranscript(
      { ...transcript, candidate_id: 'terminal-candidate' },
      expiredAt,
    )
    const activeTranscript = repo.createTranscript(
      { ...transcript, candidate_id: 'active-candidate' },
      expiredAt,
    )
    const terminalJob = repo.createJob({
      candidateId: 'terminal-candidate',
      transcriptId: terminalTranscript.id,
      idempotencyKey: null,
      requestHash: 'terminal-hash',
    })
    const activeJob = repo.createJob({
      candidateId: 'active-candidate',
      transcriptId: activeTranscript.id,
      idempotencyKey: null,
      requestHash: 'active-hash',
    })
    repo.updateJobStatus(terminalJob.id, 'parsing')
    repo.updateJobStatus(terminalJob.id, 'failed')

    expect(
      repo.deleteExpiredTranscripts(new Date('2026-08-21T00:00:00.000Z')),
    ).toBe(1)
    expectRepositoryCode(
      () => repo.getTranscript(terminalTranscript.id),
      'NOT_FOUND',
    )
    expect(repo.getJob(terminalJob.id).transcriptId).toBeNull()
    expect(repo.getTranscript(activeTranscript.id).id).toBe(activeTranscript.id)
    expect(repo.getJob(activeJob.id).transcriptId).toBe(activeTranscript.id)
  })

  it('round-trips provider metadata without content fields', () => {
    const storedTranscript = repo.createTranscript(
      transcript,
      new Date('2026-08-28T00:00:00.000Z'),
    )
    const job = repo.createJob({
      candidateId: transcript.candidate_id,
      transcriptId: storedTranscript.id,
      idempotencyKey: null,
      requestHash: 'hash-1',
    })

    const call = repo.recordProviderCall({
      jobId: job.id,
      providerRequestId: 'provider-request',
      providerResponseId: 'provider-response',
      stage: 'inferring',
      model: 'openai.gpt-5.6-sol',
      reasoningEffort: 'high',
      status: 'completed',
      startedAt: new Date('2026-08-21T06:00:00.000Z'),
      endedAt: new Date('2026-08-21T06:00:01.200Z'),
      wallMs: 1200,
      inputTokens: 20,
      outputTokens: 10,
      reasoningTokens: 5,
      incompleteDetails: null,
      errorCode: null,
    })

    expect(call).toMatchObject({
      jobId: job.id,
      providerRequestId: 'provider-request',
      wallMs: 1200,
      inputTokens: 20,
    })
    expect(Object.keys(call)).not.toEqual(
      expect.arrayContaining([
        'apiKey',
        'prompt',
        'transcript',
        'requestBody',
        'responseBody',
      ]),
    )
  })

  it('persists provider metadata without a job id', () => {
    const call = repo.recordProviderCall({
      jobId: null,
      providerRequestId: 'provider-request-jobless',
      providerResponseId: 'provider-response-jobless',
      stage: 'extractor',
      model: 'openai.gpt-5.6-sol',
      reasoningEffort: 'high',
      status: 'failed',
      startedAt: new Date('2026-08-21T06:00:00.000Z'),
      endedAt: new Date('2026-08-21T06:00:00.100Z'),
      wallMs: 100,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      incompleteDetails: null,
      errorCode: 'network_error',
    })

    const db = new Database(dbPath, { readonly: true })
    const stored = db
      .prepare('SELECT job_id, error_code FROM provider_calls WHERE id = ?')
      .get(call.id)
    db.close()

    expect(call.jobId).toBeNull()
    expect(stored).toEqual({ job_id: null, error_code: 'network_error' })
  })

  it('enforces foreign keys', () => {
    expect(() =>
      repo.createJob({
        candidateId: transcript.candidate_id,
        transcriptId: 'tr_missing',
        idempotencyKey: null,
        requestHash: 'hash-1',
      }),
    ).toThrow(/FOREIGN KEY/)
  })

  it('rejects access after close', () => {
    repo.close()

    expect(() => repo.getJob('job_missing')).toThrow()
  })
})
