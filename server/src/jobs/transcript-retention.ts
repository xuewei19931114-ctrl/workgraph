export function startTranscriptRetentionSweep(options: {
  sweep: (now: Date) => number
  intervalMs?: number
  now?: () => Date
  logDeleted?: (deleted: number) => void
}): { stop: () => void } {
  const intervalMs = options.intervalMs ?? 86_400_000
  const now = options.now ?? (() => new Date())
  const logDeleted = options.logDeleted ?? (() => undefined)

  const run = () => {
    const deleted = options.sweep(now())
    if (deleted > 0) logDeleted(deleted)
  }

  run()
  const timer = setInterval(run, intervalMs)
  timer.unref?.()

  return {
    stop() {
      clearInterval(timer)
    },
  }
}
