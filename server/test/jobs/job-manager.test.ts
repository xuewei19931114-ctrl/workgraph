import { describe, expect, it, vi } from 'vitest'

import type {
  JobStatus,
  ProfileRepository,
  StoredJob,
  StoredTranscript,
} from '../../src/db/repository.js'
import {
  createJobManager,
  type ProfilePipeline,
} from '../../src/jobs/job-manager.js'

const terminal = new Set<JobStatus>([
  'completed',
  'unresolved',
  'failed',
  'cancelled',
])

function job(id: string, status: JobStatus = 'queued'): StoredJob {
  const now = new Date()
  return {
    id,
    candidateId: 'candidate-1',
    transcriptId: `tr-${id}`,
    idempotencyKey: null,
    requestHash: id,
    options: { enableCritic: false },
    status,
    progress: 0,
    stageMessage: '',
    modelId: null,
    criticVerdict: null,
    errorCode: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  }
}

function repository(initial: StoredJob[]) {
  const jobs = new Map(initial.map((value) => [value.id, value]))
  const updates: Array<{ id: string; status: JobStatus }> = []
  return {
    jobs,
    updates,
    getJob(id: string) {
      const value = jobs.get(id)
      if (!value) throw new Error('missing')
      return value
    },
    getTranscript(id: string) {
      return {
        id,
        candidateId: 'candidate-1',
        sourceType: 'test',
        contentHash: 'hash',
        createdAt: new Date(),
        expiresAt: new Date(),
        transcript: {
          candidate_id: 'candidate-1',
          source_type: 'test',
          conversations: [],
        },
      } satisfies StoredTranscript
    },
    updateJobStatus(id: string, status: JobStatus, details = {}) {
      const updated = { ...this.getJob(id), ...details, status }
      jobs.set(id, updated)
      updates.push({ id, status })
      return updated
    },
    listNonterminalJobs() {
      return [...jobs.values()].filter((value) => !terminal.has(value.status))
    },
  }
}

function deferredPipeline() {
  const calls: Array<{
    jobId: string
    enableCritic: boolean
    signal: AbortSignal
    settle: () => void
  }> = []
  const pipeline: ProfilePipeline = (input) =>
    new Promise((resolve) => {
      calls.push({
        jobId: input.jobId,
        enableCritic: input.enableCritic,
        signal: input.signal,
        settle: () =>
          resolve({
            status: input.signal.aborted ? 'cancelled' : 'completed',
            invariantIssues: [],
          }),
      })
    })
  return { pipeline, calls }
}

