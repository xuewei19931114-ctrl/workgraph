import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'

import { CandidateModelSchema } from '../../../shared/profile-schemas.js'
import { UiCandidateModelSchema } from '../../../shared/ui-model.js'
import { buildApp } from '../../src/app.js'
import type { ServerConfig } from '../../src/config.js'
import {
  createRepository,
  RepositoryError,
} from '../../src/db/repository.js'
import type { JobManager } from '../../src/jobs/job-manager.js'
import {
  canonicalRequestHash,
  commitCreatedJob,
} from '../../src/routes/profile.js'

const config: ServerConfig = {
  host: '127.0.0.1',
  port: 8787,
  baseUrl: 'https://example.test/v1',
  apiKey: 'never-used',
  model: 'openai.gpt-5.6-sol',
  reasoningEffort: 'high',
  timeoutMs: 30_000,
  maxOutputTokens: 64000,
  contextTokenLimit: 100_000,
  extractorConcurrency: 2,
  enableCritic: false,
  dbPath: ':memory:',
  transcriptRetentionDays: 7,
  bodyLimit: 1_000,
}

const transcript = {
  candidate_id: 'candidate-1',
  source_type: 'test',
  conversations: [
    {
      conversation_id: 'conversation-1',
      title: 'Test',
      messages: [
        {
          message_id: 'message-1',
          role: 'user',
          content: 'A safe test transcript.',
          timestamp: null,
          authorship: 'user',
        },
      ],
    },
  ],
}

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
  sourceLabel: 'test',
  unknownCount: 1,
  dimensions: [],
  cannotProve: [],
  capabilities: [],
  strengths: [],
  risks: [],
  riskNote: 'Unknown is not weakness.',
  roles: [],
  nextQuestions: [],
})

function request(candidateId = 'candidate-1') {
  return {
    candidateId,
    transcript: { ...transcript, candidate_id: candidateId },
    options: { enableCritic: false },
  }
}

function fakeManager(repository: ReturnType<typeof createRepository>) {
  const starts: string[] = []
  const cancels: string[] = []
  return {
    starts,
    cancels,
    start(jobId: string) {
      starts.push(jobId)
    },
    isRunning() {
      return false
    },
    recoverAfterRestart() {
      return 0
    },
    async shutdown() {},
    async cancel(jobId: string) {
      cancels.push(jobId)
      const current = repository.getJob(jobId)
      if (
        ['completed', 'unresolved', 'failed', 'cancelled'].includes(
          current.status,
        )
      ) {
        return {
          jobId,
          status: current.status,
          progress: current.progress,
          stageMessage: current.stageMessage,
          modelId: current.modelId,
          criticVerdict: current.criticVerdict,
          error: null,
        }
      }
      const cancelled = repository.updateJobStatus(jobId, 'cancelled', {
        errorCode: 'CANCELLED',
        errorMessage: 'Profile inference was cancelled.',
      })
      return {
        jobId,
        status: cancelled.status,
        progress: cancelled.progress,
        stageMessage: cancelled.stageMessage,
        modelId: cancelled.modelId,
        criticVerdict: cancelled.criticVerdict,
        error: {
          code: 'CANCELLED',
          message: 'Profile inference was cancelled.',
        },
      }
    },
  }
}

