import { z } from 'zod'

import { UiCandidateModelSchema } from './ui-model.js'

const IdSchema = z.string().min(1)
const ConfidenceSchema = z.number().min(0).max(1)
const EvidenceStatusSchema = z.enum([
  'observed',
  'inferred',
  'unknown',
  'missing',
])
const EvidenceCeilingSchema = z.enum(['observed', 'inferred', 'unknown'])
const SeniorityStatusSchema = z.enum(['observed', 'inferred', 'unknown'])
const ClaimPolaritySchema = z.enum(['positive', 'neutral', 'negative', 'risk'])

interface ClaimContract {
  evidence_status: z.infer<typeof EvidenceStatusSchema>
  claim_polarity: z.infer<typeof ClaimPolaritySchema>
  confidence: number
  supporting_evidence_ids: string[]
}

function claimContractMessages(claim: ClaimContract) {
  const messages: string[] = []
  const supported =
    claim.evidence_status === 'observed' ||
    claim.evidence_status === 'inferred'
  if (supported && claim.supporting_evidence_ids.length === 0) {
    messages.push('A supported claim requires at least one evidence ID.')
  }
  if (!supported && claim.claim_polarity !== 'neutral') {
    messages.push('An unknown or missing claim must be neutral.')
  }
  if (!supported && claim.confidence > 0.4) {
    messages.push(
      'An unknown or missing claim must keep confidence at or below 0.4.',
    )
  }
  return messages
}

const StructuredClaimSchema = z
  .object({
    claim: z.string(),
    evidence_status: EvidenceStatusSchema,
    claim_polarity: ClaimPolaritySchema,
    confidence: ConfidenceSchema,
    supporting_evidence_ids: z.array(IdSchema),
  })
  .strict()
  .superRefine((claim, context) => {
    claimContractMessages(claim).forEach((message) => {
      context.addIssue({ code: 'custom', message })
    })
  })

const MessageSchema = z
  .object({
    message_id: IdSchema,
    role: z.enum(['user', 'assistant', 'system', 'tool']),
    content: z.string(),
    timestamp: z.string().nullable(),
    authorship: z.enum([
      'user',
      'assistant',
      'third_party',
      'mixed',
      'unknown',
    ]),
  })
  .strict()

const ConversationSchema = z
  .object({
    conversation_id: IdSchema,
    title: z.string(),
    messages: z.array(MessageSchema),
  })
  .strict()

export const TranscriptSchema = z
  .object({
    candidate_id: IdSchema,
    source_type: z.string().min(1),
    conversations: z.array(ConversationSchema),
  })
  .strict()
  .superRefine((transcript, context) => {
    const messageIds = transcript.conversations.flatMap((conversation) =>
      conversation.messages.map((message) => message.message_id),
    )
    if (new Set(messageIds).size !== messageIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['conversations'],
        message: 'Transcript message IDs must be unique.',
      })
    }
  })

const AgencySchema = z
  .object({
    user_authorship: ConfidenceSchema,
    user_judgment: ConfidenceSchema,
    user_correction: ConfidenceSchema,
    user_reframing: ConfidenceSchema,
    ai_authorship: ConfidenceSchema,
    third_party_authorship: ConfidenceSchema,
  })
  .strict()

export const EpisodeSchema = z
  .object({
    episode_id: IdSchema,
    context: z.string(),
    trigger: z.string(),
    assistant_or_external_proposal: z.string(),
    user_action: z.string(),
    verbatim_user_quote: z.string().nullable(),
    behavior_types: z.array(z.string()),
    protected_standard: z.string(),
    protected_standard_alternatives: z.array(z.string()),
    has_protected_standard_conflict: z.boolean(),
    alternative_explanations: z.array(z.string()),
    agency: AgencySchema,
    signal_strength: ConfidenceSchema,
    source_message_ids: z
      .array(IdSchema)
      .min(1, 'An Episode requires at least one source message ID.'),
  })
  .strict()

