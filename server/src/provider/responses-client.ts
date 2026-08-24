import { randomUUID } from 'node:crypto'

import type { ServerConfig } from '../config.js'
import {
  formatGptRequestLog,
  formatGptResponseLog,
} from './console-log.js'
import type {
  CallRecorder,
  CallTelemetry,
  ProviderErrorCode,
  ProviderResult,
  ProviderStage,
  ProviderState,
  ProviderUsage,
  SafeProviderError,
  StructuredCall,
} from './types.js'

export interface ResponsesClientDependencies {
  config: ServerConfig
  fetch?: typeof globalThis.fetch
  sleep?: (milliseconds: number, signal: AbortSignal) => Promise<void>
  jitter?: () => number
  recorder?: CallRecorder
  log?: (message: string) => void
  now?: () => Date
  makeCallId?: () => string
}

export interface ResponsesClient {
  callStructured<T>(
    request: StructuredCall<T>,
    signal: AbortSignal,
  ): Promise<ProviderResult<T>>
}

interface RawCallBase {
  state: ProviderState
  startedAt: Date
  endedAt: Date
  providerRequestId: string | null
  providerResponseId: string | null
  usage: ProviderUsage
}

interface RawCompleted extends RawCallBase {
  state: 'completed'
  outputText: string
}

interface RawIncomplete extends RawCallBase {
  state: 'incomplete'
  incompleteDetails: string | null
}

interface RawRefusalEmpty extends RawCallBase {
  state: 'refusal_empty'
}

interface RawFailure extends RawCallBase {
  state: 'failed' | 'cancelled'
  error: SafeProviderError
  unsupportedSchemaFormat: boolean
}

type RawCall = RawCompleted | RawIncomplete | RawRefusalEmpty | RawFailure

interface AttemptResponse {
  response: Response
  body: Record<string, unknown> | null
}

interface AttemptFailure {
  errorCode: 'cancelled' | 'timeout' | 'network_error'
}

const EMPTY_USAGE: ProviderUsage = {
  inputTokens: null,
  outputTokens: null,
  reasoningTokens: null,
}

const RETRYABLE_STATUS = new Set([429, 502, 503, 504])

const SAFE_ERRORS: Record<ProviderErrorCode, string> = {
  cancelled: 'The provider call was cancelled.',
  timeout: 'The provider call timed out.',
  network_error: 'The provider could not be reached.',
  provider_unavailable: 'The provider is temporarily unavailable.',
  provider_rejected: 'The provider rejected the request.',
  invalid_provider_response: 'The provider returned an invalid response.',
  invalid_output: 'The provider output did not match the required schema.',
}

function safeError(code: ProviderErrorCode): SafeProviderError {
  return { code, message: SAFE_ERRORS[code] }
}

export function endpointFor(baseUrl: string): string {
  const url = new URL(baseUrl)
  const normalizedPath = url.pathname
    .replace(/\/+/g, '/')
    .replace(/\/+$/, '')
  const prefix = normalizedPath.replace(/\/openai\/v1$/, '')
  url.pathname = `${prefix}/openai/v1/responses`
  url.search = ''
  url.hash = ''
  return url.toString()
}

function abortableSleep(
  milliseconds: number,
  signal: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason)
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', onAbort)
      reject(signal.reason)
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, milliseconds)
    signal.addEventListener('abort', onAbort, { once: true })
    if (signal.aborted) onAbort()
  })
}

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : null
}

