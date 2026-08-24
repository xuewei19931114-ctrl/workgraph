import { sha256Hex } from './sha256'

async function sha256(value: string): Promise<string> {
  return sha256Hex(value)
}

export function createMessageId(
  sourceType: string,
  conversationIndex: number,
  messageIndex: number,
  role: string,
  content: string,
): Promise<string> {
  return sha256(
    `${sourceType}:${conversationIndex}:${messageIndex}:${role}:${content}`,
  )
}

export function createConversationId(
  sourceType: string,
  conversationIndex: number,
  title: string,
): Promise<string> {
  return sha256(`${sourceType}:${conversationIndex}:${title}`)
}
