import type { ProfileJob } from '../../../shared/profile-schemas.js'
import { ProfileJobSchema } from '../../../shared/profile-schemas.js'
import type { ProfileRepository, StoredJob } from '../db/repository.js'
import type {
  PipelineInput,
  PipelineResult,
} from '../inference/pipeline.js'
import type { StageLogger } from '../inference/stage-log.js'

const TERMINAL = new Set(['completed', 'unresolved', 'failed', 'cancelled'])
const SAFE_ERROR_MESSAGES: Readonly<Record<string, string>> = {
  CANCELLED: 'Profile inference was cancelled.',
  SERVER_RESTARTED: 'Profile inference stopped because the server restarted.',
  SERVER_SHUTTING_DOWN: 'Profile inference was not started because the server is shutting down.',
  MODEL_POLICY_VIOLATION: 'The generated profile violated model policy.',
  PROVIDER_TIMEOUT: 'The profile provider timed out.',
  PROVIDER_NETWORK_ERROR: 'The profile provider could not be reached.',
  PROVIDER_UNAVAILABLE: 'The profile provider is unavailable.',
  PROVIDER_REJECTED: 'The profile provider rejected the request.',
  PROVIDER_INVALID_RESPONSE: 'The profile provider returned an invalid response.',
  PROVIDER_INVALID_OUTPUT: 'The profile provider returned invalid output.',
  PROVIDER_INCOMPLETE: 'The profile provider returned incomplete output.',
  INTERNAL_ERROR: 'Profile inference failed.',
}

export type ProfilePipeline = (input: PipelineInput) => Promise<PipelineResult>

export interface JobManager {
  start(jobId: string): void
  cancel(jobId: string): Promise<ProfileJob>
  isRunning(jobId: string): boolean
  recoverAfterRestart(): number
  shutdown(): Promise<void>
}

interface LiveJob {
  controller: AbortController
  promise: Promise<void>
}

export function toSafeProfileJob(job: StoredJob | ProfileJob): ProfileJob {
  const stored = 'id' in job
  const errorCode = stored ? job.errorCode : job.error?.code ?? null
  return ProfileJobSchema.parse({
    jobId: stored ? job.id : job.jobId,
    status: job.status,
    progress: job.progress,
    stageMessage: job.stageMessage,
    modelId: job.modelId,
    criticVerdict: job.criticVerdict,
    error:
      errorCode === null
        ? null
        : {
            code: errorCode,
            message:
              SAFE_ERROR_MESSAGES[errorCode] ?? 'Profile inference failed.',
          },
  })
}

export function createJobManager(dependencies: {
  repository: ProfileRepository
  pipeline: ProfilePipeline
  reportError?: (error: unknown) => void
  enableCritic?: boolean
  log?: StageLogger
  keepAlive?: (promise: Promise<void>) => void
}): JobManager {
  const {
    repository,
    pipeline,
    reportError = () => undefined,
    enableCritic: enableCriticByDefault = false,
    log,
    keepAlive,
  } = dependencies
  const live = new Map<string, LiveJob>()
  let shuttingDown = false

  function reportSafely(error: unknown): void {
    try {
      reportError(error)
    } catch {
      // Error reporting must never reject an internally tracked promise.
    }
  }

  function start(jobId: string): void {
    if (live.has(jobId)) return
    if (shuttingDown) {
      try {
        const current = repository.getJob(jobId)
        if (!TERMINAL.has(current.status)) {
          repository.updateJobStatus(jobId, 'failed', {
            errorCode: 'SERVER_SHUTTING_DOWN',
            errorMessage:
              'Profile inference was not started because the server is shutting down.',
          })
        }
      } catch (error) {
        reportSafely(error)
      }
      return
    }
    const job = repository.getJob(jobId)
    if (TERMINAL.has(job.status) || job.transcriptId === null) return
    log?.(`[profile] job=${jobId} queued start`)
    const transcript = repository.getTranscript(job.transcriptId).transcript
    const controller = new AbortController()
    const run = async () => {
      try {
        await pipeline({
          jobId,
          candidateId: job.candidateId,
          transcript,
          enableCritic: enableCriticByDefault || job.options.enableCritic,
          signal: controller.signal,
        })
        const current = repository.getJob(jobId)
        if (controller.signal.aborted && !TERMINAL.has(current.status)) {
          repository.updateJobStatus(jobId, 'cancelled', {
            errorCode: 'CANCELLED',
            errorMessage: 'Profile inference was cancelled.',
          })
        }
      } catch (error) {
        let persistenceFailed = false
        try {
          const current = repository.getJob(jobId)
          if (!TERMINAL.has(current.status)) {
            const cancelled = controller.signal.aborted
            repository.updateJobStatus(
              jobId,
              cancelled ? 'cancelled' : 'failed',
              {
                errorCode: cancelled ? 'CANCELLED' : 'INTERNAL_ERROR',
                errorMessage: cancelled
                  ? 'Profile inference was cancelled.'
                  : 'Profile inference failed.',
              },
            )
          }
        } catch (persistenceError) {
          persistenceFailed = true
          reportSafely(persistenceError)
        }
        if (!controller.signal.aborted && !persistenceFailed) {
          reportSafely(error)
        }
      } finally {
        live.delete(jobId)
      }
    }
    const promise = run().catch(reportSafely)
    live.set(jobId, { controller, promise })
    keepAlive?.(promise)
  }

  async function cancel(jobId: string): Promise<ProfileJob> {
    const before = repository.getJob(jobId)
    if (TERMINAL.has(before.status)) return toSafeProfileJob(before)
    const handle = live.get(jobId)
    if (handle !== undefined) {
      handle.controller.abort(new Error('Profile inference was cancelled.'))
      await handle.promise
    }
    const after = repository.getJob(jobId)
    if (!TERMINAL.has(after.status)) {
      return toSafeProfileJob(
        repository.updateJobStatus(jobId, 'cancelled', {
          errorCode: 'CANCELLED',
          errorMessage: 'Profile inference was cancelled.',
        }),
      )
    }
    return toSafeProfileJob(after)
  }

  return {
    start,
    cancel,
    isRunning(jobId) {
      return live.has(jobId)
    },
    recoverAfterRestart() {
      const jobs = repository.listNonterminalJobs()
      for (const job of jobs) {
        repository.updateJobStatus(job.id, 'failed', {
          errorCode: 'SERVER_RESTARTED',
          errorMessage: 'Profile inference stopped because the server restarted.',
        })
      }
      return jobs.length
    },
    async shutdown() {
      shuttingDown = true
      const handles = [...live.values()]
      handles.forEach(({ controller }) =>
        controller.abort(new Error('Server is shutting down.')),
      )
      await Promise.allSettled(handles.map(({ promise }) => promise))
    },
  }
}