const WorkingArchetypeSchema = z
  .object({
    name_cn: z.string(),
    name_en: z.string(),
    definition: z.string(),
    explanatory_confidence: ConfidenceSchema,
    outcome_validation_confidence: ConfidenceSchema,
    evidence_status: EvidenceStatusSchema,
    claim_polarity: ClaimPolaritySchema,
    supporting_evidence_ids: z.array(IdSchema),
  })
  .strict()
  .superRefine((archetype, context) => {
    claimContractMessages({
      ...archetype,
      confidence: Math.max(
        archetype.explanatory_confidence,
        archetype.outcome_validation_confidence,
      ),
    }).forEach((message) => {
      context.addIssue({ code: 'custom', message })
    })
  })

const MechanismSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    description: z.string(),
    supporting_episode_ids: z.array(IdSchema),
    contexts: z.array(z.string()),
    predicted_observations: z.array(StructuredClaimSchema),
    confirmed_predictions: z.array(StructuredClaimSchema),
    missing_predictions: z.array(StructuredClaimSchema),
    counter_evidence: z.array(StructuredClaimSchema),
    evidence_status: EvidenceStatusSchema,
    claim_polarity: ClaimPolaritySchema,
    confidence: ConfidenceSchema,
  })
  .strict()
  .superRefine((mechanism, context) => {
    claimContractMessages({
      ...mechanism,
      supporting_evidence_ids: mechanism.supporting_episode_ids,
    }).forEach((message) => {
      context.addIssue({ code: 'custom', message })
    })
  })

const CapabilitySchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    mechanism_ids: z.array(IdSchema),
    supporting_episode_ids: z.array(IdSchema),
    emergent_logic: z.string(),
    evidence_status: EvidenceStatusSchema,
    claim_polarity: ClaimPolaritySchema,
    confidence: ConfidenceSchema,
  })
  .strict()
  .superRefine((capability, context) => {
    claimContractMessages({
      ...capability,
      supporting_evidence_ids: capability.supporting_episode_ids,
    }).forEach((message) => {
      context.addIssue({ code: 'custom', message })
    })
  })

const ArchetypeCompetitionSchema = z
  .object({
    id: IdSchema,
    name: z.string(),
    type: z.enum([
      'narrow',
      'higher_order',
      'domain',
      'operating_style',
      'null',
    ]),
    explains: z.array(StructuredClaimSchema),
    fails_to_explain: z.array(StructuredClaimSchema),
    unsupported_assumptions: z.array(StructuredClaimSchema),
    cross_context_generalization: ConfidenceSchema,
    discriminative_power: ConfidenceSchema,
  })
  .strict()

const StrongestCounterargumentSchema = z
  .object({
    argument: z.string(),
    what_it_explains: z.string(),
    what_it_fails_to_explain: z.string(),
    why_it_does_or_does_not_win: z.string(),
    evidence_status: EvidenceStatusSchema,
    claim_polarity: ClaimPolaritySchema,
    confidence: ConfidenceSchema,
    supporting_evidence_ids: z.array(IdSchema),
  })
  .strict()
  .superRefine((counterargument, context) => {
    claimContractMessages(counterargument).forEach((message) => {
      context.addIssue({ code: 'custom', message })
    })
  })

const StrengthRiskPairSchema = z
  .object({
    capability_id: IdSchema,
    risk_claim: z.string(),
    evidence_status_ceiling: EvidenceCeilingSchema,
    evidence_status: EvidenceStatusSchema,
    claim_polarity: ClaimPolaritySchema,
    confidence: ConfidenceSchema,
    supporting_evidence_ids: z.array(IdSchema),
  })
  .strict()
  .superRefine((risk, context) => {
    claimContractMessages(risk).forEach((message) => {
      context.addIssue({ code: 'custom', message })
    })
  })

const SeniorityEvidenceSchema = z
  .object({
    status: SeniorityStatusSchema,
    level: z.string().nullable(),
    supporting_evidence_ids: z.array(IdSchema),
  })
  .strict()
  .superRefine((seniority, context) => {
    const supported =
      seniority.status === 'observed' || seniority.status === 'inferred'
    if (supported && seniority.supporting_evidence_ids.length === 0) {
      context.addIssue({
        code: 'custom',
        message: 'Supported seniority evidence requires at least one evidence ID.',
      })
    }
    if (supported && seniority.level === null) {
      context.addIssue({
        code: 'custom',
        message: 'Supported seniority evidence requires a non-null level.',
      })
    }
    if (!supported && seniority.level !== null) {
      context.addIssue({
        code: 'custom',
        message: 'Unknown or missing seniority evidence cannot assert a level.',
      })
    }
  })

