import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import {
  CandidateModelSchema,
  TranscriptSchema,
} from '../../shared/profile-schemas.js'
import { loadConfig } from '../src/config.js'
import { createRepository } from '../src/db/repository.js'
import { runProfileInference } from '../src/inference/pipeline.js'
import { loadOptionalEnvFiles } from '../src/load-env.js'
import { createResponsesClient } from '../src/provider/responses-client.js'
import type { CallTelemetry } from '../src/provider/types.js'
import { validateCandidateInvariants } from '../src/schemas/invariants.js'

export const EXPECTED_CORE_CALL_COUNT = 1

export const SMOKE_MAX_ESTIMATED_TOKENS = 400_000
export const SMOKE_FIXED_PROMPT_AND_SCHEMA_RESERVE = 20_000

export function smokeCallBudgetFailure(
  calls: ReadonlyArray<{ stage: string }>,
): string | null {
  const forbidden = [
    ...new Set(
      calls
        .map((call) => call.stage)
        .filter((stage) => stage === 'extractor' || stage === 'critic'),
    ),
  ]
  if (forbidden.length > 0) {
    return `Unexpected smoke stages: ${forbidden.join(',')}. Expected direct core only.`
  }
  const coreCount = calls.filter((call) => call.stage === 'core').length
  if (coreCount !== EXPECTED_CORE_CALL_COUNT) {
    return `Expected ${EXPECTED_CORE_CALL_COUNT} core call(s), recorded ${coreCount}.`
  }
  const repairCount = calls.filter((call) => call.stage === 'json_repair').length
  if (repairCount > 1) {
    return `json_repair may occur at most once, recorded ${repairCount}.`
  }
  return null
}

export function formatSafeSmokeError(
  error: unknown,
  secrets: readonly string[] = [],
): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : 'unknown error'
  const uniqueSecrets = [
    ...new Set(secrets.filter((secret) => secret.length > 0)),
  ]
  const redacted = uniqueSecrets.reduce(
    (text, secret) => text.split(secret).join('[redacted]'),
    raw,
  )
  return `Paid profile smoke failed. ${redacted}`
}

export const SMOKE_TRANSCRIPT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../test/fixtures/profile-smoke-transcript.json',
)

export function missingSmokeEnv(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const missing: string[] = []
  if (!env.GPT56_API_KEY?.trim()) missing.push('GPT56_API_KEY')
  if (!env.GPT56_BASE_URL?.trim()) missing.push('GPT56_BASE_URL')
  return missing
}

function isMainModule() {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(resolve(entry)).href
}

function loadSmokeTranscript() {
  return TranscriptSchema.parse(
    JSON.parse(readFileSync(SMOKE_TRANSCRIPT_PATH, 'utf8')) as unknown,
  )
}

function printTelemetry(calls: CallTelemetry[]) {
  for (const call of calls) {
    console.log(
      [
        `stage=${call.stage}`,
        `model=${call.model}`,
        `status=${call.status}`,
        `requestId=${call.providerRequestId ?? 'none'}`,
        `responseId=${call.providerResponseId ?? 'none'}`,
        `inputTokens=${call.inputTokens ?? 'none'}`,
        `outputTokens=${call.outputTokens ?? 'none'}`,
        `reasoningTokens=${call.reasoningTokens ?? 'none'}`,
      ].join(' '),
    )
  }
}

export async function runPaidProfileSmoke(
  env: NodeJS.ProcessEnv = process.env,
): Promise<number> {
  const missing = missingSmokeEnv(env)
  if (missing.length > 0) {
    console.error(
      `Refusing to run paid profile smoke. Set ${missing.join(' and ')}.`,
    )
    return 1
  }

  console.warn(
    `This command calls GPT-5.6 and incurs cost. Expected provider calls: ${EXPECTED_CORE_CALL_COUNT} (direct core inference, critic disabled).`,
  )

  const loaded = loadConfig(env)
  const config = {
    ...loaded,
    enableCritic: false,
    dbPath: ':memory:' as const,
  }
  const transcript = loadSmokeTranscript()
  const repository = createRepository(config.dbPath)
  const telemetry: CallTelemetry[] = []

  try {
    const stored = repository.createTranscript(
      transcript,
      new Date(Date.now() + config.transcriptRetentionDays * 86_400_000),
    )
    const job = repository.createJob({
      candidateId: transcript.candidate_id,
      transcriptId: stored.id,
      idempotencyKey: null,
      requestHash: 'smoke-profile',
      options: { enableCritic: false },
    })
    const result = await runProfileInference(
      {
        jobId: job.id,
        candidateId: transcript.candidate_id,
        transcript,
        enableCritic: false,
        signal: AbortSignal.timeout(config.timeoutMs),
      },
      {
        provider: createResponsesClient({
          config,
          recorder: {
            record(call) {
              telemetry.push(call)
            },
          },
        }),
        repository,
        context: {
          maxEstimatedTokens: SMOKE_MAX_ESTIMATED_TOKENS,
          fixedPromptAndSchemaReserve: SMOKE_FIXED_PROMPT_AND_SCHEMA_RESERVE,
          extractorConcurrency: config.extractorConcurrency,
        },
        now: () => new Date(),
      },
    )

    printTelemetry(telemetry)
    console.log(
      `pipelineStatus=${result.status} model=${config.model} expectedCalls=${EXPECTED_CORE_CALL_COUNT} recordedCalls=${telemetry.length}`,
    )

    const budgetFailure = smokeCallBudgetFailure(telemetry)
    if (budgetFailure) {
      console.error(budgetFailure)
      return 1
    }

    if (result.canonicalModel) {
      CandidateModelSchema.parse(result.canonicalModel)
      const issues = validateCandidateInvariants(
        result.canonicalModel,
        transcript,
      )
      if (issues.length > 0) {
        console.error(
          `invariantCodes=${issues.map((issue) => issue.code).join(',')}`,
        )
        return 1
      }
    }

    if (result.status !== 'completed') {
      console.error(`Smoke finished as ${result.status}.`)
      return 1
    }
    return 0
  } finally {
    repository.close()
  }
}

if (isMainModule()) {
  loadOptionalEnvFiles()
  void runPaidProfileSmoke()
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error(
        formatSafeSmokeError(error, [process.env.GPT56_API_KEY ?? '']),
      )
      process.exitCode = 1
    })
}
