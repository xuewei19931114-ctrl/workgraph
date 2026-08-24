import { z } from 'zod'

import {
  EpisodeSchema,
  type Episode,
} from '../../../shared/profile-schemas.js'
import {
  EVIDENCE_EXTRACTOR_PROMPT_VERSION,
  buildEvidenceExtractorPrompt,
} from '../prompts/evidence-extractor.js'
import type { ResponsesClient } from '../provider/responses-client.js'
import type {
  ProviderErrorCode,
  ProviderResult,
} from '../provider/types.js'
import type { TranscriptChunk } from './context-strategy.js'

const EpisodeBatchSchema = z.array(EpisodeSchema)

export class InferenceCallError extends Error {
  readonly kind: 'cancelled' | 'provider_failed'

  constructor(
    readonly providerCode:
      | ProviderErrorCode
      | 'incomplete'
      | 'refusal_empty',
    readonly providerState: ProviderResult<unknown>['state'],
  ) {
    const kind = providerCode === 'cancelled' ? 'cancelled' : 'provider_failed'
    super(
      kind === 'cancelled'
        ? 'Inference call was cancelled.'
        : `Inference provider did not complete (${providerCode}).`,
    )
    this.name = 'InferenceCallError'
    this.kind = kind
  }
}

export function inferenceCallError(
  result: Exclude<ProviderResult<unknown>, { state: 'completed' }>,
): InferenceCallError {
  const providerCode =
    result.state === 'failed' || result.state === 'cancelled'
      ? result.error.code
      : result.state
  return new InferenceCallError(providerCode, result.state)
}

export async function runEvidenceExtractor(
  chunk: TranscriptChunk,
  input: {
    jobId: string
    signal: AbortSignal
    provider: ResponsesClient
  },
): Promise<Episode[]> {
  const result = await input.provider.callStructured(
    {
      stage: 'extractor',
      jobId: input.jobId,
      instructions: `${buildEvidenceExtractorPrompt()}\n\nPrompt version: ${EVIDENCE_EXTRACTOR_PROMPT_VERSION}`,
      input: JSON.stringify({ transcript_chunk: chunk }),
      schemaName: 'episode_batch',
      jsonSchema: z.toJSONSchema(EpisodeBatchSchema) as Record<string, unknown>,
      parse: (value) => EpisodeBatchSchema.parse(value),
    },
    input.signal,
  )

  if (result.state === 'completed') {
    try {
      return EpisodeBatchSchema.parse(result.value)
    } catch {
      throw new InferenceCallError('invalid_output', 'failed')
    }
  }
  throw inferenceCallError(result)
}
