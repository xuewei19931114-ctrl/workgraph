export type StageLogger = (message: string) => void

export function createStageLogger(
  log: StageLogger | undefined,
  jobId: string,
): StageLogger {
  return (detail: string) => {
    if (log === undefined) return
    try {
      log(`[profile] job=${jobId} ${detail}`)
    } catch {
      // Stage logging must never change pipeline behavior.
    }
  }
}

export function transcriptStageSummary(transcript: {
  source_type: string
  conversations: Array<{
    messages: Array<{ role: string; authorship: string }>
  }>
}): string {
  const messages = transcript.conversations.flatMap(
    (conversation) => conversation.messages,
  )
  const authorship = new Map<string, number>()
  const roles = new Map<string, number>()
  for (const message of messages) {
    authorship.set(
      message.authorship,
      (authorship.get(message.authorship) ?? 0) + 1,
    )
    roles.set(message.role, (roles.get(message.role) ?? 0) + 1)
  }
  const format = (counts: Map<string, number>) =>
    [...counts.entries()]
      .map(([key, count]) => `${key}:${count}`)
      .join(',') || 'none'
  return `conversations=${transcript.conversations.length} messages=${messages.length} source=${transcript.source_type} roles={${format(roles)}} authorship={${format(authorship)}}`
}
