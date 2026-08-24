import { afterEach, describe, expect, it, vi } from 'vitest'

import { startTranscriptRetentionSweep } from '../../src/jobs/transcript-retention.js'

afterEach(() => {
  vi.useRealTimers()
})

describe('startTranscriptRetentionSweep', () => {
  it('sweeps immediately and again on the daily interval, logging only the deleted count', () => {
    vi.useFakeTimers()
    const now = new Date('2026-08-21T08:00:00.000Z')
    const sweeps: Date[] = []
    const logs: number[] = []
    const handle = startTranscriptRetentionSweep({
      sweep: (at) => {
        sweeps.push(at)
        return sweeps.length === 1 ? 2 : 0
      },
      now: () => now,
      intervalMs: 86_400_000,
      logDeleted: (count) => logs.push(count),
    })

    expect(sweeps).toEqual([now])
    expect(logs).toEqual([2])

    vi.advanceTimersByTime(86_400_000)
    expect(sweeps).toHaveLength(2)
    expect(logs).toEqual([2])

    handle.stop()
    vi.advanceTimersByTime(86_400_000)
    expect(sweeps).toHaveLength(2)
  })
})
