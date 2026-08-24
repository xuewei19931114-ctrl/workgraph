import { describe, expect, it } from 'vitest'

import type { ParsedArchive } from '../types'
import { mergeParsedArchives } from './profileData'

function archive(
  conversationId: string,
  messageId: string,
): ParsedArchive {
  return {
    stats: { conversations: 999, messages: 999 },
    transcript: {
      candidate_id: 'old-candidate',
      source_type: 'fixture',
      conversations: [
        {
          conversation_id: conversationId,
          title: conversationId,
          messages: [
            {
              message_id: messageId,
              role: 'user',
              content: messageId,
              timestamp: null,
              authorship: 'user',
            },
          ],
        },
      ],
    },
  }
}

describe('mergeParsedArchives', () => {
  it('sets one candidate ID and recomputes totals from merged transcripts', () => {
    const result = mergeParsedArchives(
      [archive('conversation-1', 'message-1'), archive('conversation-2', 'message-2')],
      'candidate-1',
    )

    expect(result.transcript.candidate_id).toBe('candidate-1')
    expect(result.transcript.conversations).toHaveLength(2)
    expect(result.stats).toEqual({ conversations: 2, messages: 2 })
  })

  it('rejects duplicate conversation IDs', () => {
    expect(() =>
      mergeParsedArchives(
        [archive('duplicate', 'message-1'), archive('duplicate', 'message-2')],
        'candidate-1',
      ),
    ).toThrow(/duplicate conversation ID/i)
  })

  it('rejects duplicate message IDs', () => {
    expect(() =>
      mergeParsedArchives(
        [archive('conversation-1', 'duplicate'), archive('conversation-2', 'duplicate')],
        'candidate-1',
      ),
    ).toThrow(/duplicate message ID/i)
  })
})
