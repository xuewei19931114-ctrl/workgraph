import type { Transcript } from '../../../shared/profile-schemas.js'

export interface ContextStrategyConfig {
  maxEstimatedTokens: number
  fixedPromptAndSchemaReserve: number
}

export type TranscriptChunkMessage =
  Transcript['conversations'][number]['messages'][number] & {
    context_only: boolean
  }

export interface TranscriptChunk {
  candidate_id: string
  source_type: string
  conversations: Array<{
    conversation_id: string
    title: string
    messages: TranscriptChunkMessage[]
  }>
}

export type ContextStrategyErrorCode =
  | 'MESSAGE_TOO_LARGE'
  | 'CONTEXT_MESSAGE_TOO_LARGE'
  | 'CONVERSATION_TOO_LARGE'

export class ContextStrategyError extends Error {
  constructor(
    readonly code: ContextStrategyErrorCode,
    message: string,
  ) {
    super(message)
    this.name = 'ContextStrategyError'
  }
}

export class MessageTooLargeError extends ContextStrategyError {
  constructor(
    readonly messageId: string,
    readonly estimatedTokens: number,
    readonly maxEstimatedTokens: number,
  ) {
    super(
      'MESSAGE_TOO_LARGE',
      `Message "${messageId}" requires an estimated ${estimatedTokens} tokens, exceeding the ${maxEstimatedTokens} token safety limit.`,
    )
    this.name = 'MessageTooLargeError'
  }
}

export class ContextMessageTooLargeError extends ContextStrategyError {
  constructor(
    readonly messageId: string,
    readonly contextMessageId: string,
    readonly currentMessageEstimatedTokens: number,
    readonly continuationEstimatedTokens: number,
    readonly maxEstimatedTokens: number,
  ) {
    super(
      'CONTEXT_MESSAGE_TOO_LARGE',
      `Message "${messageId}" fits alone at ${currentMessageEstimatedTokens} estimated tokens, but continuation context "${contextMessageId}" raises the estimate to ${continuationEstimatedTokens}, exceeding the ${maxEstimatedTokens} token safety limit.`,
    )
    this.name = 'ContextMessageTooLargeError'
  }
}

export class ConversationTooLargeError extends ContextStrategyError {
  constructor(
    readonly conversationId: string,
    readonly estimatedTokens: number,
    readonly maxEstimatedTokens: number,
  ) {
    super(
      'CONVERSATION_TOO_LARGE',
      `Empty conversation "${conversationId}" metadata requires an estimated ${estimatedTokens} tokens, exceeding the ${maxEstimatedTokens} token safety limit.`,
    )
    this.name = 'ConversationTooLargeError'
  }
}

export function estimateTranscriptTokens(
  value: Transcript | TranscriptChunk,
  fixedPromptAndSchemaReserve: number,
): number {
  return (
    Math.ceil(JSON.stringify(value).length / 3) + fixedPromptAndSchemaReserve
  )
}

export function chooseContextPath(
  transcript: Transcript,
  config: ContextStrategyConfig,
): 'direct' | 'evidence' {
  return estimateTranscriptTokens(
    transcript,
    config.fixedPromptAndSchemaReserve,
  ) <= config.maxEstimatedTokens
    ? 'direct'
    : 'evidence'
}

function emptyChunk(transcript: Transcript): TranscriptChunk {
  return {
    candidate_id: transcript.candidate_id,
    source_type: transcript.source_type,
    conversations: [],
  }
}

function withContextFlag(
  message: Transcript['conversations'][number]['messages'][number],
  contextOnly: boolean,
): TranscriptChunkMessage {
  return { ...message, context_only: contextOnly }
}

export function chunkTranscript(
  transcript: Transcript,
  maxEstimatedTokens: number,
  fixedPromptAndSchemaReserve = 0,
): TranscriptChunk[] {
  const chunks: TranscriptChunk[] = []
  let current = emptyChunk(transcript)
  const fits = (chunk: TranscriptChunk) =>
    estimateTranscriptTokens(chunk, fixedPromptAndSchemaReserve) <=
    maxEstimatedTokens
  const flush = () => {
    if (current.conversations.length > 0) {
      chunks.push(current)
      current = emptyChunk(transcript)
    }
  }

  for (const conversation of transcript.conversations) {
    const intactConversation = {
      ...conversation,
      messages: conversation.messages.map((item) =>
        withContextFlag(item, false),
      ),
    }
    const appended = {
      ...current,
      conversations: [...current.conversations, intactConversation],
    }
    if (fits(appended)) {
      current = appended
      continue
    }

    flush()
    const intactChunk = {
      ...emptyChunk(transcript),
      conversations: [intactConversation],
    }
    if (fits(intactChunk)) {
      current = intactChunk
      continue
    }
    if (conversation.messages.length === 0) {
      throw new ConversationTooLargeError(
        conversation.conversation_id,
        estimateTranscriptTokens(intactChunk, fixedPromptAndSchemaReserve),
        maxEstimatedTokens,
      )
    }

    let splitMessages: TranscriptChunkMessage[] = []
    for (let index = 0; index < conversation.messages.length; index += 1) {
      const original = conversation.messages[index]
      const originalMessage = withContextFlag(original, false)
      const singleMessageChunk: TranscriptChunk = {
        ...emptyChunk(transcript),
        conversations: [
          {
            conversation_id: conversation.conversation_id,
            title: conversation.title,
            messages: [originalMessage],
          },
        ],
      }
      const singleEstimate = estimateTranscriptTokens(
        singleMessageChunk,
        fixedPromptAndSchemaReserve,
      )
      if (singleEstimate > maxEstimatedTokens) {
        throw new MessageTooLargeError(
          original.message_id,
          singleEstimate,
          maxEstimatedTokens,
        )
      }

      const candidateMessages = [...splitMessages, originalMessage]
      const candidateChunk: TranscriptChunk = {
        ...emptyChunk(transcript),
        conversations: [
          {
            conversation_id: conversation.conversation_id,
            title: conversation.title,
            messages: candidateMessages,
          },
        ],
      }
      if (fits(candidateChunk)) {
        splitMessages = candidateMessages
        continue
      }

      chunks.push({
        ...emptyChunk(transcript),
        conversations: [
          {
            conversation_id: conversation.conversation_id,
            title: conversation.title,
            messages: splitMessages,
          },
        ],
      })
      const previous = conversation.messages[index - 1]
      splitMessages = [withContextFlag(previous, true), originalMessage]
      const continuation: TranscriptChunk = {
        ...emptyChunk(transcript),
        conversations: [
          {
            conversation_id: conversation.conversation_id,
            title: conversation.title,
            messages: splitMessages,
          },
        ],
      }
      if (!fits(continuation)) {
        const continuationEstimate = estimateTranscriptTokens(
          continuation,
          fixedPromptAndSchemaReserve,
        )
        throw new ContextMessageTooLargeError(
          original.message_id,
          previous.message_id,
          singleEstimate,
          continuationEstimate,
          maxEstimatedTokens,
        )
      }
    }

    if (splitMessages.length > 0) {
      current = {
        ...emptyChunk(transcript),
        conversations: [
          {
            conversation_id: conversation.conversation_id,
            title: conversation.title,
            messages: splitMessages,
          },
        ],
      }
    }
  }
  flush()
  return chunks
}
