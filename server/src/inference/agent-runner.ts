import { z } from 'zod'

import {
  buildCareerAgentPrompt,
  type AgentProfileContext,
} from '../prompts/career-agent.js'
import type { ResponsesClient } from '../provider/responses-client.js'
import {
  InferenceCallError,
  inferenceCallError,
} from './evidence-runner.js'

export interface AgentChatMessage {
  role: 'user' | 'agent'
  content: string
}

export interface AgentChatInput {
  messages: AgentChatMessage[]
  profile: AgentProfileContext | null
}

const AgentReplySchema = z.object({
  reply: z.string().min(1),
})

const MAX_TURNS = 16
const MAX_CHARS = 4000

function clip(content: string): string {
  if (content.length <= MAX_CHARS) return content
  return `${content.slice(0, MAX_CHARS)}\n…[truncated]`
}

export async function runAgentChat(
  input: AgentChatInput,
  provider: ResponsesClient,
): Promise<{ reply: string }> {
  const messages = input.messages.slice(-MAX_TURNS).map((message) => ({
    role: message.role,
    content: clip(message.content),
  }))
  const result = await provider.callStructured(
    {
      stage: 'agent',
      instructions: buildCareerAgentPrompt(input.profile),
      input: JSON.stringify({ messages }),
      schemaName: 'career_agent_reply',
      jsonSchema: z.toJSONSchema(AgentReplySchema) as Record<string, unknown>,
      parse: (value) => AgentReplySchema.parse(value),
      maxOutputTokens: 4096,
    },
    new AbortController().signal,
  )
  if (result.state === 'completed') {
    try {
      return { reply: AgentReplySchema.parse(result.value).reply }
    } catch {
      throw new InferenceCallError('invalid_output', 'failed')
    }
  }
  throw inferenceCallError(result)
}
