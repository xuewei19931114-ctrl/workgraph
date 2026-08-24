import { afterEach, describe, expect, it } from 'vitest'
import type { FastifyInstance } from 'fastify'

import { buildApp } from '../src/app.js'
import type { ServerConfig } from '../src/config.js'

const testConfig: ServerConfig = {
  host: '127.0.0.1',
  port: 8787,
  baseUrl: 'https://example.test/v1',
  apiKey: 'test-key-not-real',
  model: 'openai.gpt-5.6-sol',
  reasoningEffort: 'high',
  timeoutMs: 30000,
  maxOutputTokens: 64000,
  contextTokenLimit: 100000,
  extractorConcurrency: 2,
  enableCritic: false,
  dbPath: ':memory:',
  transcriptRetentionDays: 30,
}

describe('GET /api/health', () => {
  let app: FastifyInstance | undefined

  afterEach(async () => {
    await app?.close()
  })

  it('reports that the server is healthy', async () => {
    app = await buildApp({ config: testConfig })
    const response = await app.inject({ method: 'GET', url: '/api/health' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ ok: true })
  })
})
