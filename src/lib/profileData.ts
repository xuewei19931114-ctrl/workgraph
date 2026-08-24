import { TranscriptSchema } from '../../shared/profile-schemas'
import type { ParsedArchive } from '../types'

export function mergeParsedArchives(
  archives: ParsedArchive[],
  candidateId: string,
): ParsedArchive {
  const conversationIds = new Set<string>()
  const messageIds = new Set<string>()
  const conversations = archives.flatMap((archive) =>
    archive.transcript.conversations.map((conversation) => {
      if (conversationIds.has(conversation.conversation_id)) {
        throw new Error(
          `Duplicate conversation ID: ${conversation.conversation_id}`,
        )
      }
      conversationIds.add(conversation.conversation_id)
      conversation.messages.forEach((message) => {
        if (messageIds.has(message.message_id)) {
          throw new Error(`Duplicate message ID: ${message.message_id}`)
        }
        messageIds.add(message.message_id)
      })
      return conversation
    }),
  )

  const transcript = TranscriptSchema.parse({
    candidate_id: candidateId,
    source_type: 'merged-local-archives',
    conversations,
  })

  return {
    transcript,
    stats: {
      conversations: transcript.conversations.length,
      messages: transcript.conversations.reduce(
        (sum, conversation) => sum + conversation.messages.length,
        0,
      ),
    },
  }
}
