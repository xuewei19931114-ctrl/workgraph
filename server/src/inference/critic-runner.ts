import { z } from 'zod'

import {
  CriticResultSchema,
  type CandidateModel,
  type CriticResult,
  type Transcript,
} from '../../../shared/profile-schemas.js'
import {
  CRITIC_PROMPT_VERSION,
  buildCriticPrompt,
} from '../prompts/critic.js'
import type { ResponsesClient } from '../provider/responses-client.js'
import {
  InferenceCallError,
  inferenceCallError,
} from './evidence-runner.js'

export { CriticResultSchema }
export type { CriticResult }

export async function runCritic(
  criticInput: { model: CandidateModel; transcript: Transcript },
  input: {
    jobId: string
    signal: AbortSignal
    provider: ResponsesClient
  },
): Promise<CriticResult> {
  const result = await input.provider.callStructured(
    {
      stage: 'critic',
      jobId: input.jobId,
      instructions: `${buildCriticPrompt()}\n\nPrompt version: ${CRITIC_PROMPT_VERSION}`,
      input: JSON.stringify(criticInput),
      schemaName: 'critic_result',
      jsonSchema: z.toJSONSchema(CriticResultSchema) as Record<string, unknown>,
      parse: (value) => CriticResultSchema.parse(value),
    },
    input.signal,
  )

  if (result.state === 'completed') {
    try {
      return CriticResultSchema.parse(result.value)
    } catch {
      throw new InferenceCallError('invalid_output', 'failed')
    }
  }
  throw inferenceCallError(result)
}
