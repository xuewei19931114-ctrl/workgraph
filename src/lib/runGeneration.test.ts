import { describe, expect, it } from 'vitest'

import { createRunGenerationCoordinator } from './runGeneration'

const firstKey = '11111111-1111-4111-8111-111111111111'
const secondKey = '22222222-2222-4222-8222-222222222222'

describe('run generation coordinator', () => {
  it('rejects a concurrent analysis confirmation', () => {
    const coordinator = createRunGenerationCoordinator()
    const first = coordinator.start(() => firstKey)

    expect(first).not.toBeNull()
    expect(coordinator.start(() => secondKey)).toBeNull()
    expect(coordinator.current()).toBe(first)
  })

  it('prevents a stale run from writing after a new generation starts', () => {
    const coordinator = createRunGenerationCoordinator()
    const stale = coordinator.start(() => firstKey)!
    const writes: string[] = []
    coordinator.pauseForRetry(stale)
    const current = coordinator.start(() => secondKey)!

    expect(coordinator.commit(stale, () => writes.push('stale'))).toBe(false)
    expect(coordinator.commit(current, () => writes.push('current'))).toBe(true)
    expect(writes).toEqual(['current'])
  })

  it('invalidates and locally aborts on unmount, returning the live job id for server cancel', () => {
    const coordinator = createRunGenerationCoordinator()
    const run = coordinator.start(() => firstKey)!
    expect(coordinator.attachJob(run, 'job-1')).toBe(true)

    expect(coordinator.invalidate()).toEqual({ jobId: 'job-1' })

    expect(run.controller.signal.aborted).toBe(true)
    expect(coordinator.current()).toBeNull()
    expect(coordinator.invalidate()).toEqual({ jobId: null })
  })

  it('allows terminal cleanup only for its own generation', () => {
    const coordinator = createRunGenerationCoordinator()
    const stale = coordinator.start(() => firstKey)!
    coordinator.pauseForRetry(stale)
    const current = coordinator.start(() => secondKey)!
    const writes: string[] = []

    expect(coordinator.finish(stale, () => writes.push('stale'))).toBe(false)
    expect(coordinator.current()).toBe(current)
    expect(coordinator.finish(current, () => writes.push('current'))).toBe(true)
    expect(writes).toEqual(['current'])
    expect(coordinator.current()).toBeNull()
  })

  it('retains the active run, key, and polling after cancellation fails', async () => {
    const coordinator = createRunGenerationCoordinator()
    const run = coordinator.start(() => firstKey)!
    expect(coordinator.attachJob(run, 'job-1')).toBe(true)

    await expect(
      coordinator.cancelCurrent(async () => {
        throw new Error('DELETE failed')
      }),
    ).rejects.toThrow('DELETE failed')

    expect(coordinator.current()).toBe(run)
    expect(coordinator.current()?.idempotencyKey).toBe(firstKey)
    expect(run.controller.signal.aborted).toBe(false)
  })

  it('aborts and clears only after server cancellation succeeds', async () => {
    const coordinator = createRunGenerationCoordinator()
    const run = coordinator.start(() => firstKey)!
    coordinator.attachJob(run, 'job-1')

    const result = await coordinator.cancelCurrent(async (jobId) => ({
      jobId,
      status: 'cancelled' as const,
      progress: 1,
      stageMessage: 'cancelled',
      modelId: null,
      criticVerdict: null,
      error: { code: 'CANCELLED', message: 'cancelled' },
    }))

    expect(result.applied).toBe(true)
    expect(run.controller.signal.aborted).toBe(true)
    expect(coordinator.current()).toBeNull()
  })
})