describe('profile routes', () => {
  let app: FastifyInstance | undefined
  let repository: ReturnType<typeof createRepository> | undefined

  afterEach(async () => {
    await app?.close()
    repository?.close()
  })

  async function setup(overrides: Partial<ServerConfig> = {}) {
    repository = createRepository(':memory:')
    const manager = fakeManager(repository)
    app = await buildApp({
      config: { ...config, ...overrides },
      repository,
      jobManager: manager as JobManager,
    })
    return { app, repository, manager }
  }

  it('POST creates a queued job and starts it after returning 202', async () => {
    const fixture = await setup()
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/api/profile/jobs',
      payload: request(),
    })

    expect(response.statusCode).toBe(202)
    expect(response.json()).toMatchObject({ status: 'queued' })
    expect(fixture.manager.starts).toEqual([response.json().jobId])
  })

  it('cancels a newly started job when the client disconnects before 202', async () => {
    const started: string[] = []
    const cancelled: string[] = []
    const manager = {
      start(jobId: string) {
        started.push(jobId)
      },
      async cancel(jobId: string) {
        cancelled.push(jobId)
        return { jobId, status: 'cancelled' as const }
      },
    }

    await expect(
      commitCreatedJob(true, 'job-new', true, manager),
    ).resolves.toBe('cancelled')
    expect(started).toEqual(['job-new'])
    expect(cancelled).toEqual(['job-new'])

    await expect(
      commitCreatedJob(false, 'job-existing', true, manager),
    ).resolves.toBe('reused')
    expect(started).toEqual(['job-new'])
  })

  it('rejects invalid Transcript with a stable redacted error', async () => {
    const fixture = await setup()
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/api/profile/jobs',
      payload: {
        ...request(),
        transcript: { candidate_id: 'candidate-1', conversations: [] },
      },
    })

    expect(response.statusCode).toBe(400)
    expect(response.json()).toEqual({
      error: {
        code: 'INVALID_TRANSCRIPT',
        message: 'The profile job request is invalid.',
      },
    })
    expect(response.body).not.toContain('conversations')
  })

  it('reuses the same idempotent request without another Transcript or start', async () => {
    const fixture = await setup()
    const first = await fixture.app.inject({
      method: 'POST',
      url: '/api/profile/jobs',
      headers: { 'idempotency-key': 'same-request' },
      payload: request(),
    })
    const second = await fixture.app.inject({
      method: 'POST',
      url: '/api/profile/jobs',
      headers: { 'idempotency-key': 'same-request' },
      payload: JSON.parse(JSON.stringify(request())),
    })

    expect(second.statusCode).toBe(202)
    expect(second.json()).toEqual(first.json())
    expect(fixture.manager.starts).toHaveLength(1)
    const stored = fixture.repository.getJob(first.json().jobId)
    expect(fixture.repository.getTranscript(stored.transcriptId!).id).toBe(
      stored.transcriptId,
    )
  })

  it('returns 409 when an idempotency key is reused with another body', async () => {
    const fixture = await setup()
    await fixture.app.inject({
      method: 'POST',
      url: '/api/profile/jobs',
      headers: { 'idempotency-key': 'conflict' },
      payload: request(),
    })
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/api/profile/jobs',
      headers: { 'idempotency-key': 'conflict' },
      payload: request('candidate-2'),
    })

    expect(response.statusCode).toBe(409)
    expect(response.json()).toEqual({
      error: {
        code: 'IDEMPOTENCY_CONFLICT',
        message: 'The idempotency key was used for another request.',
      },
    })
  })

  it('maps requests over the configured body limit to 413', async () => {
    const fixture = await setup({ bodyLimit: 100 })
    const response = await fixture.app.inject({
      method: 'POST',
      url: '/api/profile/jobs',
      payload: request(),
    })

    expect(response.statusCode).toBe(413)
    expect(response.json()).toEqual({
      error: {
        code: 'TRANSCRIPT_TOO_LARGE',
        message: 'The transcript exceeds the configured size limit.',
      },
    })
  })

  it('gets known jobs and returns 404 for unknown jobs', async () => {
    const fixture = await setup()
    const created = await fixture.app.inject({
      method: 'POST',
      url: '/api/profile/jobs',
      payload: request(),
    })
    const known = await fixture.app.inject({
      method: 'GET',
      url: `/api/profile/jobs/${created.json().jobId}`,
    })
    const unknown = await fixture.app.inject({
      method: 'GET',
      url: '/api/profile/jobs/job-missing',
    })

    expect(known.statusCode).toBe(200)
    expect(known.json()).toMatchObject({ status: 'queued', error: null })
    expect(unknown.statusCode).toBe(404)
    expect(unknown.json().error.code).toBe('JOB_NOT_FOUND')
    expect(fixture.manager.cancels).toEqual([])
  })

  it('DELETE cancels a live job idempotently and returns 404 for unknown jobs', async () => {
    const fixture = await setup()
    const created = await fixture.app.inject({
      method: 'POST',
      url: '/api/profile/jobs',
      payload: request(),
    })
    const url = `/api/profile/jobs/${created.json().jobId}`

    expect((await fixture.app.inject({ method: 'DELETE', url })).json()).toMatchObject(
      { status: 'cancelled' },
    )
    expect((await fixture.app.inject({ method: 'DELETE', url })).json()).toMatchObject(
      { status: 'cancelled' },
    )
    const missing = await fixture.app.inject({
      method: 'DELETE',
      url: '/api/profile/jobs/job-missing',
    })
    expect(missing.statusCode).toBe(404)
    expect(missing.json().error.code).toBe('JOB_NOT_FOUND')
  })

  it('sanitizes raw persisted errors returned through DELETE', async () => {
    const fixture = await setup()
    fixture.manager.cancel = async (jobId: string) => ({
      jobId,
      status: 'failed',
      progress: 0,
      stageMessage: '',
      modelId: null,
      criticVerdict: null,
      error: {
        code: 'UNKNOWN_DATABASE_ERROR',
        message: 'SECRET persisted error_message',
      },
    })

    const response = await fixture.app.inject({
      method: 'DELETE',
      url: '/api/profile/jobs/job-raw-error',
    })

    expect(response.statusCode).toBe(500)
    expect(response.json().error).toEqual({
      code: 'UNKNOWN_DATABASE_ERROR',
      message: 'Profile inference failed.',
    })
    expect(response.body).not.toContain('SECRET')
  })

  it('hashes object keys by Unicode code point independent of insertion order', () => {
    const lowerCodePoint = '\uE000'
    const higherCodePoint = '𐀀'
    const left = {
      [higherCodePoint]: 2,
      [lowerCodePoint]: 1,
    }
    const right = {
      [lowerCodePoint]: 1,
      [higherCodePoint]: 2,
    }
    const expected = createHash('sha256')
      .update(`{"${lowerCodePoint}":1,"${higherCodePoint}":2}`)
      .digest('hex')

    expect(canonicalRequestHash(left)).toBe(expected)
    expect(canonicalRequestHash(right)).toBe(expected)
  })

  it('gets unknown models and model deletion preserves Transcript and job', async () => {
    const fixture = await setup()
    const created = await fixture.app.inject({
      method: 'POST',
      url: '/api/profile/jobs',
      payload: request(),
    })
    const job = fixture.repository.getJob(created.json().jobId)
    const missing = await fixture.app.inject({
      method: 'GET',
      url: '/api/profile/models/model-missing',
    })
    const deleted = await fixture.app.inject({
      method: 'DELETE',
      url: '/api/profile/models?candidateId=candidate-1',
    })

    expect(missing.statusCode).toBe(404)
    expect(missing.json().error.code).toBe('MODEL_NOT_FOUND')
    expect(deleted.statusCode).toBe(200)
    expect(deleted.json()).toEqual({ deleted: 0 })
    expect(fixture.repository.getJob(job.id).id).toBe(job.id)
    expect(fixture.repository.getTranscript(job.transcriptId!).id).toBe(
      job.transcriptId,
    )
  })

  it('returns a known canonical and UI model', async () => {
    const fixture = await setup()
    const job = fixture.repository.createOrGetProfileJob({
      candidateId: 'candidate-1',
      transcript,
      retentionDate: new Date('2026-08-28T00:00:00.000Z'),
      idempotencyKey: null,
      requestHash: 'known-model',
      options: { enableCritic: false },
    }).job
    fixture.repository.updateJobStatus(job.id, 'parsing')
    fixture.repository.updateJobStatus(job.id, 'inferring')
    fixture.repository.updateJobStatus(job.id, 'validating')
    const model = fixture.repository.saveModel({
      candidateId: 'candidate-1',
      jobId: job.id,
      canonicalModel,
      uiModel,
      critic: null,
      status: 'unresolved',
    })

    const response = await fixture.app.inject({
      method: 'GET',
      url: `/api/profile/models/${model.id}`,
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      candidateModel: canonicalModel,
      uiModel,
      critic: null,
      status: 'unresolved',
    })
  })

  it('never exposes repository messages or stack traces', async () => {
    const fixture = await setup()
    const original = fixture.repository.getJob
    fixture.repository.getJob = () => {
      throw new RepositoryError('CORRUPT_STORED_JSON', 'SECRET sqlite detail')
    }
    const response = await fixture.app.inject({
      method: 'GET',
      url: '/api/profile/jobs/job-1',
    })
    fixture.repository.getJob = original

    expect(response.statusCode).toBe(500)
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred.',
      },
    })
    expect(response.body).not.toContain('SECRET')
    expect(response.body).not.toContain('stack')
  })

  it.each([
    ['MODEL_POLICY_VIOLATION', 422],
    ['CANCELLED', 499],
    ['PROVIDER_NETWORK_ERROR', 502],
    ['PROVIDER_TIMEOUT', 504],
  ] as const)('maps persisted %s failures to HTTP %s', async (code, status) => {
    const fixture = await setup()
    const created = fixture.repository.createOrGetProfileJob({
      candidateId: 'candidate-1',
      transcript,
      retentionDate: new Date('2026-08-28T00:00:00.000Z'),
      idempotencyKey: null,
      requestHash: code,
      options: { enableCritic: false },
    }).job
    if (code === 'CANCELLED') {
      fixture.repository.updateJobStatus(created.id, 'cancelled', {
        errorCode: code,
        errorMessage: 'SECRET raw message',
      })
    } else {
      fixture.repository.updateJobStatus(created.id, 'parsing')
      fixture.repository.updateJobStatus(created.id, 'failed', {
        errorCode: code,
        errorMessage: 'SECRET raw message',
      })
    }

    const response = await fixture.app.inject({
      method: 'GET',
      url: `/api/profile/jobs/${created.id}`,
    })

    expect(response.statusCode).toBe(status)
    expect(response.json().error.code).toBe(code)
    expect(response.body).not.toContain('SECRET')
  })
})
