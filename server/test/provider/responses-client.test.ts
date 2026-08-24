import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ServerConfig } from '../../src/config.js'
import {
  createResponsesClient,
  type ResponsesClientDependencies,
} from '../../src/provider/responses-client.js'
import type {
  CallTelemetry,
  StructuredCall,
} from '../../src/provider/types.js'

interface ReceivedRequest {
  url: string | undefined
  headers: IncomingMessage['headers']
  body: Record<string, unknown>
}

type Handler = (
  request: ReceivedRequest,
  response: ServerResponse,
  attempt: number,
) => void

const servers: Array<ReturnType<typeof createServer>> = []

async function startMockServer(handler: Handler) {
  const requests: ReceivedRequest[] = []
  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = []
    for await (const chunk of request) chunks.push(Buffer.from(chunk))
    const received = {
      url: request.url,
      headers: request.headers,
      body: JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<
        string,
        unknown
      >,
    }
    requests.push(received)
    handler(received, response, requests.length)
  })
  servers.push(server)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  return { baseUrl: `http://127.0.0.1:${port}`, requests }
}

function json(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, {
    'content-type': 'application/json',
    'x-request-id': 'provider-request-1',
  })
  response.end(JSON.stringify(body))
}

function completed(text = '{"name":"Ada"}') {
  return {
    id: 'response-1',
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [{ type: 'output_text', text }],
      },
    ],
    usage: {
      input_tokens: 11,
      output_tokens: 7,
      output_tokens_details: { reasoning_tokens: 3 },
    },
  }
}

const baseConfig: ServerConfig = {
  host: '127.0.0.1',
  port: 8787,
  baseUrl: 'http://127.0.0.1',
  apiKey: 'local-fake-key',
  model: 'openai.gpt-5.6-sol',
  reasoningEffort: 'high',
  timeoutMs: 500,
  maxOutputTokens: 64000,
  contextTokenLimit: 400000,
  extractorConcurrency: 3,
  enableCritic: false,
  dbPath: ':memory:',
  transcriptRetentionDays: 30,
}

const request: StructuredCall<{ name: string }> = {
  stage: 'extractor',
  jobId: 'job-1',
  instructions: 'Return a profile.',
  input: 'Synthetic transcript.',
  schemaName: 'candidate',
  jsonSchema: {
    type: 'object',
    properties: { name: { type: 'string' } },
    required: ['name'],
    additionalProperties: false,
  },
  parse(value) {
    if (
      typeof value !== 'object' ||
      value === null ||
      typeof (value as { name?: unknown }).name !== 'string'
    ) {
      throw new Error('invalid candidate')
    }
    return value as { name: string }
  },
}

function client(
  baseUrl: string,
  overrides: Partial<ResponsesClientDependencies> = {},
) {
  return createResponsesClient({
    config: { ...baseConfig, baseUrl },
    sleep: async () => {},
    jitter: () => 0,
    ...overrides,
  })
}

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

