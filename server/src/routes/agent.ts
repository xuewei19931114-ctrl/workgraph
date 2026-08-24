import type { FastifyInstance } from 'fastify'
import { z } from 'zod'

import { InferenceCallError } from '../inference/evidence-runner.js'
import type { AgentChatInput } from '../inference/agent-runner.js'

const AgentChatRequestSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'agent']),
        content: z.string().min(1),
      }),
    )
    .min(1)
    .max(40),
  profile: z
    .object({
      headline: z.string(),
      sourceLabel: z.string(),
      thesis: z.string(),
    })
    .nullable()
    .optional(),
})

function providerErrorCode(error: InferenceCallError): string {
  const codes: Record<string, string> = {
    timeout: 'PROVIDER_TIMEOUT',
    network_error: 'PROVIDER_NETWORK_ERROR',
    provider_unavailable: 'PROVIDER_UNAVAILABLE',
    provider_rejected: 'PROVIDER_REJECTED',
    invalid_provider_response: 'PROVIDER_INVALID_RESPONSE',
    invalid_output: 'PROVIDER_INVALID_OUTPUT',
    refusal_empty: 'PROVIDER_REJECTED',
    incomplete: 'PROVIDER_INCOMPLETE',
    cancelled: 'CANCELLED',
  }
  return codes[error.providerCode] ?? 'INTERNAL_ERROR'
}

export async function registerAgentRoutes(
  app: FastifyInstance,
  dependencies: {
    reply: (input: AgentChatInput) => Promise<{ reply: string }>
  },
): Promise<void> {
  app.post('/api/agent/chat', async (request, reply) => {
    const parsed = AgentChatRequestSchema.safeParse(request.body)
    if (!parsed.success) {
      return reply.code(400).send({
        error: {
          code: 'INVALID_CHAT',
          message: '对话请求不完整。',
        },
      })
    }
    try {
      const result = await dependencies.reply({
        messages: parsed.data.messages,
        profile: parsed.data.profile ?? null,
      })
      return result
    } catch (caught) {
      if (caught instanceof InferenceCallError) {
        const code = providerErrorCode(caught)
        const status =
          code === 'PROVIDER_TIMEOUT'
            ? 504
            : code === 'CANCELLED'
              ? 499
              : 502
        return reply.code(status).send({
          error: {
            code,
            message: '智能体暂时无法回复，请稍后重试。',
          },
        })
      }
      throw caught
    }
  })
}
