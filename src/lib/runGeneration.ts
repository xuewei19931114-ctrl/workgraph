import type { ProfileJob } from '../../shared/profile-schemas'

export interface AnalysisRun {
  readonly generation: number
  readonly idempotencyKey: string
  readonly controller: AbortController
  jobId: string | null
}

export function createRunGenerationCoordinator() {
  let generation = 0
  let active: AnalysisRun | null = null
  let retryIdempotencyKey: string | null = null

  return {
    start(createUuid: () => string): AnalysisRun | null {
      if (active) return null
      generation += 1
      active = {
        generation,
        idempotencyKey: retryIdempotencyKey ?? createUuid(),
        controller: new AbortController(),
        jobId: null,
      }
      return active
    },

    current(): AnalysisRun | null {
      return active
    },

    isCurrent(run: AnalysisRun): boolean {
      return active === run
    },

    commit(run: AnalysisRun, write: () => void): boolean {
      if (active !== run) return false
      write()
      return true
    },

    attachJob(run: AnalysisRun, jobId: string): boolean {
      if (active !== run) return false
      run.jobId = jobId
      return true
    },

    pauseForRetry(run: AnalysisRun, write?: () => void): boolean {
      if (active !== run) return false
      write?.()
      retryIdempotencyKey = run.idempotencyKey
      run.controller.abort()
      active = null
      return true
    },

    finish(run: AnalysisRun, write: () => void): boolean {
      if (active !== run) return false
      write()
      retryIdempotencyKey = null
      active = null
      return true
    },

    invalidate(): { jobId: string | null } {
      const jobId = active?.jobId ?? null
      generation += 1
      active?.controller.abort()
      active = null
      retryIdempotencyKey = null
      return { jobId }
    },

    async cancelCurrent(
      cancelServer: (jobId: string) => Promise<ProfileJob>,
    ): Promise<{
      run: AnalysisRun
      job: ProfileJob
      applied: boolean
    }> {
      const run = active
      if (!run?.jobId) {
        throw new Error('No active server job to cancel.')
      }
      const job = await cancelServer(run.jobId)
      if (active !== run) return { run, job, applied: false }

      run.controller.abort()
      retryIdempotencyKey = null
      active = null
      return { run, job, applied: true }
    },
  }
}

export type RunGenerationCoordinator = ReturnType<
  typeof createRunGenerationCoordinator
>
