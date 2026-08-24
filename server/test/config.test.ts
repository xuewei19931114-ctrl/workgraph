import { describe, expect, it } from 'vitest'

import { applyVercelDefaults, loadConfig } from '../src/config.js'

const validEnv: NodeJS.ProcessEnv = {
  GPT56_API_KEY: 'test-key-not-real',
  GPT56_BASE_URL: 'https://example.test/v1',
  GPT56_MODEL: 'openai.gpt-5.6-sol',
  GPT56_TIMEOUT_MS: '30000',
  PROFILE_CONTEXT_TOKEN_LIMIT: '100000',
  PROFILE_EXTRACTOR_CONCURRENCY: '2',
  PROFILE_ENABLE_CRITIC: 'true',
  WORKGRAPH_DB_PATH: 'server/data/test.db',
  TRANSCRIPT_RETENTION_DAYS: '9',
}

describe('loadConfig', () => {
  it('rejects a missing API key', () => {
    expect(() => loadConfig({})).toThrow(/GPT56_API_KEY/)
  })

  it('uses the fixed model', () => {
    expect(loadConfig(validEnv).model).toBe('openai.gpt-5.6-sol')
  })

  it('defaults reasoning effort to high', () => {
    expect(loadConfig(validEnv).reasoningEffort).toBe('high')
  })

  it('reads the approved profile environment variables', () => {
    expect(loadConfig(validEnv)).toMatchObject({
      contextTokenLimit: 100000,
      extractorConcurrency: 2,
      enableCritic: true,
      dbPath: 'server/data/test.db',
      transcriptRetentionDays: 9,
    })
  })

  it('defaults critic off and Transcript retention to seven days', () => {
    const loaded = loadConfig({ GPT56_API_KEY: 'test-key-not-real' })
    expect(loaded.enableCritic).toBe(false)
    expect(loaded.transcriptRetentionDays).toBe(7)
  })

  it('points SQLite at /tmp on Vercel when no db path is set', () => {
    const env: NodeJS.ProcessEnv = { VERCEL: '1' }
    applyVercelDefaults(env)
    expect(env.WORKGRAPH_DB_PATH).toBe('/tmp/workgraph.db')
  })

  it('defaults a long core timeout and a high output-token budget', () => {
    const loaded = loadConfig({ GPT56_API_KEY: 'test-key-not-real' })
    expect(loaded.timeoutMs).toBe(600000)
    expect(loaded.maxOutputTokens).toBe(64000)
  })

  it('rejects a non-HTTP base URL', () => {
    expect(() =>
      loadConfig({ ...validEnv, GPT56_BASE_URL: 'ftp://example.test' }),
    ).toThrow(/GPT56_BASE_URL/)
  })

  it('rejects a model other than openai.gpt-5.6-sol', () => {
    expect(() =>
      loadConfig({ ...validEnv, GPT56_MODEL: 'openai.gpt-4.1' }),
    ).toThrow(/GPT56_MODEL/)
  })

  it.each([
    'GPT56_TIMEOUT_MS',
    'GPT56_MAX_OUTPUT_TOKENS',
    'PROFILE_CONTEXT_TOKEN_LIMIT',
    'PROFILE_EXTRACTOR_CONCURRENCY',
    'TRANSCRIPT_RETENTION_DAYS',
  ])('rejects a non-positive %s', (name) => {
    expect(() => loadConfig({ ...validEnv, [name]: '0' })).toThrow(
      new RegExp(name),
    )
  })
})
