import {
  CandidateModelSchema,
  TranscriptSchema,
  type CandidateModel,
  type Episode,
  type Transcript,
} from '../../../shared/profile-schemas.js'
import type { UiCandidateModel } from '../../../shared/ui-model.js'
import type { JobStatus } from '../db/repository.js'
import { resolveCoreInferencePromptVersion } from '../prompts/core-inference.js'
import { CRITIC_PROMPT_VERSION } from '../prompts/critic.js'
import { EVIDENCE_EXTRACTOR_PROMPT_VERSION } from '../prompts/evidence-extractor.js'
import type { ResponsesClient } from '../provider/responses-client.js'
import { toUiCandidateModel } from '../report/to-ui-model.js'
import {
  validateCandidateInvariants,
  type InvariantIssue,
} from '../schemas/invariants.js'
import { repairCandidateEvidence } from '../schemas/repair-evidence.js'
import {
  chooseContextPath,
  chunkTranscript,
  type TranscriptChunk,
} from './context-strategy.js'
import {
  runCoreInference,
  type CoreInferenceInput,
} from './core-runner.js'
import { runCritic, type CriticResult } from './critic-runner.js'
import {
  InferenceCallError,
  runEvidenceExtractor,
} from './evidence-runner.js'
import { mergeEpisodes } from './episode-merger.js'
import {
  createStageLogger,
  transcriptStageSummary,
  type StageLogger,
} from './stage-log.js'

export interface PipelineInput {
  jobId: string
  candidateId: string
  transcript: Transcript
  enableCritic: boolean
  signal: AbortSignal
}

export interface PipelineResult {
  status: 'completed' | 'unresolved' | 'failed' | 'cancelled'
  canonicalModel?: CandidateModel
  uiModel?: UiCandidateModel
  critic?: CriticResult
  invariantIssues: InvariantIssue[]
}

interface PipelineRepository {
  updateJobStatus(
    jobId: string,
    status: JobStatus,
    details?: {
      progress?: number
      stageMessage?: string
      criticVerdict?: CriticResult['verdict']
      errorCode?: string | null
      errorMessage?: string | null
    },
  ): unknown
  saveModel(input: {
    candidateId: string
    jobId: string
    canonicalModel: CandidateModel
    uiModel: UiCandidateModel
    critic: CriticResult | null
    status: 'completed' | 'unresolved'
  }): unknown
}

export interface PipelineDependencies {
  provider: ResponsesClient
  repository: PipelineRepository
  context: {
    maxEstimatedTokens: number
    fixedPromptAndSchemaReserve: number
    extractorConcurrency: number
  }
  now: () => Date
  log?: StageLogger
}

const HARD_POLICY_ISSUES = new Set<InvariantIssue['code']>([
  'INVALID_EVIDENCE_REFERENCE',
  'AI_ATTRIBUTION_LEAK',
  'THIRD_PARTY_ATTRIBUTION_LEAK',
  'MISSING_AS_WEAKNESS',
  'ROLE_INFLATION',
  'RISK_EVIDENCE_CEILING',
  'INCOMPLETE_ARCHETYPE_COMPETITION',
  'INVALID_QUOTE_PROVENANCE',
  'GENERIC_ATTRACTOR',
  'OPERATOR_WITHOUT_ACTION',
  'AGENCY_JUDGMENT_COLLAPSE',
])

