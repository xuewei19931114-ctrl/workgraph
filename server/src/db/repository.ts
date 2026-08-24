import Database from 'better-sqlite3'
import { createHash, randomUUID } from 'node:crypto'

import {
  CandidateModelSchema,
  ProfileModelResponseSchema,
  TranscriptSchema,
  type CandidateModel,
  type ProfileModelResponse,
  type Transcript,
} from '../../../shared/profile-schemas.js'
import {
  UiCandidateModelSchema,
  type UiCandidateModel,
} from '../../../shared/ui-model.js'
import { runMigrations } from './migrate.js'
import { stageFieldsForStatus, type JobStatus } from './job-stage.js'

export type { JobStatus }
export type RepositoryErrorCode =
  | 'IDEMPOTENCY_CONFLICT'
  | 'INVALID_STATUS_TRANSITION'
  | 'NOT_FOUND'
  | 'CORRUPT_STORED_JSON'

export class RepositoryError extends Error {
  readonly code: RepositoryErrorCode

  constructor(code: RepositoryErrorCode, message: string) {
    super(message)
    this.name = 'RepositoryError'
    this.code = code
  }
}

export interface StoredTranscript {
  id: string
  candidateId: string
  sourceType: string
  transcript: Transcript
  contentHash: string
  createdAt: Date
  expiresAt: Date
}

export interface StoredJob {
  id: string
  candidateId: string
  transcriptId: string | null
  idempotencyKey: string | null
  requestHash: string
  options: { enableCritic: boolean }
  status: JobStatus
  progress: number
  stageMessage: string
  modelId: string | null
  criticVerdict: 'pass' | 'unresolved' | 'revise' | null
  errorCode: string | null
  errorMessage: string | null
  createdAt: Date
  updatedAt: Date
}

export interface StoredModel {
  id: string
  candidateId: string
  jobId: string
  canonicalModel: CandidateModel
  uiModel: UiCandidateModel
  critic: ProfileModelResponse['critic']
  status: ProfileModelResponse['status']
  createdAt: Date
}

export interface ProviderCall {
  id: string
  jobId: string | null
  providerRequestId: string | null
  providerResponseId: string | null
  stage: string
  model: string
  reasoningEffort: string | null
  status: string
  startedAt: Date
  endedAt: Date | null
  wallMs: number | null
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  incompleteDetails: string | null
  errorCode: string | null
}

export interface ProfileRepository {
  createOrGetProfileJob(input: {
    candidateId: string
    transcript: Transcript
    retentionDate: Date
    idempotencyKey: string | null
    requestHash: string
    options: { enableCritic: boolean }
  }): { job: StoredJob; created: boolean }
  createTranscript(transcript: Transcript, retentionDate: Date): StoredTranscript
  getTranscript(id: string): StoredTranscript
  createJob(input: {
    candidateId: string
    transcriptId: string
    idempotencyKey: string | null
    requestHash: string
    options?: { enableCritic: boolean }
  }): StoredJob
  findIdempotentJob(
    idempotencyKey: string,
    requestHash: string,
  ): StoredJob | null
  updateJobStatus(
    id: string,
    status: JobStatus,
    details?: {
      progress?: number
      stageMessage?: string
      criticVerdict?: StoredJob['criticVerdict']
      errorCode?: string | null
      errorMessage?: string | null
    },
  ): StoredJob
  getJob(id: string): StoredJob
  listNonterminalJobs(): StoredJob[]
  saveModel(input: {
    candidateId: string
    jobId: string
    canonicalModel: CandidateModel
    uiModel: UiCandidateModel
    critic: ProfileModelResponse['critic']
    status: ProfileModelResponse['status']
  }): StoredModel
  getModel(id: string): StoredModel
  deleteModelsByCandidate(candidateId: string): number
  recordProviderCall(input: Omit<ProviderCall, 'id'>): ProviderCall
  deleteExpiredTranscripts(now: Date): number
  close(): void
}

interface TranscriptRow {
  id: string
  candidate_id: string
  source_type: string
  content_json: string
  content_hash: string
  created_at: string
  expires_at: string
}

interface JobRow {
  id: string
  candidate_id: string
  transcript_id: string | null
  idempotency_key: string | null
  request_hash: string
  options_json: string
  status: JobStatus
  progress: number
  stage_message: string
  model_id: string | null
  critic_verdict: StoredJob['criticVerdict']
  error_code: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

interface ModelRow {
  id: string
  candidate_id: string
  job_id: string
  canonical_json: string
  ui_json: string
  critic_json: string | null
  created_at: string
  status: JobStatus
}

const allowedTransitions: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  queued: ['parsing', 'failed', 'cancelled'],
  parsing: ['inferring', 'extracting', 'failed', 'cancelled'],
  extracting: ['inferring', 'failed', 'cancelled'],
  inferring: ['criticizing', 'validating', 'unresolved', 'failed', 'cancelled'],
  criticizing: ['validating', 'unresolved', 'failed', 'cancelled'],
  validating: ['completed', 'unresolved', 'failed', 'cancelled'],
  completed: [],
  unresolved: [],
  failed: [],
  cancelled: [],
}

