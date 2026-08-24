import type {
  ProfileRepository,
  ProviderCall,
} from '../db/repository.js'
import type { CallRecorder, CallTelemetry } from './types.js'

export interface ProviderCallRepository {
  recordProviderCall(call: Omit<ProviderCall, 'id'>): ProviderCall
}

export function createRepositoryCallRecorder(
  repository: Pick<ProfileRepository, 'recordProviderCall'>,
): CallRecorder {
  return {
    record(call: CallTelemetry) {
      repository.recordProviderCall({
        jobId: call.jobId,
        providerRequestId: call.providerRequestId,
        providerResponseId: call.providerResponseId,
        stage: call.stage,
        model: call.model,
        reasoningEffort: call.reasoningEffort,
        status: call.status,
        startedAt: call.startedAt,
        endedAt: call.endedAt,
        wallMs: call.wallMs,
        inputTokens: call.inputTokens,
        outputTokens: call.outputTokens,
        reasoningTokens: call.reasoningTokens,
        incompleteDetails: call.incompleteDetails,
        errorCode: call.errorCode,
      })
    },
  }
}