function toConservativeUnderResolvedCopy(
  model: CandidateModel,
): CandidateModel {
  const nullArchetype = model.archetype_competition.find(
    ({ type }) => type === 'null',
  )
  const transformed = {
    ...model,
    working_archetype: {
      ...model.working_archetype,
      name_cn: '待验证',
      name_en: 'Under-resolved',
      definition: '证据归属存在歧义，当前无法形成可靠候选人原型。',
      explanatory_confidence: Math.min(
        model.working_archetype.explanatory_confidence,
        0.4,
      ),
      outcome_validation_confidence: Math.min(
        model.working_archetype.outcome_validation_confidence,
        0.4,
      ),
      evidence_status: 'unknown' as const,
      claim_polarity: 'neutral' as const,
      supporting_evidence_ids: [],
    },
    core_loop: [],
    why_different: {
      claim: '证据不足，差异化能力待验证。',
      evidence_status: 'unknown' as const,
      claim_polarity: 'neutral' as const,
      confidence: 0.2,
      supporting_evidence_ids: [],
    },
    mechanisms: [],
    capabilities: [],
    archetype_competition_winner: nullArchetype?.id ?? null,
    archetype_competition: model.archetype_competition.map((candidate) => ({
      ...candidate,
      name: `${candidate.type} 原型待验证`,
      explains: [],
      fails_to_explain: [],
      unsupported_assumptions: [],
      cross_context_generalization: Math.min(
        candidate.cross_context_generalization,
        0.4,
      ),
      discriminative_power: Math.min(candidate.discriminative_power, 0.4),
    })),
    strongest_counterargument: {
      argument: '证据不足，替代解释待验证。',
      what_it_explains: '当前仅保留原始 Episode 供追溯。',
      what_it_fails_to_explain: '无法在归属歧义下形成可靠结论。',
      why_it_does_or_does_not_win: '在获得可验证证据前保持未解决。',
      evidence_status: 'unknown' as const,
      claim_polarity: 'neutral' as const,
      confidence: 0.2,
      supporting_evidence_ids: [],
    },
    strength_risk_pairs: [],
    role_fit: [],
    evidence_boundaries: [],
    hiring_manager_summary: {
      claims: [
        {
          claim: '证据不足，候选人画像待验证。',
          evidence_status: 'unknown' as const,
          claim_polarity: 'neutral' as const,
          confidence: 0.2,
          supporting_evidence_ids: [],
        },
      ],
      seniority_claims: [],
    },
  }
  return CandidateModelSchema.parse(transformed)
}

function criticReferencesAreValid(
  critic: CriticResult,
  transcript: Transcript,
  model: CandidateModel,
): boolean {
  const validIds = new Set([
    ...transcript.conversations.flatMap(({ messages }) =>
      messages.map(({ message_id }) => message_id),
    ),
    ...model.high_signal_episodes.map(({ episode_id }) => episode_id),
  ])
  return critic.issues.every(({ evidence_ids }) =>
    evidence_ids.every((id) => validIds.has(id)),
  )
}

async function runExtractorPool(
  chunks: TranscriptChunk[],
  input: PipelineInput,
  dependencies: PipelineDependencies,
): Promise<Episode[][]> {
  if (
    !Number.isInteger(dependencies.context.extractorConcurrency) ||
    dependencies.context.extractorConcurrency < 1
  ) {
    throw new Error('Extractor concurrency must be a positive integer.')
  }

  const siblingController = new AbortController()
  const abortSiblings = () => siblingController.abort(input.signal.reason)
  input.signal.addEventListener('abort', abortSiblings, { once: true })
  if (input.signal.aborted) abortSiblings()

  const batches = new Array<Episode[]>(chunks.length)
  let nextIndex = 0
  let firstFailure: unknown
  const worker = async () => {
    while (!siblingController.signal.aborted) {
      const index = nextIndex
      if (index >= chunks.length) return
      nextIndex += 1
      try {
        batches[index] = await runEvidenceExtractor(chunks[index]!, {
          jobId: input.jobId,
          signal: siblingController.signal,
          provider: dependencies.provider,
        })
      } catch (error) {
        if (firstFailure === undefined) firstFailure = error
        siblingController.abort(error)
        return
      }
    }
  }

  try {
    const workerCount = Math.min(
      dependencies.context.extractorConcurrency,
      chunks.length,
    )
    await Promise.allSettled(
      Array.from({ length: workerCount }, () => worker()),
    )
  } finally {
    input.signal.removeEventListener('abort', abortSiblings)
  }

  if (input.signal.aborted) {
    throw new InferenceCallError('cancelled', 'cancelled')
  }
  if (firstFailure !== undefined) throw firstFailure
  return batches
}