async function responseBody(
  response: Response,
): Promise<Record<string, unknown> | null> {
  try {
    return asObject(await response.json())
  } catch {
    return null
  }
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function usageFrom(body: Record<string, unknown>): ProviderUsage {
  const usage = asObject(body.usage)
  const details = asObject(usage?.output_tokens_details)
  return {
    inputTokens: numberOrNull(usage?.input_tokens),
    outputTokens: numberOrNull(usage?.output_tokens),
    reasoningTokens: numberOrNull(details?.reasoning_tokens),
  }
}

function responseIdFrom(body: Record<string, unknown> | null): string | null {
  return typeof body?.id === 'string' ? body.id : null
}

function finalOutput(body: Record<string, unknown>): {
  text: string | null
  refused: boolean
} {
  const output = Array.isArray(body.output) ? body.output : []
  for (let outputIndex = output.length - 1; outputIndex >= 0; outputIndex -= 1) {
    const outputItem = output[outputIndex]
    const content = asObject(outputItem)?.content
    if (!Array.isArray(content) || content.length === 0) continue
    const item = asObject(content.at(-1))
    if (item?.type === 'output_text' && typeof item.text === 'string') {
      return { text: item.text, refused: false }
    }
    return { text: null, refused: item?.type === 'refusal' }
  }
  return { text: null, refused: false }
}

function safeIncompleteDetails(value: unknown): string | null {
  const reason = asObject(value)?.reason
  if (reason === 'max_output_tokens' || reason === 'content_filter') {
    return reason
  }
  return value === undefined || value === null ? null : 'provider_incomplete'
}

function explicitlyRejectsSchema(body: Record<string, unknown> | null): boolean {
  const error = asObject(body?.error)
  const code = error?.code
  const parameter = error?.param
  const message = error?.message
  if (code === 'unsupported_response_format') return true
  return (
    code === 'unsupported_value' &&
    typeof parameter === 'string' &&
    parameter.includes('format') &&
    typeof message === 'string' &&
    message.includes('json_schema')
  )
}

function schemaPayload<T>(
  config: ServerConfig,
  request: StructuredCall<T>,
): Record<string, unknown> {
  return {
    model: config.model,
    reasoning: { effort: config.reasoningEffort },
    max_output_tokens: config.maxOutputTokens,
    instructions: request.instructions,
    input: request.input,
    text: {
      format: {
        type: 'json_schema',
        name: request.schemaName,
        strict: true,
        schema: request.jsonSchema,
      },
    },
  }
}

function fallbackPayload<T>(
  config: ServerConfig,
  request: StructuredCall<T>,
): Record<string, unknown> {
  return {
    model: config.model,
    reasoning: { effort: config.reasoningEffort },
    max_output_tokens: config.maxOutputTokens,
    instructions: `${request.instructions}\nReturn only strict JSON matching the requested schema.`,
    input: request.input,
    text: { format: { type: 'json_object' } },
  }
}

function repairPayload<T>(
  config: ServerConfig,
  request: StructuredCall<T>,
  invalidJson: string,
  format: 'json_schema' | 'json_object',
): Record<string, unknown> {
  return {
    model: config.model,
    reasoning: { effort: config.reasoningEffort },
    max_output_tokens: config.maxOutputTokens,
    instructions:
      'Repair the supplied JSON. Return only JSON matching the target schema.',
    input: invalidJson,
    text:
      format === 'json_object'
        ? { format: { type: 'json_object' } }
        : {
            format: {
              type: 'json_schema',
              name: request.schemaName,
              strict: true,
              schema: request.jsonSchema,
            },
          },
  }
}

export function createResponsesClient(
  dependencies: ResponsesClientDependencies,
): ResponsesClient {
  const {
    config,
    fetch: fetchImplementation = globalThis.fetch,
    sleep = abortableSleep,
    jitter = () => Math.floor(Math.random() * 101),
    recorder,
    log,
    now = () => new Date(),
    makeCallId = randomUUID,
  } = dependencies
  const endpoint = endpointFor(config.baseUrl)
  const secrets = [config.apiKey]

  function logSafely(message: string) {
    if (log === undefined) return
    try {
      log(message)
    } catch {
      // Console logging must never change provider behavior.
    }
  }

  async function fetchAttempt(
    payload: Record<string, unknown>,
    callerSignal: AbortSignal,
  ): Promise<AttemptResponse | AttemptFailure> {
    const timeoutController = new AbortController()
    const timeout = setTimeout(
      () => timeoutController.abort(),
      config.timeoutMs,
    )
    const signal = AbortSignal.any([callerSignal, timeoutController.signal])
    try {
      const response = await fetchImplementation(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
        },
        body: JSON.stringify(payload),
        signal,
      })
      return { response, body: await responseBody(response) }
    } catch {
      if (callerSignal.aborted) return { errorCode: 'cancelled' }
      if (timeoutController.signal.aborted) return { errorCode: 'timeout' }
      return { errorCode: 'network_error' }
    } finally {
      clearTimeout(timeout)
    }
  }

  async function fetchWithRetries(
    payload: Record<string, unknown>,
    callerSignal: AbortSignal,
  ): Promise<AttemptResponse | AttemptFailure> {
    for (let attempt = 0; attempt <= 2; attempt += 1) {
      const outcome = await fetchAttempt(payload, callerSignal)
      if ('response' in outcome) {
        if (!RETRYABLE_STATUS.has(outcome.response.status) || attempt === 2) {
          return outcome
        }
      } else if (outcome.errorCode === 'cancelled' || attempt === 2) {
        return outcome
      }

      try {
        const jitterMs = Math.min(100, Math.max(0, Math.floor(jitter())))
        await sleep(250 * 2 ** attempt + jitterMs, callerSignal)
      } catch {
        return {
          errorCode: callerSignal.aborted ? 'cancelled' : 'network_error',
        }
      }
    }
    return { errorCode: 'network_error' }
  }

  async function rawCall(
    payload: Record<string, unknown>,
    callerSignal: AbortSignal,
  ): Promise<RawCall> {
    const startedAt = now()
    const outcome = await fetchWithRetries(payload, callerSignal)
    const endedAt = now()
    const timing = { startedAt, endedAt }

    if (!('response' in outcome)) {
      const code = outcome.errorCode
      return {
        ...timing,
        state: code === 'cancelled' ? 'cancelled' : 'failed',
        providerRequestId: null,
        providerResponseId: null,
        usage: EMPTY_USAGE,
        error: safeError(code),
        unsupportedSchemaFormat: false,
      }
    }

    const { response, body } = outcome
    const metadata = {
      ...timing,
      providerRequestId: response.headers.get('x-request-id'),
      providerResponseId: responseIdFrom(body),
      usage: body === null ? EMPTY_USAGE : usageFrom(body),
    }

    if (!response.ok) {
      const retryable = RETRYABLE_STATUS.has(response.status)
      const code = retryable ? 'provider_unavailable' : 'provider_rejected'
      return {
        ...metadata,
        state: 'failed',
        error: safeError(code),
        unsupportedSchemaFormat:
          response.status === 400 && explicitlyRejectsSchema(body),
      }
    }
    if (body === null) {
      return {
        ...metadata,
        state: 'failed',
        error: safeError('invalid_provider_response'),
        unsupportedSchemaFormat: false,
      }
    }
    if (body.status === 'incomplete') {
      return {
        ...metadata,
        state: 'incomplete',
        incompleteDetails: safeIncompleteDetails(body.incomplete_details),
      }
    }
    if (body.status !== 'completed') {
      return {
        ...metadata,
        state: 'failed',
        error: safeError('invalid_provider_response'),
        unsupportedSchemaFormat: false,
      }
    }

    const output = finalOutput(body)
    if (output.text === null) {
      return { ...metadata, state: 'refusal_empty' }
    }
    return { ...metadata, state: 'completed', outputText: output.text }
  }

  function record(
    raw: RawCall,
    stage: ProviderStage,
    jobId: string | undefined,
    state = raw.state,
    errorCode: string | null =
      raw.state === 'failed' || raw.state === 'cancelled'
        ? raw.error.code
        : null,
  ) {
    if (recorder === undefined) return
    const telemetry: CallTelemetry = {
      callId: makeCallId(),
      jobId: jobId ?? null,
      providerRequestId: raw.providerRequestId,
      providerResponseId: raw.providerResponseId,
      stage,
      model: config.model,
      reasoningEffort: config.reasoningEffort,
      status: state,
      startedAt: raw.startedAt,
      endedAt: raw.endedAt,
      wallMs: Math.max(0, raw.endedAt.getTime() - raw.startedAt.getTime()),
      inputTokens: raw.usage.inputTokens,
      outputTokens: raw.usage.outputTokens,
      reasoningTokens: raw.usage.reasoningTokens,
      incompleteDetails:
        raw.state === 'incomplete' ? raw.incompleteDetails : null,
      errorCode,
      cancelDetails: raw.state === 'cancelled' ? 'caller_abort' : null,
    }
    try {
      recorder.record(telemetry)
    } catch {
      // Telemetry failures must not alter provider behavior or expose content.
    }
  }

  function nonCompleted<T>(
    raw: Exclude<RawCall, RawCompleted>,
  ): ProviderResult<T> {
    const metadata = {
      providerRequestId: raw.providerRequestId,
      providerResponseId: raw.providerResponseId,
      usage: raw.usage,
    }
    if (raw.state === 'incomplete') {
      return {
        ...metadata,
        state: 'incomplete',
        incompleteDetails: raw.incompleteDetails,
      }
    }
    if (raw.state === 'refusal_empty') {
      return { ...metadata, state: 'refusal_empty' }
    }
    return { ...metadata, state: raw.state, error: raw.error }
  }

  async function callStructured<T>(
    request: StructuredCall<T>,
    signal: AbortSignal,
  ): Promise<ProviderResult<T>> {
    logSafely(
      formatGptRequestLog({
        stage: request.stage,
        jobId: request.jobId,
        endpoint,
        model: config.model,
        format: 'json_schema',
        instructions: request.instructions,
        promptInput: request.input,
        secrets,
      }),
    )
    let raw = await rawCall(schemaPayload(config, request), signal)
    let acceptedFormat: 'json_schema' | 'json_object' = 'json_schema'
    if (
      raw.state === 'failed' &&
      raw.unsupportedSchemaFormat &&
      !signal.aborted
    ) {
      record(raw, request.stage, request.jobId)
      logSafely(
        formatGptRequestLog({
          stage: request.stage,
          jobId: request.jobId,
          endpoint,
          model: config.model,
          format: 'json_object',
          instructions: request.instructions,
          promptInput: request.input,
          secrets,
        }),
      )
      raw = await rawCall(fallbackPayload(config, request), signal)
      acceptedFormat = 'json_object'
    }

    const logResponse = (
      state: string,
      outputText?: string,
      error?: string,
    ) => {
      logSafely(
        formatGptResponseLog({
          stage: request.stage,
          jobId: request.jobId,
          endpoint,
          state,
          responseId: raw.providerResponseId,
          wallMs: Math.max(0, raw.endedAt.getTime() - raw.startedAt.getTime()),
          inputTokens: raw.usage.inputTokens,
          outputTokens: raw.usage.outputTokens,
          reasoningTokens: raw.usage.reasoningTokens,
          outputText,
          error,
          secrets,
        }),
      )
    }

    if (raw.state !== 'completed') {
      record(raw, request.stage, request.jobId)
      logResponse(
        raw.state,
        undefined,
        raw.state === 'failed' || raw.state === 'cancelled'
          ? raw.error.message
          : undefined,
      )
      return nonCompleted(raw)
    }

    try {
      const value = request.parse(JSON.parse(raw.outputText) as unknown)
      record(raw, request.stage, request.jobId)
      logResponse('completed', raw.outputText)
      return {
        state: 'completed',
        value,
        repaired: false,
        providerRequestId: raw.providerRequestId,
        providerResponseId: raw.providerResponseId,
        usage: raw.usage,
      }
    } catch {
      record(raw, request.stage, request.jobId, 'completed', 'invalid_output')
    }

    logSafely(
      formatGptRequestLog({
        stage: 'json_repair',
        jobId: request.jobId,
        endpoint,
        model: config.model,
        format: acceptedFormat,
        instructions:
          'Repair the supplied JSON. Return only JSON matching the target schema.',
        promptInput: raw.outputText,
        secrets,
      }),
    )
    const repaired = await rawCall(
      repairPayload(config, request, raw.outputText, acceptedFormat),
      signal,
    )
    raw = repaired
    if (repaired.state !== 'completed') {
      record(repaired, 'json_repair', request.jobId)
      logResponse(
        repaired.state,
        undefined,
        repaired.state === 'failed' || repaired.state === 'cancelled'
          ? repaired.error.message
          : 'invalid_output',
      )
      if (
        repaired.state === 'incomplete' ||
        repaired.state === 'refusal_empty'
      ) {
        return {
          state: 'failed',
          error: safeError('invalid_output'),
          providerRequestId: repaired.providerRequestId,
          providerResponseId: repaired.providerResponseId,
          usage: repaired.usage,
        }
      }
      return nonCompleted(repaired)
    }

    try {
      const value = request.parse(JSON.parse(repaired.outputText) as unknown)
      record(repaired, 'json_repair', request.jobId)
      logResponse('completed', repaired.outputText)
      return {
        state: 'completed',
        value,
        repaired: true,
        providerRequestId: repaired.providerRequestId,
        providerResponseId: repaired.providerResponseId,
        usage: repaired.usage,
      }
    } catch {
      record(
        repaired,
        'json_repair',
        request.jobId,
        'completed',
        'invalid_output',
      )
      logResponse('failed', repaired.outputText, 'invalid_output')
      return {
        state: 'failed',
        error: safeError('invalid_output'),
        providerRequestId: repaired.providerRequestId,
        providerResponseId: repaired.providerResponseId,
        usage: repaired.usage,
      }
    }
  }

  return { callStructured }
}