const RoleFitSchema = z
  .object({
    id: IdSchema,
    role_family: z.string(),
    natural_fit: ConfidenceSchema,
    readiness: ConfidenceSchema,
    reason: z.string(),
    evidence_status: EvidenceStatusSchema,
    claim_polarity: ClaimPolaritySchema,
    confidence: ConfidenceSchema,
    supporting_evidence_ids: z.array(IdSchema),
    seniority_evidence: SeniorityEvidenceSchema,
  })
  .strict()
  .superRefine((role, context) => {
    claimContractMessages(role).forEach((message) => {
      context.addIssue({ code: 'custom', message })
    })
  })

const EvidenceBoundarySchema = z
  .object({
    claim: z.string(),
    evidence_status: EvidenceStatusSchema,
    claim_polarity: ClaimPolaritySchema,
    confidence: ConfidenceSchema,
    supporting_evidence_ids: z.array(IdSchema),
  })
  .strict()
  .superRefine((boundary, context) => {
    claimContractMessages(boundary).forEach((message) => {
      context.addIssue({ code: 'custom', message })
    })
  })

const HiringManagerSummarySchema = z
  .object({
    claims: z.array(StructuredClaimSchema).min(1),
    seniority_claims: z.array(
      z
        .object({
          claim: z.string(),
          role_fit_id: IdSchema,
          level: z.string().min(1),
          evidence_status: SeniorityStatusSchema,
          claim_polarity: ClaimPolaritySchema,
          confidence: ConfidenceSchema,
          supporting_evidence_ids: z.array(IdSchema),
        })
        .strict()
        .superRefine((claim, context) => {
          claimContractMessages(claim).forEach((message) => {
            context.addIssue({ code: 'custom', message })
          })
        }),
    ),
  })
  .strict()

export const CandidateModelSchema = z
  .object({
    working_archetype: WorkingArchetypeSchema,
    core_loop: z.array(StructuredClaimSchema),
    why_different: StructuredClaimSchema,
    high_signal_episodes: z.array(EpisodeSchema),
    mechanisms: z.array(MechanismSchema),
    capabilities: z.array(CapabilitySchema),
    archetype_competition_winner: IdSchema.nullable(),
    archetype_competition: z.array(ArchetypeCompetitionSchema),
    strongest_counterargument: StrongestCounterargumentSchema,
    strength_risk_pairs: z.array(StrengthRiskPairSchema),
    role_fit: z.array(RoleFitSchema),
    evidence_boundaries: z.array(EvidenceBoundarySchema),
    hiring_manager_summary: HiringManagerSummarySchema,
  })
  .strict()
  .superRefine((model, context) => {
    const winningCandidate =
      model.archetype_competition_winner === null
        ? null
        : model.archetype_competition.find(
            (candidate) =>
              candidate.id === model.archetype_competition_winner,
          )
    const competitionIds = model.archetype_competition.map(
      (candidate) => candidate.id,
    )
    if (new Set(competitionIds).size !== competitionIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['archetype_competition'],
        message: 'Archetype competition IDs must be unique.',
      })
    }
    const roleFitIds = model.role_fit.map((role) => role.id)
    if (new Set(roleFitIds).size !== roleFitIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['role_fit'],
        message: 'Role-fit IDs must be unique.',
      })
    }
    ;(
      [
        [
          'Episode',
          model.high_signal_episodes.map((episode) => episode.episode_id),
          'high_signal_episodes',
        ],
        [
          'Mechanism',
          model.mechanisms.map((mechanism) => mechanism.id),
          'mechanisms',
        ],
        [
          'Capability',
          model.capabilities.map((capability) => capability.id),
          'capabilities',
        ],
      ] as const
    ).forEach(([label, ids, path]) => {
      if (new Set(ids).size !== ids.length) {
        context.addIssue({
          code: 'custom',
          path: [path],
          message: `${label} IDs must be unique.`,
        })
      }
    })
    if (
      model.archetype_competition_winner !== null &&
      winningCandidate === undefined
    ) {
      context.addIssue({
        code: 'custom',
        path: ['archetype_competition_winner'],
        message:
          'The archetype competition winner ID must reference a listed competition ID.',
      })
    }
    const isUnderResolved =
      model.archetype_competition_winner === null ||
      winningCandidate?.type === 'null'
    if (
      isUnderResolved &&
      (model.working_archetype.explanatory_confidence > 0.4 ||
        model.working_archetype.outcome_validation_confidence > 0.4)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['working_archetype'],
        message:
          model.archetype_competition_winner === null
            ? 'An under-resolved model with a null winner must keep both confidence values at or below 0.4.'
            : 'An under-resolved model with a null archetype winner must keep both confidence values at or below 0.4.',
      })
    }
  })