function makeId(prefix: 'tr' | 'job' | 'model' | 'pc'): string {
  return `${prefix}_${randomUUID().replaceAll('-', '')}`
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value)
  } catch {
    throw new RepositoryError(
      'CORRUPT_STORED_JSON',
      'Stored JSON is malformed.',
    )
  }
}

function parseTranscriptRow(row: TranscriptRow): StoredTranscript {
  const parsed = TranscriptSchema.safeParse(parseJson(row.content_json))
  if (!parsed.success) {
    throw new RepositoryError(
      'CORRUPT_STORED_JSON',
      'Stored Transcript does not match its schema.',
    )
  }
  return {
    id: row.id,
    candidateId: row.candidate_id,
    sourceType: row.source_type,
    transcript: parsed.data,
    contentHash: row.content_hash,
    createdAt: new Date(row.created_at),
    expiresAt: new Date(row.expires_at),
  }
}

function parseJobRow(row: JobRow): StoredJob {
  const options = parseJson(row.options_json)
  if (
    typeof options !== 'object' ||
    options === null ||
    !('enableCritic' in options) ||
    typeof options.enableCritic !== 'boolean'
  ) {
    throw new RepositoryError(
      'CORRUPT_STORED_JSON',
      'Stored job options do not match their schema.',
    )
  }
  return {
    id: row.id,
    candidateId: row.candidate_id,
    transcriptId: row.transcript_id,
    idempotencyKey: row.idempotency_key,
    requestHash: row.request_hash,
    options: { enableCritic: options.enableCritic },
    status: row.status,
    progress: row.progress,
    stageMessage: row.stage_message,
    modelId: row.model_id,
    criticVerdict: row.critic_verdict,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }
}