describe('Responses client', () => {
  it('sends the fixed model, high reasoning, strict schema, and exact headers', async () => {
    const mock = await startMockServer((_request, response) =>
      json(response, 200, completed()),
    )

    const result = await client(`${mock.baseUrl}/`).callStructured(
      request,
      new AbortController().signal,
    )

    expect(result).toMatchObject({
      state: 'completed',
      value: { name: 'Ada' },
      usage: { inputTokens: 11, outputTokens: 7, reasoningTokens: 3 },
      providerRequestId: 'provider-request-1',
      providerResponseId: 'response-1',
    })
    expect(mock.requests).toHaveLength(1)
    expect(mock.requests[0]?.headers['x-api-key']).toBe('local-fake-key')
    expect(mock.requests[0]?.headers['content-type']).toBe('application/json')
    expect(mock.requests[0]?.body).toMatchObject({
      model: 'openai.gpt-5.6-sol',
      reasoning: { effort: 'high' },
      max_output_tokens: 64000,
      text: {
        format: {
          type: 'json_schema',
          name: 'candidate',
          strict: true,
          schema: request.jsonSchema,
        },
      },
    })
  })

  it('joins the endpoint without duplicated slashes or paths', async () => {
    const mock = await startMockServer((_request, response) =>
      json(response, 200, completed()),
    )
    await client(`${mock.baseUrl}///openai/v1///`).callStructured(
      request,
      new AbortController().signal,
    )

    expect(mock.requests).toHaveLength(1)
    expect(mock.requests[0]?.url).toBe('/openai/v1/responses')
  })

  it('retries a 429 once and then succeeds', async () => {
    const mock = await startMockServer((_request, response, attempt) => {
      if (attempt === 1) json(response, 429, { error: { code: 'rate_limit' } })
      else json(response, 200, completed())
    })

    const result = await client(mock.baseUrl).callStructured(
      request,
      new AbortController().signal,
    )

    expect(result.state).toBe('completed')
    expect(mock.requests).toHaveLength(2)
  })

  it('fails after the initial request and two retries for repeated 503', async () => {
    const mock = await startMockServer((_request, response) =>
      json(response, 503, { error: { code: 'unavailable', message: 'raw' } }),
    )

    const result = await client(mock.baseUrl).callStructured(
      request,
      new AbortController().signal,
    )

    expect(result).toMatchObject({
      state: 'failed',
      error: { code: 'provider_unavailable' },
    })
    expect(mock.requests).toHaveLength(3)
  })

  it('returns a typed timeout without retrying indefinitely', async () => {
    const mock = await startMockServer((_request, response) => {
      setTimeout(() => json(response, 200, completed()), 100)
    })

    const result = await client(mock.baseUrl, {
      config: { ...baseConfig, baseUrl: mock.baseUrl, timeoutMs: 10 },
    }).callStructured(request, new AbortController().signal)

    expect(result).toMatchObject({
      state: 'failed',
      error: { code: 'timeout' },
    })
    expect(mock.requests.length).toBeGreaterThanOrEqual(1)
    expect(mock.requests.length).toBeLessThanOrEqual(3)
  })

  it('cancels immediately from the caller signal', async () => {
    const mock = await startMockServer((_request, response) => {
      setTimeout(() => json(response, 200, completed()), 100)
    })
    const controller = new AbortController()
    setTimeout(() => controller.abort('user_cancelled'), 5)

    const result = await client(mock.baseUrl).callStructured(
      request,
      controller.signal,
    )

    expect(result).toMatchObject({
      state: 'cancelled',
      error: { code: 'cancelled' },
    })
    expect(mock.requests.length).toBeLessThanOrEqual(1)
  })

  it('cancels an in-progress retry backoff without another request', async () => {
    const mock = await startMockServer((_request, response) =>
      json(response, 503, { error: { code: 'unavailable' } }),
    )
    const controller = new AbortController()

    const resultPromise = client(mock.baseUrl, {
      sleep: (_milliseconds, signal) =>
        new Promise<void>((resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => reject(signal.reason),
            { once: true },
          )
          setTimeout(resolve, 100)
        }),
    }).callStructured(request, controller.signal)
    await new Promise((resolve) => setTimeout(resolve, 10))
    controller.abort('cancel_backoff')

    const result = await resultPromise
    expect(result.state).toBe('cancelled')
    expect(mock.requests).toHaveLength(1)
  })

  it('returns failure when injected backoff sleep rejects without caller abort', async () => {
    const mock = await startMockServer((_request, response) =>
      json(response, 503, { error: { code: 'unavailable' } }),
    )

    const result = await client(mock.baseUrl, {
      sleep: async () => {
        throw new Error('synthetic sleep failure')
      },
    }).callStructured(request, new AbortController().signal)

    expect(result).toMatchObject({
      state: 'failed',
      error: { code: 'network_error' },
    })
    expect(mock.requests).toHaveLength(1)
  })

  it('removes the caller abort listener after backoff completes normally', async () => {
    const mock = await startMockServer((_request, response, attempt) => {
      if (attempt === 1) json(response, 503, { error: { code: 'unavailable' } })
      else json(response, 200, completed())
    })
    const controller = new AbortController()
    const addListener = vi.spyOn(controller.signal, 'addEventListener')
    const removeListener = vi.spyOn(controller.signal, 'removeEventListener')

    const result = await client(mock.baseUrl, {
      sleep: undefined,
    }).callStructured(request, controller.signal)

    const addedAbortListeners = addListener.mock.calls.filter(
      ([type]) => type === 'abort',
    ).length
    const removedAbortListeners = removeListener.mock.calls.filter(
      ([type]) => type === 'abort',
    ).length
    expect(result.state).toBe('completed')
    expect(addedAbortListeners).toBeGreaterThan(0)
    expect(removedAbortListeners).toBe(addedAbortListeners)
  })

  it.each([
    [
      'refusal',
      {
        id: 'r',
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'refusal', refusal: 'no' }] },
        ],
      },
      'refusal_empty',
    ],
    ['empty', { id: 'r', status: 'completed', output: [] }, 'refusal_empty'],
    [
      'incomplete',
      {
        id: 'r',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [],
      },
      'incomplete',
    ],
  ])('returns a typed %s state', async (_name, body, state) => {
    const mock = await startMockServer((_request, response) =>
      json(response, 200, body),
    )

    const result = await client(mock.baseUrl).callStructured(
      request,
      new AbortController().signal,
    )

    expect(result.state).toBe(state)
  })

  it('uses only the final output_text item', async () => {
    const body = completed()
    body.output = [
      {
        type: 'message',
        content: [
          { type: 'output_text', text: '{"name":"Draft"}' },
          { type: 'refusal', refusal: 'ignore this non-final item' },
        ],
      },
      {
        type: 'message',
        content: [{ type: 'output_text', text: '{"name":"Final"}' }],
      },
    ]
    const mock = await startMockServer((_request, response) =>
      json(response, 200, body),
    )

    const result = await client(mock.baseUrl).callStructured(
      request,
      new AbortController().signal,
    )

    expect(result).toMatchObject({ state: 'completed', value: { name: 'Final' } })
  })

  it('returns refusal when final content refuses after an earlier output_text', async () => {
    const body = completed()
    body.output = [
      {
        type: 'message',
        content: [{ type: 'output_text', text: '{"name":"Early"}' }],
      },
      {
        type: 'message',
        content: [{ type: 'refusal', refusal: 'final refusal' }],
      },
    ]
    const mock = await startMockServer((_request, response) =>
      json(response, 200, body),
    )

    const result = await client(mock.baseUrl).callStructured(
      request,
      new AbortController().signal,
    )

    expect(result.state).toBe('refusal_empty')
  })

  it('falls back to strict JSON text only for explicit schema rejection', async () => {
    const mock = await startMockServer((_request, response, attempt) => {
      if (attempt === 1) {
        json(response, 400, {
          error: {
            code: 'unsupported_response_format',
            param: 'text.format.type',
            message: 'json_schema is unsupported',
          },
        })
      } else {
        json(response, 200, completed())
      }
    })

    const result = await client(mock.baseUrl).callStructured(
      request,
      new AbortController().signal,
    )

    expect(result.state).toBe('completed')
    expect(mock.requests).toHaveLength(2)
    expect(mock.requests[1]?.body).toMatchObject({
      text: { format: { type: 'json_object' } },
    })
  })

  it('does not fall back for an unrelated 400 response', async () => {
    const mock = await startMockServer((_request, response) =>
      json(response, 400, {
        error: {
          code: 'invalid_request',
          param: 'input',
          message: 'json_schema words do not make this a format rejection',
        },
      }),
    )

    const result = await client(mock.baseUrl).callStructured(
      request,
      new AbortController().signal,
    )

    expect(result.state).toBe('failed')
    expect(mock.requests).toHaveLength(1)
  })

  it('makes exactly one JSON repair call without rerunning original input', async () => {
    const malformed = '{"name":'
    const mock = await startMockServer((_request, response, attempt) =>
      json(
        response,
        200,
        completed(attempt === 1 ? malformed : '{"name":"Repaired"}'),
      ),
    )

    const result = await client(mock.baseUrl).callStructured(
      request,
      new AbortController().signal,
    )

    expect(result).toMatchObject({
      state: 'completed',
      value: { name: 'Repaired' },
      repaired: true,
    })
    expect(mock.requests).toHaveLength(2)
    expect(mock.requests[1]?.body.input).toBe(malformed)
    expect(mock.requests[1]?.body.instructions).not.toContain(request.input)
    expect(mock.requests[1]?.body.instructions).not.toContain(
      request.instructions,
    )
  })

  it('repairs with json_object after the proxy rejected json_schema', async () => {
    const malformed = '{"name":'
    const mock = await startMockServer((_request, response, attempt) => {
      if (attempt === 1) {
        json(response, 400, {
          error: {
            code: 'unsupported_response_format',
            param: 'text.format.type',
            message: 'json_schema is unsupported',
          },
        })
        return
      }
      json(
        response,
        200,
        completed(attempt === 2 ? malformed : '{"name":"Repaired"}'),
      )
    })

    const result = await client(mock.baseUrl).callStructured(
      request,
      new AbortController().signal,
    )

    expect(result).toMatchObject({
      state: 'completed',
      value: { name: 'Repaired' },
      repaired: true,
    })
    expect(mock.requests).toHaveLength(3)
    expect(mock.requests[1]?.body).toMatchObject({
      text: { format: { type: 'json_object' } },
    })
    expect(mock.requests[2]?.body).toMatchObject({
      text: { format: { type: 'json_object' } },
    })
  })

  it('returns failure after one unsuccessful JSON repair', async () => {
    const mock = await startMockServer((_request, response) =>
      json(response, 200, completed('not json')),
    )

    const result = await client(mock.baseUrl).callStructured(
      request,
      new AbortController().signal,
    )

    expect(result).toMatchObject({
      state: 'failed',
      error: { code: 'invalid_output' },
    })
    expect(mock.requests).toHaveLength(2)
  })

  it.each([
    [
      'incomplete',
      {
        id: 'repair-incomplete',
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
        output: [],
      },
    ],
    [
      'refusal',
      {
        id: 'repair-refusal',
        status: 'completed',
        output: [
          { type: 'message', content: [{ type: 'refusal', refusal: 'no' }] },
        ],
      },
    ],
    ['empty', { id: 'repair-empty', status: 'completed', output: [] }],
  ])('converts a non-completed %s repair into typed failure', async (_name, repair) => {
    const mock = await startMockServer((_request, response, attempt) =>
      json(response, 200, attempt === 1 ? completed('not json') : repair),
    )

    const result = await client(mock.baseUrl).callStructured(
      request,
      new AbortController().signal,
    )

    expect(result).toMatchObject({
      state: 'failed',
      error: { code: 'invalid_output' },
    })
    expect(mock.requests).toHaveLength(2)
  })

  it('preserves caller cancellation during JSON repair', async () => {
    const mock = await startMockServer((_request, response, attempt) => {
      if (attempt === 1) json(response, 200, completed('not json'))
      else setTimeout(() => json(response, 200, completed()), 100)
    })
    const controller = new AbortController()
    setTimeout(() => controller.abort('cancel_repair'), 10)

    const result = await client(mock.baseUrl).callStructured(
      request,
      controller.signal,
    )

    expect(result.state).toBe('cancelled')
    expect(mock.requests).toHaveLength(2)
  })

  it('records safe metadata for each inference and repair call', async () => {
    const records: CallTelemetry[] = []
    const mock = await startMockServer((_request, response, attempt) =>
      json(
        response,
        200,
        completed(attempt === 1 ? '{"name":' : '{"name":"Fixed"}'),
      ),
    )

    await client(mock.baseUrl, {
      recorder: { record: (record) => void records.push(record) },
    }).callStructured(request, new AbortController().signal)

    expect(records).toHaveLength(2)
    expect(records.map((record) => record.stage)).toEqual([
      'extractor',
      'json_repair',
    ])
    expect(records[0]).toMatchObject({
      jobId: 'job-1',
      providerRequestId: 'provider-request-1',
      providerResponseId: 'response-1',
      model: 'openai.gpt-5.6-sol',
      reasoningEffort: 'high',
      status: 'completed',
      inputTokens: 11,
      outputTokens: 7,
      reasoningTokens: 3,
    })
  })
})