describe('JobManager', () => {
  it('starts a job once and removes its live handle after settlement', async () => {
    const repo = repository([job('job-1')])
    const fake = deferredPipeline()
    const manager = createJobManager({
      repository: repo as unknown as ProfileRepository,
      pipeline: fake.pipeline,
    })

    manager.start('job-1')
    manager.start('job-1')
    expect(fake.calls).toHaveLength(1)
    expect(manager.isRunning('job-1')).toBe(true)

    fake.calls[0]!.settle()
    await Promise.resolve()
    await Promise.resolve()
    expect(manager.isRunning('job-1')).toBe(false)
  })

  it('keeps the job promise alive for serverless runtimes', async () => {
    const repo = repository([job('job-1')])
    const fake = deferredPipeline()
    const kept: Array<Promise<void>> = []
    const manager = createJobManager({
      repository: repo as unknown as ProfileRepository,
      pipeline: fake.pipeline,
      keepAlive: (promise) => {
        kept.push(promise)
      },
    })

    manager.start('job-1')
    expect(kept).toHaveLength(1)

    fake.calls[0]!.settle()
    await kept[0]
    expect(manager.isRunning('job-1')).toBe(false)
  })

  it('observes rejection and persists a safe failure', async () => {
    const repo = repository([job('job-1')])
    const pipeline: ProfilePipeline = async () => {
      throw new Error('SECRET provider body')
    }
    const manager = createJobManager({
      repository: repo as unknown as ProfileRepository,
      pipeline,
    })

    manager.start('job-1')
    await new Promise<void>((resolve) => setImmediate(resolve))

    expect(repo.jobs.get('job-1')).toMatchObject({
      status: 'failed',
      errorCode: 'INTERNAL_ERROR',
      errorMessage: 'Profile inference failed.',
    })
    expect(JSON.stringify(repo.jobs.get('job-1'))).not.toContain('SECRET')
    expect(manager.isRunning('job-1')).toBe(false)
  })

  it('propagates cancellation and waits for pipeline settlement', async () => {
    const repo = repository([job('job-1')])
    const fake = deferredPipeline()
    const manager = createJobManager({
      repository: repo as unknown as ProfileRepository,
      pipeline: fake.pipeline,
    })
    manager.start('job-1')

    let settled = false
    const cancelling = manager.cancel('job-1').then((value) => {
      settled = true
      return value
    })
    await Promise.resolve()
    expect(fake.calls[0]!.signal.aborted).toBe(true)
    expect(settled).toBe(false)

    fake.calls[0]!.settle()
    await expect(cancelling).resolves.toMatchObject({ status: 'cancelled' })
  })

  it('persists cancelled when an aborted pipeline rejects', async () => {
    const repo = repository([job('job-1')])
    const pipeline: ProfilePipeline = (input) =>
      new Promise((_resolve, reject) => {
        input.signal.addEventListener(
          'abort',
          () => reject(new Error('provider abort rejection')),
          { once: true },
        )
      })
    const manager = createJobManager({
      repository: repo as unknown as ProfileRepository,
      pipeline,
    })
    manager.start('job-1')

    await expect(manager.cancel('job-1')).resolves.toMatchObject({
      status: 'cancelled',
      error: { code: 'CANCELLED' },
    })
    expect(repo.jobs.get('job-1')).toMatchObject({
      status: 'cancelled',
      errorCode: 'CANCELLED',
    })
  })

  it('swallows tracked persistence failures and reports them safely', async () => {
    const repo = repository([job('job-1')])
    repo.updateJobStatus = vi.fn(() => {
      throw new Error('sqlite persistence failed')
    })
    const reported: unknown[] = []
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    const manager = createJobManager({
      repository: repo as unknown as ProfileRepository,
      pipeline: async () => {
        throw new Error('pipeline failed')
      },
      reportError: (error) => reported.push(error),
    })

    try {
      manager.start('job-1')
      await new Promise<void>((resolve) => setImmediate(resolve))

      expect(manager.isRunning('job-1')).toBe(false)
      expect(reported).toHaveLength(1)
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('returns terminal jobs unchanged when cancellation is repeated', async () => {
    const repo = repository([job('job-1', 'completed')])
    const fake = deferredPipeline()
    const manager = createJobManager({
      repository: repo as unknown as ProfileRepository,
      pipeline: fake.pipeline,
    })

    await expect(manager.cancel('job-1')).resolves.toMatchObject({
      status: 'completed',
    })
    expect(fake.calls).toHaveLength(0)
    expect(repo.updates).toHaveLength(0)
  })

  it('fails all nonterminal jobs after restart without running pipelines', () => {
    const repo = repository([
      job('queued', 'queued'),
      job('active', 'inferring'),
      job('done', 'completed'),
    ])
    const fake = deferredPipeline()
    const manager = createJobManager({
      repository: repo as unknown as ProfileRepository,
      pipeline: fake.pipeline,
    })

    expect(manager.recoverAfterRestart()).toBe(2)
    expect(repo.jobs.get('queued')).toMatchObject({
      status: 'failed',
      errorCode: 'SERVER_RESTARTED',
    })
    expect(repo.jobs.get('active')).toMatchObject({
      status: 'failed',
      errorCode: 'SERVER_RESTARTED',
    })
    expect(repo.jobs.get('done')?.status).toBe('completed')
    expect(fake.calls).toHaveLength(0)
  })

  it('shutdown aborts and settles every active job', async () => {
    const repo = repository([job('job-1'), job('job-2')])
    const fake = deferredPipeline()
    const manager = createJobManager({
      repository: repo as unknown as ProfileRepository,
      pipeline: fake.pipeline,
    })
    manager.start('job-1')
    manager.start('job-2')

    const shutdown = manager.shutdown()
    expect(fake.calls.every(({ signal }) => signal.aborted)).toBe(true)
    fake.calls.forEach(({ settle }) => settle())
    await shutdown

    expect(manager.isRunning('job-1')).toBe(false)
    expect(manager.isRunning('job-2')).toBe(false)
  })

  it('enters shutdown before snapshot and terminally rejects later starts', async () => {
    const repo = repository([job('job-1'), job('job-late')])
    const fake = deferredPipeline()
    const manager = createJobManager({
      repository: repo as unknown as ProfileRepository,
      pipeline: fake.pipeline,
    })
    manager.start('job-1')

    const shutdown = manager.shutdown()
    manager.start('job-late')
    expect(fake.calls.map(({ jobId }) => jobId)).toEqual(['job-1'])
    expect(repo.jobs.get('job-late')).toMatchObject({
      status: 'failed',
      errorCode: 'SERVER_SHUTTING_DOWN',
    })

    fake.calls[0]!.settle()
    await shutdown
  })

  it('enables critic when server config or the job option is on', async () => {
    const fromConfig = repository([job('from-config')])
    const fromJob = repository([
      {
        ...job('from-job'),
        options: { enableCritic: true },
      },
    ])
    const neither = repository([job('neither')])
    const configOn = deferredPipeline()
    const jobOn = deferredPipeline()
    const bothOff = deferredPipeline()

    createJobManager({
      repository: fromConfig as unknown as ProfileRepository,
      pipeline: configOn.pipeline,
      enableCritic: true,
    }).start('from-config')
    createJobManager({
      repository: fromJob as unknown as ProfileRepository,
      pipeline: jobOn.pipeline,
      enableCritic: false,
    }).start('from-job')
    createJobManager({
      repository: neither as unknown as ProfileRepository,
      pipeline: bothOff.pipeline,
    }).start('neither')

    expect(configOn.calls[0]?.enableCritic).toBe(true)
    expect(jobOn.calls[0]?.enableCritic).toBe(true)
    expect(bothOff.calls[0]?.enableCritic).toBe(false)

    configOn.calls[0]!.settle()
    jobOn.calls[0]!.settle()
    bothOff.calls[0]!.settle()
    await Promise.resolve()
  })
})
