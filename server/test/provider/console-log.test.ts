import { describe, expect, it } from 'vitest'

import {
  formatGptRequestLog,
  formatGptResponseLog,
  previewText,
} from '../../src/provider/console-log.js'

describe('provider console logs', () => {
  it('prints request stage, endpoint, and truncated prompt without the API key', () => {
    const log = formatGptRequestLog({
      stage: 'core',
      jobId: 'job-1',
      endpoint: 'http://proxy.example/openai/v1/responses',
      model: 'openai.gpt-5.6-sol',
      format: 'json_schema',
      instructions: 'Build a candidate model.',
      promptInput: 'SECRET_KEY_VALUE appears in transcript',
      secrets: ['SECRET_KEY_VALUE'],
    })

    expect(log).toContain('[gpt] request stage=core')
    expect(log).toContain('endpoint=http://proxy.example/openai/v1/responses')
    expect(log).toContain('Build a candidate model.')
    expect(log).toContain('[redacted]')
    expect(log).not.toContain('SECRET_KEY_VALUE')
  })

  it('prints the GPT URL on failed responses', () => {
    const log = formatGptResponseLog({
      stage: 'core',
      jobId: 'job-1',
      endpoint: 'http://proxy.example/openai/v1/responses',
      state: 'failed',
      responseId: null,
      wallMs: 375,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      error: 'The provider rejected the request.',
    })

    expect(log).toContain('[gpt] response stage=core')
    expect(log).toContain('endpoint=http://proxy.example/openai/v1/responses')
    expect(log).toContain('error=The provider rejected the request.')
  })

  it('prints response ids, usage, and output preview', () => {
    const log = formatGptResponseLog({
      stage: 'core',
      jobId: 'job-1',
      endpoint: 'http://proxy.example/openai/v1/responses',
      state: 'completed',
      responseId: 'resp-1',
      wallMs: 1200,
      inputTokens: 99,
      outputTokens: 12,
      reasoningTokens: 3,
      outputText: '{"name":"Ada"}',
    })

    expect(log).toContain('state=completed')
    expect(log).toContain('endpoint=http://proxy.example/openai/v1/responses')
    expect(log).toContain('responseId=resp-1')
    expect(log).toContain('inputTokens=99')
    expect(log).toContain('{"name":"Ada"}')
  })

  it('truncates long previews', () => {
    expect(previewText('a'.repeat(10), 4)).toBe(
      `aaaa\n…[truncated 6 chars]`,
    )
  })

  it('prints the full GPT input payload without truncating it', () => {
    const promptInput = `{"transcript":{"messages":["${'x'.repeat(5000)}"]}}`
    const log = formatGptRequestLog({
      stage: 'core',
      endpoint: 'http://proxy.example/openai/v1/responses',
      model: 'openai.gpt-5.6-sol',
      format: 'json_schema',
      instructions: 'Build a candidate model.',
      promptInput,
    })

    expect(log).toContain('[gpt] input=')
    expect(log).toContain(promptInput)
    expect(log).not.toContain('inputPreview=')
    expect(log).not.toContain('truncated')
  })
})
