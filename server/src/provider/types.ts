export type ProviderStage = 'extractor' | 'core' | 'critic' | 'json_repair'

export type ProviderState =
  | 'completed'
  | 'incomplete'
  | 'refusal_empty'
  | 'failed'
  | 'cancelled'

export interface StructuredCall<T> {
  stage: Exclude<ProviderStage, 'json_repair'>
  jobId?: string
  instructions: string
  input: string
  schemaName: string
  jsonSchema: Record<string, unknown>
  parse: (value: unknown) => T
}

export interface ProviderUsage {
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
}

export type ProviderErrorCode =
  | 'cancelled'
  | 'timeout'
  | 'network_error'
  | 'provider_unavailable'
  | 'provider_rejected'
  | 'invalid_provider_response'
  | 'invalid_output'

export interface SafeProviderError {
  code: ProviderErrorCode
  message: string
}

interface ProviderResultBase {
  state: ProviderState
  providerRequestId: string | null
  providerResponseId: string | null
  usage: ProviderUsage
}

export interface CompletedProviderResult<T> extends ProviderResultBase {
  state: 'completed'
  value: T
  repaired: boolean
}

export interface IncompleteProviderResult extends ProviderResultBase {
  state: 'incomplete'
  incompleteDetails: string | null
}

export interface RefusalEmptyProviderResult extends ProviderResultBase {
  state: 'refusal_empty'
}

export interface FailedProviderResult extends ProviderResultBase {
  state: 'failed'
  error: SafeProviderError
}

export interface CancelledProviderResult extends ProviderResultBase {
  state: 'cancelled'
  error: SafeProviderError
}

export type ProviderResult<T> =
  | CompletedProviderResult<T>
  | IncompleteProviderResult
  | RefusalEmptyProviderResult
  | FailedProviderResult
  | CancelledProviderResult

export interface CallTelemetry {
  callId: string
  jobId: string | null
  providerRequestId: string | null
  providerResponseId: string | null
  stage: ProviderStage
  model: string
  reasoningEffort: string | null
  status: ProviderState
  startedAt: Date
  endedAt: Date
  wallMs: number
  inputTokens: number | null
  outputTokens: number | null
  reasoningTokens: number | null
  incompleteDetails: string | null
  errorCode: string | null
  cancelDetails: string | null
}

export interface CallRecorder {
  record(call: CallTelemetry): void
}