function failureCode(error: unknown): string {
  if (!(error instanceof InferenceCallError)) return 'INTERNAL_ERROR'
  const codes = {
    timeout: 'PROVIDER_TIMEOUT',
    network_error: 'PROVIDER_NETWORK_ERROR',
    provider_unavailable: 'PROVIDER_UNAVAILABLE',
    provider_rejected: 'PROVIDER_REJECTED',
    invalid_provider_response: 'PROVIDER_INVALID_RESPONSE',
    invalid_output: 'PROVIDER_INVALID_OUTPUT',
    refusal_empty: 'PROVIDER_REJECTED',
    incomplete: 'PROVIDER_INCOMPLETE',
    cancelled: 'CANCELLED',
  } as const
  return codes[error.providerCode]
}

export async function runProfileInference(
  rawInput: PipelineInput,
  dependencies: PipelineDependencies,
): Promise<PipelineResult> {
  let currentStatus: JobStatus = 'queued'
  let invariantIssues: InvariantIssue[] = []
  const stage = createStageLogger(dependencies.log, rawInput.jobId)
  const transition = (
    status: JobStatus,
    details?: Parameters<PipelineRepository['updateJobStatus']>[2],
  ) => {
    dependencies.repository.updateJobStatus(rawInput.jobId, status, details)
    currentStatus = status
    stage(`status=${status}`)
  }

  try {
    stage(
      `start critic=${rawInput.enableCritic} note=reviewer-brain is one Core call with 17 reasoning steps, not 17 HTTP calls`,
    )
    transition('parsing')
    if (rawInput.signal.aborted) {
      throw new InferenceCallError('cancelled', 'cancelled')
    }
    const transcript = TranscriptSchema.parse(rawInput.transcript)
    stage(`00_parse ${transcriptStageSummary(transcript)}`)
    stage(
      `uploaded_transcript\n${JSON.stringify(transcript, null, 2)}`,
    )
    const input = { ...rawInput, transcript }
    const path = chooseContextPath(transcript, dependencies.context)
    stage(
      `context path=${path} tokenLimit=${dependencies.context.maxEstimatedTokens}`,
    )
    let coreInput: CoreInferenceInput

    if (path === 'direct') {
      stage('extractor skipped (transcript fits Core context)')
      transition('inferring')
      coreInput = { transcript }
    } else {
      transition('extracting')
      const chunks = chunkTranscript(
        transcript,
        dependencies.context.maxEstimatedTokens,
        dependencies.context.fixedPromptAndSchemaReserve,
      )
      stage(
        `extractor start chunks=${chunks.length} concurrency=${dependencies.context.extractorConcurrency} prompt=${EVIDENCE_EXTRACTOR_PROMPT_VERSION}`,
      )
      const batches = await runExtractorPool(chunks, input, dependencies)
      const episodes = mergeEpisodes(batches, transcript)
      stage(`extractor done episodes=${episodes.length}`)
      transition('inferring')
      coreInput = { episodes }
    }

    stage(
      `core start prompt=${resolveCoreInferencePromptVersion()} input=${'transcript' in coreInput ? 'full_transcript' : 'merged_episodes'} steps=17`,
    )
    let canonicalModel = await runCoreInference(coreInput, {
      jobId: input.jobId,
      signal: input.signal,
      provider: dependencies.provider,
    })
    const winner = canonicalModel.archetype_competition.find(
      (candidate) =>
        candidate.id === canonicalModel.archetype_competition_winner,
    )
    stage(
      `core done archetype=${canonicalModel.working_archetype.name_cn} winner=${canonicalModel.archetype_competition_winner ?? 'null'} winnerType=${winner?.type ?? 'none'} episodes=${canonicalModel.high_signal_episodes.length} capabilities=${canonicalModel.capabilities.length} coreLoop=${canonicalModel.core_loop.length}`,
    )

    let critic: CriticResult | undefined
    if (input.enableCritic) {
      transition('criticizing')
      stage(`critic start prompt=${CRITIC_PROMPT_VERSION}`)
      critic = await runCritic(
        { model: canonicalModel, transcript },
        {
          jobId: input.jobId,
          signal: input.signal,
          provider: dependencies.provider,
        },
      )
      stage(`critic done verdict=${critic.verdict}`)
    } else {
      stage('critic skipped (enableCritic=false)')
    }

    if (input.signal.aborted) {
      throw new InferenceCallError('cancelled', 'cancelled')
    }
    transition('validating', {
      criticVerdict: critic?.verdict,
    })
    if (
      critic !== undefined &&
      !criticReferencesAreValid(critic, transcript, canonicalModel)
    ) {
      stage('validate failed critic_unknown_evidence')
      transition('failed', {
        errorCode: 'MODEL_POLICY_VIOLATION',
        errorMessage: 'Critic referenced unknown evidence.',
      })
      return { status: 'failed', invariantIssues }
    }

    const repaired = repairCandidateEvidence(canonicalModel, transcript)
    canonicalModel = repaired.model
    stage(
      `05_repair rebound=${repaired.reboundEpisodes} droppedEpisodes=${repaired.droppedEpisodes} droppedMessageRefs=${repaired.droppedMessageRefs} droppedEvidenceRefs=${repaired.droppedEvidenceRefs} downgradedClaims=${repaired.downgradedClaims} nulledQuotes=${repaired.nulledQuotes}`,
    )
    invariantIssues = validateCandidateInvariants(canonicalModel, transcript)
    stage(
      `06_invariants count=${invariantIssues.length} ${
        invariantIssues
          .slice(0, 12)
          .map((issue) => `${issue.code}@${issue.path}`)
          .join(',') || 'codes=none'
      }`,
    )
    if (invariantIssues.some(({ code }) => HARD_POLICY_ISSUES.has(code))) {
      stage('validate failed hard_policy')
      transition('failed', {
        errorCode: 'MODEL_POLICY_VIOLATION',
        errorMessage: 'Candidate model violated deterministic policy.',
      })
      return { status: 'failed', invariantIssues }
    }
    const ambiguousAttribution = invariantIssues.some(
      ({ code }) => code === 'AMBIGUOUS_ATTRIBUTION',
    )
    if (ambiguousAttribution) {
      stage('ambiguous_attribution applying conservative under-resolved copy')
      canonicalModel = toConservativeUnderResolvedCopy(canonicalModel)
      invariantIssues = validateCandidateInvariants(canonicalModel, transcript)
      if (invariantIssues.length > 0) {
        stage(
          `conservative copy still invalid codes=${invariantIssues.map((issue) => issue.code).join(',')}`,
        )
        transition('failed', {
          errorCode: 'MODEL_POLICY_VIOLATION',
          errorMessage:
            'Conservative candidate model violated deterministic policy.',
        })
        return { status: 'failed', invariantIssues }
      }
    }

    const uiModel = toUiCandidateModel(canonicalModel, {
      generatedAt: dependencies.now().getTime(),
      sourceLabel: transcript.source_type,
    })
    const status: 'completed' | 'unresolved' =
      ambiguousAttribution ||
      (critic !== undefined && critic.verdict !== 'pass')
        ? 'unresolved'
        : 'completed'
    stage(
      `07_ui headline=${uiModel.headline} unknownCount=${uiModel.unknownCount} dimensionCount=${uiModel.dimensionCount} jobStatus=${status}`,
    )

    dependencies.repository.saveModel({
      candidateId: input.candidateId,
      jobId: input.jobId,
      canonicalModel,
      uiModel,
      critic: critic ?? null,
      status,
    })
    currentStatus = status
    stage(`done status=${status}`)
    return {
      status,
      canonicalModel,
      uiModel,
      critic,
      invariantIssues,
    }
  } catch (error) {
    const cancelled =
      rawInput.signal.aborted ||
      (error instanceof InferenceCallError && error.kind === 'cancelled')
    const status = cancelled ? 'cancelled' : 'failed'
    stage(
      `${status} ${error instanceof Error ? error.message : 'unknown error'}`,
    )
    const terminalStatuses: JobStatus[] = [
      'completed',
      'unresolved',
      'failed',
      'cancelled',
    ]
    if (!terminalStatuses.includes(currentStatus)) {
      transition(status, {
        errorCode: cancelled ? 'CANCELLED' : failureCode(error),
        errorMessage: cancelled
          ? 'Profile inference was cancelled.'
          : 'Profile inference failed.',
      })
    }
    return { status, invariantIssues }
  }
}
