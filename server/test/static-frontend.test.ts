import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

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

describe('production frontend static files', () => {
  let app: FastifyInstance | undefined

  afterEach(async () => {
    await app?.close()
  })

  it('serves the built SPA and keeps /api/health on the same origin', async () => {
    const staticDir = mkdtempSync(join(tmpdir(), 'workgraph-static-'))
    writeFileSync(
      join(staticDir, 'index.html'),
      '<!doctype html><title>Workgraph</title>',
    )

    app = await buildApp({ config: testConfig, staticDir })

    const page = await app.inject({ method: 'GET', url: '/' })
    expect(page.statusCode).toBe(200)
    expect(page.body).toContain('Workgraph')

    const spa = await app.inject({ method: 'GET', url: '/profile/abc' })
    expect(spa.statusCode).toBe(200)
    expect(spa.body).toContain('Workgraph')

    const health = await app.inject({ method: 'GET', url: '/api/health' })
    expect(health.statusCode).toBe(200)
    expect(health.json()).toEqual({ ok: true })
  })
})