const ProfileJobStatusSchema = z.enum([
  'queued',
  'parsing',
  'extracting',
  'inferring',
  'criticizing',
  'validating',
  'completed',
  'unresolved',
  'failed',
  'cancelled',
])

export const CreateProfileJobRequestSchema = z
  .object({
    candidateId: IdSchema,
    transcript: TranscriptSchema,
    options: z
      .object({
        enableCritic: z.boolean(),
      })
      .strict(),
  })
  .strict()

const SafeJobErrorSchema = z
  .object({
    code: z.string(),
    message: z.string(),
  })
  .strict()

export const ProfileJobSchema = z
  .object({
    jobId: IdSchema,
    status: ProfileJobStatusSchema,
    progress: z.number().min(0).max(1),
    stageMessage: z.string(),
    modelId: IdSchema.nullable(),
    criticVerdict: z.enum(['pass', 'unresolved', 'revise']).nullable(),
    error: SafeJobErrorSchema.nullable(),
  })
  .strict()

export const CriticResultSchema = z
  .object({
    verdict: z.enum(['pass', 'unresolved', 'revise']),
    issues: z.array(
      z
        .object({
          code: z.string().refine((value) => value.trim().length > 0, {
            message: 'Critic issue code cannot be empty.',
          }),
          path: z.string().refine((value) => value.trim().length > 0, {
            message: 'Critic issue path cannot be empty.',
          }),
          message: z.string().refine((value) => value.trim().length > 0, {
            message: 'Critic issue message cannot be empty.',
          }),
          evidence_ids: z
            .array(
              IdSchema.refine((value) => value.trim().length > 0, {
                message: 'Critic evidence ID cannot be empty.',
              }),
            )
            .refine((ids) => new Set(ids).size === ids.length, {
              message: 'Critic evidence IDs must be unique within an issue.',
            }),
        })
        .strict(),
    ),
  })
  .strict()
  .superRefine((critic, context) => {
    if (critic.verdict === 'pass' && critic.issues.length !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['issues'],
        message: 'A passing Critic must not report material issues.',
      })
    }
    if (critic.verdict !== 'pass' && critic.issues.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['issues'],
        message: 'A non-passing Critic must report a material issue.',
      })
    }
    const codes = critic.issues.map(({ code }) => code)
    if (new Set(codes).size !== codes.length) {
      context.addIssue({
        code: 'custom',
        path: ['issues'],
        message: 'Critic issue codes must be unique.',
      })
    }
    const messages = critic.issues.map(({ message }) => message)
    if (new Set(messages).size !== messages.length) {
      context.addIssue({
        code: 'custom',
        path: ['issues'],
        message: 'Critic issue messages must be unique.',
      })
    }
  })

export const ProfileModelResponseSchema = z
  .object({
    candidateModel: CandidateModelSchema,
    uiModel: UiCandidateModelSchema,
    critic: CriticResultSchema.nullable(),
    status: z.enum(['completed', 'unresolved']),
  })
  .strict()

export type Transcript = z.infer<typeof TranscriptSchema>
export type Episode = z.infer<typeof EpisodeSchema>
export type CandidateModel = z.infer<typeof CandidateModelSchema>
export type CriticResult = z.infer<typeof CriticResultSchema>
export type ProfileJob = z.infer<typeof ProfileJobSchema>
export type ProfileModelResponse = z.infer<typeof ProfileModelResponseSchema>