export function createRepository(dbPath: string): ProfileRepository {
  const db = new Database(dbPath)
  let closed = false

  try {
    db.pragma('foreign_keys = ON')
    if (dbPath !== ':memory:') {
      db.pragma('journal_mode = WAL')
    }
    runMigrations(db)
  } catch (error) {
    try {
      db.close()
    } catch {
      // Preserve the initialization error.
    }
    throw error
  }

  function ensureOpen(): void {
    if (closed) {
      throw new Error('Repository is closed.')
    }
  }

  function getJob(id: string): StoredJob {
    ensureOpen()
    const row = db
      .prepare('SELECT * FROM analysis_jobs WHERE id = ?')
      .get(id) as JobRow | undefined
    if (!row) {
      throw new RepositoryError('NOT_FOUND', `Job ${id} was not found.`)
    }
    return parseJobRow(row)
  }

  function updateJobStatus(
    id: string,
    status: JobStatus,
    details: {
      progress?: number
      stageMessage?: string
      criticVerdict?: StoredJob['criticVerdict']
      errorCode?: string | null
      errorMessage?: string | null
    } = {},
  ): StoredJob {
    ensureOpen()
    return db.transaction(() => {
      const current = getJob(id)
      if (!allowedTransitions[current.status].includes(status)) {
        throw new RepositoryError(
          'INVALID_STATUS_TRANSITION',
          `Cannot transition job from ${current.status} to ${status}.`,
        )
      }
      const updatedAt = new Date().toISOString()
      const stage = stageFieldsForStatus(status, current.progress)
      db.prepare(
        `UPDATE analysis_jobs
         SET status = ?, progress = ?, stage_message = ?,
             critic_verdict = ?, error_code = ?, error_message = ?,
             updated_at = ?
         WHERE id = ?`,
      ).run(
        status,
        details.progress ?? stage.progress,
        details.stageMessage ?? stage.stageMessage,
        details.criticVerdict ?? current.criticVerdict,
        details.errorCode ?? current.errorCode,
        details.errorMessage ?? current.errorMessage,
        updatedAt,
        id,
      )
      return getJob(id)
    }).immediate()
  }

  return {
    createOrGetProfileJob(input) {
      ensureOpen()
      return db.transaction(() => {
        if (input.idempotencyKey !== null) {
          const existing = db
            .prepare('SELECT * FROM analysis_jobs WHERE idempotency_key = ?')
            .get(input.idempotencyKey) as JobRow | undefined
          if (existing) {
            if (existing.request_hash !== input.requestHash) {
              throw new RepositoryError(
                'IDEMPOTENCY_CONFLICT',
                'Idempotency key was already used for a different request.',
              )
            }
            return { job: parseJobRow(existing), created: false }
          }
        }

        const parsed = TranscriptSchema.parse(input.transcript)
        const contentJson = JSON.stringify(parsed)
        const now = new Date().toISOString()
        const transcriptId = makeId('tr')
        db.prepare(
          `INSERT INTO transcripts
           (id, candidate_id, source_type, content_json, content_hash,
            created_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          transcriptId,
          parsed.candidate_id,
          parsed.source_type,
          contentJson,
          createHash('sha256').update(contentJson).digest('hex'),
          now,
          input.retentionDate.toISOString(),
        )
        const jobId = makeId('job')
        const queued = stageFieldsForStatus('queued', 0)
        db.prepare(
          `INSERT INTO analysis_jobs
           (id, candidate_id, transcript_id, idempotency_key, request_hash,
            status, progress, stage_message, options_json, model_id,
            critic_verdict, error_code, error_message, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
        ).run(
          jobId,
          input.candidateId,
          transcriptId,
          input.idempotencyKey,
          input.requestHash,
          queued.progress,
          queued.stageMessage,
          JSON.stringify(input.options),
          now,
          now,
        )
        return { job: getJob(jobId), created: true }
      }).immediate()
    },

    createTranscript(value, retentionDate) {
      ensureOpen()
      const parsed = TranscriptSchema.parse(value)
      const contentJson = JSON.stringify(parsed)
      const now = new Date()
      const row: TranscriptRow = {
        id: makeId('tr'),
        candidate_id: parsed.candidate_id,
        source_type: parsed.source_type,
        content_json: contentJson,
        content_hash: createHash('sha256').update(contentJson).digest('hex'),
        created_at: now.toISOString(),
        expires_at: retentionDate.toISOString(),
      }
      db.prepare(
        `INSERT INTO transcripts
         (id, candidate_id, source_type, content_json, content_hash,
          created_at, expires_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        row.id,
        row.candidate_id,
        row.source_type,
        row.content_json,
        row.content_hash,
        row.created_at,
        row.expires_at,
      )
      return parseTranscriptRow(row)
    },

    getTranscript(id) {
      ensureOpen()
      const row = db
        .prepare('SELECT * FROM transcripts WHERE id = ?')
        .get(id) as TranscriptRow | undefined
      if (!row) {
        throw new RepositoryError(
          'NOT_FOUND',
          `Transcript ${id} was not found.`,
        )
      }
      return parseTranscriptRow(row)
    },

    createJob(input) {
      ensureOpen()
      const id = makeId('job')
      const now = new Date().toISOString()
      const queued = stageFieldsForStatus('queued', 0)
      try {
        db.prepare(
          `INSERT INTO analysis_jobs
           (id, candidate_id, transcript_id, idempotency_key, request_hash,
            status, progress, stage_message, options_json, model_id,
            critic_verdict, error_code, error_message, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 'queued', ?, ?, ?, NULL, NULL, NULL, NULL, ?, ?)`,
        ).run(
          id,
          input.candidateId,
          input.transcriptId,
          input.idempotencyKey,
          input.requestHash,
          queued.progress,
          queued.stageMessage,
          JSON.stringify(input.options ?? { enableCritic: false }),
          now,
          now,
        )
      } catch (error) {
        if (
          input.idempotencyKey !== null &&
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          error.code === 'SQLITE_CONSTRAINT_UNIQUE'
        ) {
          throw new RepositoryError(
            'IDEMPOTENCY_CONFLICT',
            'Idempotency key was inserted by a concurrent request.',
          )
        }
        throw error
      }
      return getJob(id)
    },

    findIdempotentJob(idempotencyKey, requestHash) {
      ensureOpen()
      const row = db
        .prepare('SELECT * FROM analysis_jobs WHERE idempotency_key = ?')
        .get(idempotencyKey) as JobRow | undefined
      if (!row) {
        return null
      }
      if (row.request_hash !== requestHash) {
        throw new RepositoryError(
          'IDEMPOTENCY_CONFLICT',
          'Idempotency key was already used for a different request.',
        )
      }
      return parseJobRow(row)
    },

    updateJobStatus,
    getJob,
    listNonterminalJobs() {
      ensureOpen()
      return (
        db
          .prepare(
            `SELECT * FROM analysis_jobs
             WHERE status NOT IN ('completed', 'unresolved', 'failed', 'cancelled')
             ORDER BY created_at`,
          )
          .all() as JobRow[]
      ).map(parseJobRow)
    },

    saveModel(input) {
      ensureOpen()
      const canonical = CandidateModelSchema.parse(input.canonicalModel)
      const ui = UiCandidateModelSchema.parse(input.uiModel)
      ProfileModelResponseSchema.parse({
        candidateModel: canonical,
        uiModel: ui,
        critic: input.critic,
        status: input.status,
      })

      const id = makeId('model')
      const createdAt = new Date().toISOString()
      db.transaction(() => {
        const job = getJob(input.jobId)
        if (job.candidateId !== input.candidateId) {
          throw new RepositoryError(
            'NOT_FOUND',
            `Job ${input.jobId} does not belong to the candidate.`,
          )
        }
        if (!allowedTransitions[job.status].includes(input.status)) {
          throw new RepositoryError(
            'INVALID_STATUS_TRANSITION',
            `Cannot transition job from ${job.status} to ${input.status}.`,
          )
        }
        db.prepare(
          `INSERT INTO candidate_models
           (id, candidate_id, job_id, canonical_json, ui_json, critic_json,
            created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          id,
          input.candidateId,
          input.jobId,
          JSON.stringify(canonical),
          JSON.stringify(ui),
          input.critic === null ? null : JSON.stringify(input.critic),
          createdAt,
        )
        const stage = stageFieldsForStatus(input.status, job.progress)
        db.prepare(
          `UPDATE analysis_jobs
           SET model_id = ?, status = ?, progress = ?, stage_message = ?,
               updated_at = ?
           WHERE id = ?`,
        ).run(id, input.status, stage.progress, stage.stageMessage, createdAt, input.jobId)
      }).immediate()
      return this.getModel(id)
    },

    getModel(id) {
      ensureOpen()
      const row = db
        .prepare(
          `SELECT candidate_models.*, analysis_jobs.status
           FROM candidate_models
           JOIN analysis_jobs ON analysis_jobs.id = candidate_models.job_id
           WHERE candidate_models.id = ?`,
        )
        .get(id) as ModelRow | undefined
      if (!row) {
        throw new RepositoryError('NOT_FOUND', `Model ${id} was not found.`)
      }
      const response = ProfileModelResponseSchema.safeParse({
        candidateModel: parseJson(row.canonical_json),
        uiModel: parseJson(row.ui_json),
        critic:
          row.critic_json === null ? null : parseJson(row.critic_json),
        status: row.status,
      })
      if (!response.success) {
        throw new RepositoryError(
          'CORRUPT_STORED_JSON',
          'Stored model JSON does not match its schemas.',
        )
      }
      return {
        id: row.id,
        candidateId: row.candidate_id,
        jobId: row.job_id,
        canonicalModel: response.data.candidateModel,
        uiModel: response.data.uiModel,
        critic: response.data.critic,
        status: response.data.status,
        createdAt: new Date(row.created_at),
      }
    },

    deleteModelsByCandidate(candidateId) {
      ensureOpen()
      return db
        .prepare('DELETE FROM candidate_models WHERE candidate_id = ?')
        .run(candidateId).changes
    },

    recordProviderCall(input) {
      ensureOpen()
      const call: ProviderCall = { id: makeId('pc'), ...input }
      db.prepare(
        `INSERT INTO provider_calls
         (id, job_id, provider_request_id, provider_response_id, stage, model,
          reasoning_effort, status, started_at, ended_at, wall_ms,
          input_tokens, output_tokens, reasoning_tokens, incomplete_details,
          error_code)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        call.id,
        call.jobId,
        call.providerRequestId,
        call.providerResponseId,
        call.stage,
        call.model,
        call.reasoningEffort,
        call.status,
        call.startedAt.toISOString(),
        call.endedAt?.toISOString() ?? null,
        call.wallMs,
        call.inputTokens,
        call.outputTokens,
        call.reasoningTokens,
        call.incompleteDetails,
        call.errorCode,
      )
      return call
    },

    deleteExpiredTranscripts(now) {
      ensureOpen()
      return db
        .prepare(
          `DELETE FROM transcripts
           WHERE expires_at <= ?
             AND NOT EXISTS (
               SELECT 1 FROM analysis_jobs
               WHERE analysis_jobs.transcript_id = transcripts.id
                 AND analysis_jobs.status NOT IN (
                   'completed', 'unresolved', 'failed', 'cancelled'
                 )
             )`,
        )
        .run(now.toISOString()).changes
    },

    close() {
      if (!closed) {
        db.close()
        closed = true
      }
    },
  }
}
