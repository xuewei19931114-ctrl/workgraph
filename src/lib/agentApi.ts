import { z } from 'zod'

import { ProfileApiError } from './profileApi'

const AgentReplySchema = z.object({
  reply: z.string().min(1),
})

const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict(),
  })
  .passthrough()

export interface AgentChatRequest {
  messages: Array<{ role: 'user' | 'agent'; content: string }>
  profile: {
    headline: string
    sourceLabel: string
    thesis: string
  } | null
}

export async function requestAgentChat(
  input: AgentChatRequest,
  signal?: AbortSignal,
): Promise<{ reply: string }> {
  let response: Response
  try {
    response = await fetch('/api/agent/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ProfileApiError(0, 'NETWORK_ERROR', '无法连接到 Workgraph 后端。')
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new ProfileApiError(
      response.status,
      'INVALID_RESPONSE',
      '服务器返回了无法识别的响应。',
    )
  }

  if (!response.ok) {
    const safeError = ApiErrorSchema.safeParse(body)
    throw new ProfileApiError(
      response.status,
      safeError.success ? safeError.data.error.code : 'HTTP_ERROR',
      safeError.success
        ? safeError.data.error.message
        : '智能体暂时无法回复，请稍后重试。',
    )
  }

  const parsed = AgentReplySchema.safeParse(body)
  if (!parsed.success) {
    throw new ProfileApiError(
      response.status,
      'INVALID_RESPONSE',
      '服务器返回了不符合约定的数据。',
    )
  }
  return parsed.data
}
