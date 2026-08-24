import { describe, expect, it } from 'vitest'

import type { Transcript } from '../../../shared/profile-schemas.js'
import {
  ContextStrategyError,
  chooseContextPath,
  chunkTranscript,
  estimateTranscriptTokens,
} from '../../src/inference/context-strategy.js'

const message = (id: string, content: string) => ({
  message_id: id,
  role: 'user' as const,
  content,
  timestamp: null,
  authorship: 'user' as const,
})

function transcript(conversations: Transcript['conversations']): Transcript {
  return {
    candidate_id: 'candidate-1',
    source_type: 'chat',
    conversations,
  }
}

const conversation = (
  id: string,
  messages: Transcript['conversations'][number]['messages'],
) => ({ conversation_id: id, title: id, messages })

describe('context strategy', () => {
  it('chooses direct below the safety limit and evidence over it', () => {
    const small = transcript([conversation('c1', [message('m1', 'short')])])

    expect(
      chooseContextPath(small, {
        maxEstimatedTokens: 100,
        fixedPromptAndSchemaReserve: 10,
      }),
    ).toBe('direct')
    expect(
      chooseContextPath(small, {
        maxEstimatedTokens: 10,
        fixedPromptAndSchemaReserve: 10,
      }),
    ).toBe('evidence')
  })

  it('estimates deterministically from serialized text length', () => {
    const input = transcript([conversation('c1', [message('m1', 'abc')])])
    const serialized = JSON.stringify(input)

    expect(estimateTranscriptTokens(input, 17)).toBe(
      Math.ceil(serialized.length / 3) + 17,
    )
    expect(estimateTranscriptTokens(input, 17)).toBe(
      estimateTranscriptTokens(structuredClone(input), 17),
    )
  })

  it('keeps normal conversations intact', () => {
    const input = transcript([
      conversation('c1', [message('m1', 'a')]),
      conversation('c2', [message('m2', 'b')]),
    ])

    const chunks = chunkTranscript(input, 90, 0)

    expect(chunks).toHaveLength(2)
    expect(chunks.map((chunk) => chunk.conversations[0].conversation_id)).toEqual(
      ['c1', 'c2'],
    )
  })

  it('splits oversized conversations only at message boundaries with one adjacent context message', () => {
    const input = transcript([
      conversation('c1', [
        message('m1', 'a'.repeat(60)),
        message('m2', 'b'.repeat(60)),
        message('m3', 'c'.repeat(60)),
      ]),
    ])

    const chunks = chunkTranscript(input, 155, 0)
    const flattened = chunks.flatMap((chunk) => chunk.conversations[0].messages)
    const originalIds = flattened
      .filter((item) => !item.context_only)
      .map((item) => item.message_id)

    expect(chunks.length).toBeGreaterThan(1)
    expect(originalIds).toEqual(['m1', 'm2', 'm3'])
    for (const continuation of chunks.slice(1)) {
      const contextMessages = continuation.conversations[0].messages.filter(
        (item) => item.context_only,
      )
      expect(contextMessages).toHaveLength(1)
      const firstOriginal = continuation.conversations[0].messages.find(
        (item) => !item.context_only,
      )
      expect(contextMessages[0].message_id).toBe(
        `m${Number(firstOriginal?.message_id.slice(1)) - 1}`,
      )
    }
    for (const chunk of chunks) {
      expect(estimateTranscriptTokens(chunk, 0)).toBeLessThanOrEqual(155)
    }
  })

  it('raises typed MESSAGE_TOO_LARGE for an indivisible message', () => {
    const input = transcript([
      conversation('c1', [message('m1', 'x'.repeat(1_000))]),
    ])

    expect(() => chunkTranscript(input, 50, 0)).toThrowError(
      expect.objectContaining<Partial<ContextStrategyError>>({
        code: 'MESSAGE_TOO_LARGE',
        messageId: 'm1',
      }),
    )
  })

  it('distinguishes oversized adjacent context from an indivisible current message', () => {
    const first = message('m1', 'a'.repeat(120))
    const second = message('m2', 'b')
    const input = transcript([conversation('c1', [first, second])])
    const firstOnly = {
      candidate_id: input.candidate_id,
      source_type: input.source_type,
      conversations: [
        {
          conversation_id: 'c1',
          title: 'c1',
          messages: [{ ...first, context_only: false }],
        },
      ],
    }
    const limit = estimateTranscriptTokens(firstOnly, 0)

    expect(() => chunkTranscript(input, limit, 0)).toThrowError(
      expect.objectContaining({
        code: 'CONTEXT_MESSAGE_TOO_LARGE',
        messageId: 'm2',
        contextMessageId: 'm1',
        currentMessageEstimatedTokens: expect.any(Number),
        continuationEstimatedTokens: expect.any(Number),
        maxEstimatedTokens: limit,
      }),
    )
  })

  it('preserves an empty conversation when its metadata fits', () => {
    const input = transcript([conversation('empty', [])])

    expect(chunkTranscript(input, 100, 0)).toEqual([
      {
        candidate_id: 'candidate-1',
        source_type: 'chat',
        conversations: [
          {
            conversation_id: 'empty',
            title: 'empty',
            messages: [],
          },
        ],
      },
    ])
  })

  it('raises typed CONVERSATION_TOO_LARGE for oversized empty metadata', () => {
    const input = transcript([
      {
        conversation_id: 'empty',
        title: 'x'.repeat(1_000),
        messages: [],
      },
    ])

    expect(() => chunkTranscript(input, 50, 0)).toThrowError(
      expect.objectContaining({
        code: 'CONVERSATION_TOO_LARGE',
        conversationId: 'empty',
        estimatedTokens: expect.any(Number),
        maxEstimatedTokens: 50,
      }),
    )
  })
})
