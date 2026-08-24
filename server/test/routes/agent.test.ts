import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { buildApp } from '../../src/app.js'
import type { ServerConfig } from '../../src/config.js'

const config: ServerConfig = {
  host: '127.0.0.1',
  port: 8787,
  baseUrl: 'https://example.test/v1',
  apiKey: 'never-used',
  model: 'openai.gpt-5.6-sol',
  reasoningEffort: 'high',
  timeoutMs: 30_000,
  maxOutputTokens: 64000,
  contextTokenLimit: 100_000,
  extractorConcurrency: 2,
  enableCritic: false,
  dbPath: ':memory:',
  transcriptRetentionDays: 7,
}

describe('POST /api/agent/chat', () => {
  let app: FastifyInstance | undefined

  afterEach(async () => {
    await app?.close()
  })

  it('returns a GPT reply from the injected agent', async () => {
    app = await buildApp({
      config,
      agent: {
        reply: async (input) => {
          expect(input.messages.at(-1)?.content).toBe('我适合做什么？')
          expect(input.profile?.headline).toBe('系统收敛者')
          return { reply: '先举一个最近你主动把问题定义清楚的例子。' }
        },
      },
    })

    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/chat',
      payload: {
        messages: [{ role: 'user', content: '我适合做什么？' }],
        profile: {
          headline: '系统收敛者',
          sourceLabel: 'merged-local-archives',
          thesis: '先约束后方案。',
        },
      },
    })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({
      reply: '先举一个最近你主动把问题定义清楚的例子。',
    })
  })

  it('rejects an empty message list', async () => {
    app = await buildApp({
      config,
      agent: { reply: async () => ({ reply: 'unused' }) },
    })
    const response = await app.inject({
      method: 'POST',
      url: '/api/agent/chat',
      payload: { messages: [] },
    })
    expect(response.statusCode).toBe(400)
    expect(response.json().error.code).toBe('INVALID_CHAT')
  })
})
