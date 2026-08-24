import { z } from 'zod'

import {
  CandidateModelSchema,
  type CandidateModel,
  type Episode,
  type Transcript,
} from '../../../shared/profile-schemas.js'
import {
  CORE_INFERENCE_PROMPT_VERSION,
  buildCoreInferencePrompt,
} from '../prompts/core-inference.js'
import type { ResponsesClient } from '../provider/responses-client.js'
import {
  InferenceCallError,
  inferenceCallError,
} from './evidence-runner.js'

export type CoreInferenceInput =
  | { transcript: Transcript; episodes?: never }
  | { episodes: Episode[]; transcript?: never }

export async function runCoreInference(
  inferenceInput: CoreInferenceInput,
  input: {
    jobId: string
    signal: AbortSignal
    provider: ResponsesClient
  },
): Promise<CandidateModel> {
  const result = await input.provider.callStructured(
    {
      stage: 'core',
      jobId: input.jobId,
      instructions: `${buildCoreInferencePrompt()}\n\nPrompt version: ${CORE_INFERENCE_PROMPT_VERSION}`,
      input: JSON.stringify(inferenceInput),
      schemaName: 'candidate_model',
      jsonSchema: z.toJSONSchema(CandidateModelSchema) as Record<
        string,
        unknown
      >,
      parse: (value) => CandidateModelSchema.parse(value),
    },
    input.signal,
  )

  if (result.state === 'completed') {
    try {
      return CandidateModelSchema.parse(result.value)
    } catch {
      throw new InferenceCallError('invalid_output', 'failed')
    }
  }
  throw inferenceCallError(result)
}
