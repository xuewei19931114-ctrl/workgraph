import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it } from 'vitest'

import type { ServerConfig } from '../../src/config.js'
import { createResponsesClient } from '../../src/provider/responses-client.js'
import {
  createRepositoryCallRecorder,
  type ProviderCallRepository,
} from '../../src/provider/call-recorder.js'
import type { CallTelemetry } from '../../src/provider/types.js'

const servers: Array<ReturnType<typeof createServer>> = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        ),
    ),
  )
})

describe('provider telemetry redaction', () => {
  it('never records keys, prompts, malformed output, or raw provider bodies', async () => {
    const apiKey = 'SECRET_API_KEY_MARKER'
    const promptSecret = 'SECRET_PROMPT_MARKER'
    const malformedOutput = `{"secret":"SECRET_MALFORMED_MARKER"`
    const rawProviderSecret = 'SECRET_PROVIDER_BODY_MARKER'
    const records: CallTelemetry[] = []
    const server = createServer(async (request, response) => {
      for await (const chunk of request) {
        void chunk
      }
      response.writeHead(200, {
        'content-type': 'application/json',
        'x-request-id': 'safe-request-id',
      })
      response.end(
        JSON.stringify({
          id: 'safe-response-id',
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: malformedOutput }],
            },
          ],
          provider_debug: rawProviderSecret,
        }),
      )
    })
    servers.push(server)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const { port } = server.address() as AddressInfo
    const config: ServerConfig = {
      host: '127.0.0.1',
      port: 8787,
      baseUrl: `http://127.0.0.1:${port}`,
      apiKey,
      model: 'openai.gpt-5.6-sol',
      reasoningEffort: 'high',
      timeoutMs: 100,
      maxOutputTokens: 64000,
      contextTokenLimit: 400000,
      extractorConcurrency: 3,
      enableCritic: false,
      dbPath: ':memory:',
      transcriptRetentionDays: 30,
    }

    const result = await createResponsesClient({
      config,
      recorder: { record: (record) => void records.push(record) },
      sleep: async () => {},
      jitter: () => 0,
    }).callStructured(
      {
        stage: 'core',
        instructions: `instructions ${promptSecret}`,
        input: `input ${promptSecret}`,
        schemaName: 'safe_schema',
        jsonSchema: { type: 'object' },
        parse: () => {
          throw new Error(`unsafe parser error ${promptSecret}`)
        },
      },
      new AbortController().signal,
    )

    const serialized = JSON.stringify({ records, result })
    expect(serialized).not.toContain(apiKey)
    expect(serialized).not.toContain(promptSecret)
    expect(serialized).not.toContain(malformedOutput)
    expect(serialized).not.toContain(rawProviderSecret)
    expect(result).toMatchObject({
      state: 'failed',
      error: { code: 'invalid_output' },
    })
  })

  it.each(['http_error', 'format_fallback', 'incomplete', 'refusal', 'abort'])(
    'redacts telemetry and errors on the %s path',
    async (path) => {
      const apiKey = 'SECRET_PATH_API_KEY'
      const promptSecret = 'SECRET_PATH_PROMPT'
      const malformedJson = '{"SECRET_PATH_MALFORMED":'
      const rawProviderBody = `SECRET_PATH_PROVIDER_${path}`
      const records: CallTelemetry[] = []
      let attempt = 0
      const server = createServer(async (request, response) => {
        for await (const chunk of request) {
          void chunk
        }
        attempt += 1
        response.setHeader('content-type', 'application/json')
        if (path === 'http_error') {
          response.statusCode = 400
          response.end(
            JSON.stringify({
              error: { code: 'invalid_request', message: rawProviderBody },
            }),
          )
          return
        }
        if (path === 'format_fallback' && attempt === 1) {
          response.statusCode = 400
          response.end(
            JSON.stringify({
              error: {
                code: 'unsupported_response_format',
                message: `json_schema ${rawProviderBody}`,
              },
            }),
          )
          return
        }
        if (path === 'incomplete') {
          response.end(
            JSON.stringify({
              id: 'safe-id',
              status: 'incomplete',
              incomplete_details: { reason: rawProviderBody },
              output: [],
            }),
          )
          return
        }
        if (path === 'refusal') {
          response.end(
            JSON.stringify({
              id: 'safe-id',
              status: 'completed',
              output: [
                {
                  type: 'message',
                  content: [{ type: 'refusal', refusal: rawProviderBody }],
                },
              ],
            }),
          )
          return
        }
        const completedBody = JSON.stringify({
          id: 'safe-id',
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: '{"name":"Safe"}' }],
            },
          ],
          provider_debug: rawProviderBody,
        })
        if (path === 'abort') {
          setTimeout(() => response.end(completedBody), 50)
        } else {
          response.end(completedBody)
        }
      })
      servers.push(server)
      await new Promise<void>((resolve) =>
        server.listen(0, '127.0.0.1', resolve),
      )
      const { port } = server.address() as AddressInfo
      const config: ServerConfig = {
        host: '127.0.0.1',
        port: 8787,
        baseUrl: `http://127.0.0.1:${port}`,
        apiKey,
        model: 'openai.gpt-5.6-sol',
        reasoningEffort: 'high',
        timeoutMs: 100,
        maxOutputTokens: 64000,
        contextTokenLimit: 400000,
        extractorConcurrency: 3,
        enableCritic: false,
        dbPath: ':memory:',
        transcriptRetentionDays: 30,
      }
      const controller = new AbortController()
      if (path === 'abort') {
        setTimeout(
          () => controller.abort(`abort ${rawProviderBody} ${promptSecret}`),
          5,
        )
      }

      const result = await createResponsesClient({
        config,
        recorder: { record: (record) => void records.push(record) },
        sleep: async () => {},
        jitter: () => 0,
      }).callStructured(
        {
          stage: 'core',
          instructions: `instructions ${promptSecret}`,
          input: `${promptSecret} ${malformedJson}`,
          schemaName: 'safe_schema',
          jsonSchema: { type: 'object' },
          parse(value) {
            return value
          },
        },
        controller.signal,
      )

      const serialized = JSON.stringify({ records, result })
      expect(serialized).not.toContain(apiKey)
      expect(serialized).not.toContain(promptSecret)
      expect(serialized).not.toContain(malformedJson)
      expect(serialized).not.toContain(rawProviderBody)
    },
  )

  it('adapts telemetry to the Task 4 repository interface without content', () => {
    const persisted: unknown[] = []
    const repository: ProviderCallRepository = {
      recordProviderCall(call) {
        persisted.push(call)
        return { id: 'repository-id', ...call }
      },
    }
    const recorder = createRepositoryCallRecorder(repository)
    const telemetry: CallTelemetry = {
      callId: 'call-1',
      jobId: 'job-1',
      providerRequestId: 'request-1',
      providerResponseId: 'response-1',
      stage: 'critic',
      model: 'openai.gpt-5.6-sol',
      reasoningEffort: 'high',
      status: 'failed',
      startedAt: new Date('2026-08-21T00:00:00.000Z'),
      endedAt: new Date('2026-08-21T00:00:00.125Z'),
      wallMs: 125,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      incompleteDetails: null,
      errorCode: 'provider_unavailable',
      cancelDetails: null,
    }

    recorder.record(telemetry)

    expect(persisted).toEqual([
      {
        jobId: 'job-1',
        providerRequestId: 'request-1',
        providerResponseId: 'response-1',
        stage: 'critic',
        model: 'openai.gpt-5.6-sol',
        reasoningEffort: 'high',
        status: 'failed',
        startedAt: new Date('2026-08-21T00:00:00.000Z'),
        endedAt: new Date('2026-08-21T00:00:00.125Z'),
        wallMs: 125,
        inputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
        incompleteDetails: null,
        errorCode: 'provider_unavailable',
      },
    ])
  })

  it('passes jobless telemetry to the repository instead of dropping it', () => {
    const persisted: unknown[] = []
    const repository: ProviderCallRepository = {
      recordProviderCall(call) {
        persisted.push(call)
        return { id: 'repository-id', ...call }
      },
    }
    const recorder = createRepositoryCallRecorder(repository)

    recorder.record({
      callId: 'call-jobless',
      jobId: null,
      providerRequestId: null,
      providerResponseId: null,
      stage: 'extractor',
      model: 'openai.gpt-5.6-sol',
      reasoningEffort: 'high',
      status: 'failed',
      startedAt: new Date('2026-08-21T00:00:00.000Z'),
      endedAt: new Date('2026-08-21T00:00:00.010Z'),
      wallMs: 10,
      inputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
      incompleteDetails: null,
      errorCode: 'network_error',
      cancelDetails: null,
    })

    expect(persisted).toHaveLength(1)
    expect(persisted[0]).toMatchObject({ jobId: null })
  })
})
