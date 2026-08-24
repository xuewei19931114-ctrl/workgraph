import { describe, expect, it } from 'vitest'

import {
  CandidateModelSchema,
  CreateProfileJobRequestSchema,
  EpisodeSchema,
  ProfileJobSchema,
  ProfileModelResponseSchema,
  TranscriptSchema,
} from '../../../shared/profile-schemas.js'

const validTranscript = {
  candidate_id: 'candidate-1',
  source_type: 'chat-export',
  conversations: [
    {
      conversation_id: 'conversation-1',
      title: 'Architecture review',
      messages: [
        {
          message_id: 'message-1',
          role: 'user',
          content: 'That boundary is wrong; ownership belongs in the domain layer.',
          timestamp: '2026-08-21T06:00:00.000Z',
          authorship: 'user',
        },
      ],
    },
  ],
}

const validEpisode = {
  episode_id: 'episode-1',
  context: 'Architecture review',
  trigger: 'An assistant proposed the wrong ownership boundary.',
  assistant_or_external_proposal: 'Put ownership in the transport layer.',
  user_action: 'Rejected the proposal and moved ownership to the domain layer.',
  verbatim_user_quote:
    'That boundary is wrong; ownership belongs in the domain layer.',
  behavior_types: ['correction', 'boundary'],
  protected_standard: 'Domain ownership remains explicit.',
  protected_standard_alternatives: [],
  has_protected_standard_conflict: false,
  alternative_explanations: [],
  agency: {
    user_authorship: 0.8,
    user_judgment: 0.9,
    user_correction: 0.9,
    user_reframing: 0.4,
    ai_authorship: 0.2,
    third_party_authorship: 0,
  },
  signal_strength: 0.9,
  source_message_ids: ['message-1'],
}

const competitionTypes = [
  'narrow',
  'higher_order',
  'domain',
  'operating_style',
  'null',
] as const

describe('Episode schema', () => {
  it('requires explicit quote provenance and structured protected-standard conflicts', () => {
    expect(EpisodeSchema.parse(validEpisode)).toMatchObject({
      verbatim_user_quote:
        'That boundary is wrong; ownership belongs in the domain layer.',
      protected_standard_alternatives: [],
      has_protected_standard_conflict: false,
    })
    expect(
      EpisodeSchema.parse({ ...validEpisode, verbatim_user_quote: null })
        .verbatim_user_quote,
    ).toBeNull()
    const missingQuote: Partial<typeof validEpisode> = { ...validEpisode }
    delete missingQuote.verbatim_user_quote
    expect(EpisodeSchema.safeParse(missingQuote).success).toBe(false)
  })
})

const validUnderResolvedModel = {
  working_archetype: {
    name_cn: '尚未解析',
    name_en: 'Under-resolved',
    definition: 'Current evidence does not discriminate between candidates.',
    explanatory_confidence: 0.2,
    outcome_validation_confidence: 0,
    evidence_status: 'unknown',
    claim_polarity: 'neutral',
    supporting_evidence_ids: [],
  },
  core_loop: [],
  why_different: {
    claim: 'No winner is justified yet.',
    evidence_status: 'unknown',
    claim_polarity: 'neutral',
    confidence: 0.2,
    supporting_evidence_ids: [],
  },
  high_signal_episodes: [validEpisode],
  mechanisms: [
    {
      id: 'mechanism-1',
      name: 'Boundary correction',
      description: 'Detects and corrects misplaced ownership.',
      supporting_episode_ids: ['episode-1'],
      contexts: ['architecture'],
      predicted_observations: [
        {
          claim: 'Corrects similar boundaries elsewhere.',
          evidence_status: 'inferred',
          claim_polarity: 'neutral',
          confidence: 0.3,
          supporting_evidence_ids: ['episode-1'],
        },
      ],
      confirmed_predictions: [],
      missing_predictions: [
        {
          claim: 'No cross-context example yet.',
          evidence_status: 'missing',
          claim_polarity: 'neutral',
          confidence: 0.2,
          supporting_evidence_ids: [],
        },
      ],
      counter_evidence: [],
      evidence_status: 'observed',
      claim_polarity: 'neutral',
      confidence: 0.4,
    },
  ],
  capabilities: [
    {
      id: 'capability-1',
      name: 'Architectural judgment',
      mechanism_ids: ['mechanism-1'],
      supporting_episode_ids: ['episode-1'],
      emergent_logic: 'Boundary correction can protect domain ownership.',
      evidence_status: 'observed',
      claim_polarity: 'positive',
      confidence: 0.4,
    },
  ],
  archetype_competition_winner: null,
  archetype_competition: competitionTypes.map((type) => ({
    id: `competition-${type}`,
    name: type === 'null' ? 'Under-resolved' : `${type} candidate`,
    type,
    explains: [],
    fails_to_explain: [],
    unsupported_assumptions: [],
    cross_context_generalization: 0.1,
    discriminative_power: 0.1,
  })),
  strongest_counterargument: {
    argument: 'This may be one isolated correction.',
    what_it_explains: 'The observed episode.',
    what_it_fails_to_explain: 'Whether the behavior generalizes.',
    why_it_does_or_does_not_win: 'It wins until more evidence appears.',
    evidence_status: 'observed',
    claim_polarity: 'neutral',
    confidence: 0.4,
    supporting_evidence_ids: ['episode-1'],
  },
  strength_risk_pairs: [
    {
      capability_id: 'capability-1',
      risk_claim: 'Cross-context transfer is unvalidated.',
      evidence_status_ceiling: 'observed',
      evidence_status: 'inferred',
      claim_polarity: 'neutral',
      confidence: 0.3,
      supporting_evidence_ids: ['episode-1'],
    },
  ],
  role_fit: [
    {
      id: 'role-1',
      role_family: 'Individual contributor',
      natural_fit: 0.4,
      readiness: 0.2,
      reason: 'Some natural fit, insufficient outcome evidence.',
      evidence_status: 'inferred',
      claim_polarity: 'positive',
      confidence: 0.2,
      supporting_evidence_ids: ['episode-1'],
      seniority_evidence: {
        status: 'unknown',
        level: null,
        supporting_evidence_ids: [],
      },
    },
  ],
  evidence_boundaries: [
    {
      claim: 'Cross-context transfer',
      evidence_status: 'missing',
      claim_polarity: 'neutral',
      confidence: 0.2,
      supporting_evidence_ids: [],
    },
  ],
  hiring_manager_summary: {
    claims: [
      {
        claim: 'The profile remains under-resolved.',
        evidence_status: 'unknown',
        claim_polarity: 'neutral',
        confidence: 0.2,
        supporting_evidence_ids: [],
      },
    ],
    seniority_claims: [],
  },
}

describe('canonical profile schemas', () => {
  it('accepts a valid transcript', () => {
    expect(TranscriptSchema.parse(validTranscript)).toEqual(validTranscript)
  })

  it('accepts a null transcript timestamp', () => {
    const transcriptWithNullTimestamp = structuredClone(validTranscript)
    transcriptWithNullTimestamp.conversations[0]!.messages[0]!.timestamp = null as never

    expect(TranscriptSchema.parse(transcriptWithNullTimestamp)).toEqual(
      transcriptWithNullTimestamp,
    )
  })

  it('rejects a transcript message without an ID', () => {
    const messageWithoutId = structuredClone(validTranscript)
    delete (messageWithoutId.conversations[0]?.messages[0] as Partial<{
      message_id: string
    }>).message_id

    expect(() => TranscriptSchema.parse(messageWithoutId)).toThrow()
  })

  it('rejects duplicate transcript message IDs', () => {
    const duplicateMessageIds = structuredClone(validTranscript)
    duplicateMessageIds.conversations[0]!.messages.push(
      structuredClone(duplicateMessageIds.conversations[0]!.messages[0]!),
    )

    expect(() => TranscriptSchema.parse(duplicateMessageIds)).toThrow(/unique/i)
  })

  it('accepts a conservative under-resolved candidate model', () => {
    expect(CandidateModelSchema.parse(validUnderResolvedModel)).toEqual(
      validUnderResolvedModel,
    )
  })

  it('requires every Episode to reference at least one source message', () => {
    const model = structuredClone(validUnderResolvedModel)
    model.high_signal_episodes[0]!.source_message_ids = []

    expect(() => CandidateModelSchema.parse(model)).toThrow(/source|array/i)
  })

  it('rejects high confidence when archetype competition has no winner', () => {
    expect(() =>
      CandidateModelSchema.parse({
        ...validUnderResolvedModel,
        working_archetype: {
          ...validUnderResolvedModel.working_archetype,
          explanatory_confidence: 0.7,
        },
      }),
    ).toThrow(/under-resolved/i)
  })

  it('applies conservative confidence when the null archetype wins', () => {
    expect(() =>
      CandidateModelSchema.parse({
        ...validUnderResolvedModel,
        archetype_competition_winner: 'competition-null',
        working_archetype: {
          ...validUnderResolvedModel.working_archetype,
          explanatory_confidence: 0.7,
        },
      }),
    ).toThrow(/under-resolved/i)
  })

  it('describes the null-type winner accurately in validation errors', () => {
    const result = CandidateModelSchema.safeParse({
      ...validUnderResolvedModel,
      archetype_competition_winner: 'competition-null',
      working_archetype: {
        ...validUnderResolvedModel.working_archetype,
        explanatory_confidence: 0.7,
      },
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map(({ message }) => message).join(' ')
      expect(messages).toMatch(/null archetype winner/i)
      expect(messages).not.toMatch(/no archetype winner/i)
    }
  })

  it('rejects an archetype winner absent from the competition', () => {
    expect(() =>
      CandidateModelSchema.parse({
        ...validUnderResolvedModel,
        archetype_competition_winner: 'nonexistent candidate',
      }),
    ).toThrow(/winner/i)
  })

  it('describes winner referential integrity in terms of IDs', () => {
    const result = CandidateModelSchema.safeParse({
      ...validUnderResolvedModel,
      archetype_competition_winner: 'missing-id',
    })

    expect(result.success).toBe(false)
    if (!result.success) {
      const messages = result.error.issues.map(({ message }) => message).join(' ')
      expect(messages).toMatch(/winner ID must reference/i)
      expect(messages).not.toMatch(/name a listed candidate/i)
    }
  })

  it('rejects duplicate archetype competition IDs', () => {
    const duplicateIds = structuredClone(validUnderResolvedModel)
    duplicateIds.archetype_competition[1]!.id =
      duplicateIds.archetype_competition[0]!.id

    expect(() => CandidateModelSchema.parse(duplicateIds)).toThrow(/unique/i)
  })

  it('rejects duplicate role-fit IDs used by summary claims', () => {
    const duplicateRoleIds = structuredClone(validUnderResolvedModel)
    duplicateRoleIds.role_fit.push(structuredClone(duplicateRoleIds.role_fit[0]!))

    expect(() => CandidateModelSchema.parse(duplicateRoleIds)).toThrow(/unique/i)
  })

  it.each(['Episode', 'mechanism', 'capability'] as const)(
    'rejects duplicate %s IDs',
    (kind) => {
      const model = structuredClone(validUnderResolvedModel)
      if (kind === 'Episode') {
        model.high_signal_episodes.push(
          structuredClone(model.high_signal_episodes[0]!),
        )
      } else if (kind === 'mechanism') {
        model.mechanisms.push(structuredClone(model.mechanisms[0]!))
      } else {
        model.capabilities.push(structuredClone(model.capabilities[0]!))
      }

      expect(() => CandidateModelSchema.parse(model)).toThrow(/unique/i)
    },
  )

  it('requires structured core-loop claims', () => {
    expect(() =>
      CandidateModelSchema.parse({
        ...validUnderResolvedModel,
        core_loop: ['unstructured claim'],
      }),
    ).toThrow()
  })

  it('requires structured mechanism prediction claims', () => {
    const model = structuredClone(validUnderResolvedModel)
    model.mechanisms[0]!.missing_predictions = ['unstructured claim'] as never

    expect(() => CandidateModelSchema.parse(model)).toThrow()
  })

  it('requires evidence for a supported important claim', () => {
    expect(() =>
      CandidateModelSchema.parse({
        ...validUnderResolvedModel,
        why_different: {
          claim: 'A supported differentiator.',
          evidence_status: 'observed',
          claim_polarity: 'positive',
          confidence: 0.8,
          supporting_evidence_ids: [],
        },
      }),
    ).toThrow(/evidence/i)
  })

  it('requires unknown or missing claims to be neutral and conservative', () => {
    expect(() =>
      CandidateModelSchema.parse({
        ...validUnderResolvedModel,
        why_different: {
          claim: 'The candidate is weak.',
          evidence_status: 'missing',
          claim_polarity: 'negative',
          confidence: 0.8,
          supporting_evidence_ids: [],
        },
      }),
    ).toThrow(/neutral|confidence/i)
  })

  it('requires free-text summaries to have structured claims', () => {
    expect(() =>
      CandidateModelSchema.parse({
        ...validUnderResolvedModel,
        hiring_manager_summary: {
          claims: [],
          seniority_claims: [],
        },
      }),
    ).toThrow(/claim/i)
  })

  it('rejects unbound free text in the canonical hiring summary', () => {
    expect(() =>
      CandidateModelSchema.parse({
        ...validUnderResolvedModel,
        hiring_manager_summary: {
          ...validUnderResolvedModel.hiring_manager_summary,
          summary: 'Unbound prose must be rendered later.',
        },
      }),
    ).toThrow()
  })

  it.each([
    'working archetype',
    'mechanism',
    'capability',
    'competition claim',
    'counterargument',
    'risk claim',
    'role fit',
    'evidence boundary',
    'summary claim',
  ])('requires non-empty evidence for a supported %s', (kind) => {
    const model = structuredClone(validUnderResolvedModel)
    if (kind === 'working archetype') {
      model.working_archetype.evidence_status = 'observed'
      model.working_archetype.supporting_evidence_ids = []
    } else if (kind === 'mechanism') {
      model.mechanisms[0]!.supporting_episode_ids = []
    } else if (kind === 'capability') {
      model.capabilities[0]!.supporting_episode_ids = []
    } else if (kind === 'competition claim') {
      model.archetype_competition[0]!.explains = [
        {
          claim: 'Supported explanation.',
          evidence_status: 'observed',
          claim_polarity: 'positive',
          confidence: 0.8,
          supporting_evidence_ids: [],
        },
      ]
    } else if (kind === 'counterargument') {
      model.strongest_counterargument.supporting_evidence_ids = []
    } else if (kind === 'risk claim') {
      model.strength_risk_pairs[0]!.supporting_evidence_ids = []
    } else if (kind === 'role fit') {
      model.role_fit[0]!.supporting_evidence_ids = []
    } else if (kind === 'evidence boundary') {
      model.evidence_boundaries[0]!.evidence_status = 'observed'
    } else {
      model.hiring_manager_summary.claims[0] = {
        claim: 'Supported summary.',
        evidence_status: 'observed',
        claim_polarity: 'positive',
        confidence: 0.8,
        supporting_evidence_ids: [],
      }
    }

    expect(() => CandidateModelSchema.parse(model)).toThrow(/evidence/i)
  })

  it('requires an unknown working archetype claim to be neutral and conservative', () => {
    expect(() =>
      CandidateModelSchema.parse({
        ...validUnderResolvedModel,
        archetype_competition_winner: 'competition-higher_order',
        working_archetype: {
          ...validUnderResolvedModel.working_archetype,
          claim_polarity: 'positive',
          explanatory_confidence: 0.8,
        },
      }),
    ).toThrow(/neutral|confidence/i)
  })

  it('rejects role fit without independent seniority evidence', () => {
    const roleWithoutSeniorityEvidence = structuredClone(validUnderResolvedModel)
    delete (
      roleWithoutSeniorityEvidence.role_fit[0] as Partial<
        (typeof validUnderResolvedModel.role_fit)[number]
      >
    ).seniority_evidence

    expect(() =>
      CandidateModelSchema.parse(roleWithoutSeniorityEvidence),
    ).toThrow()
  })

  it('requires supported seniority evidence to have evidence IDs', () => {
    const model = structuredClone(validUnderResolvedModel)
    model.role_fit[0]!.seniority_evidence = {
      status: 'inferred',
      level: 'senior',
      supporting_evidence_ids: [],
    }

    expect(() => CandidateModelSchema.parse(model)).toThrow(/evidence/i)
  })

  it('requires supported seniority evidence to have a non-null level', () => {
    const model = structuredClone(validUnderResolvedModel)
    model.role_fit[0]!.seniority_evidence = {
      status: 'observed',
      level: null,
      supporting_evidence_ids: ['episode-1'],
    }

    expect(() => CandidateModelSchema.parse(model)).toThrow(/level/i)
  })

  it('requires unknown seniority evidence to avoid asserting a level', () => {
    const model = structuredClone(validUnderResolvedModel)
    model.role_fit[0]!.seniority_evidence = {
      status: 'unknown',
      level: 'senior',
      supporting_evidence_ids: [],
    }

    expect(() => CandidateModelSchema.parse(model)).toThrow(/unknown/i)
  })

  it('does not allow missing as a risk evidence ceiling', () => {
    const model = structuredClone(validUnderResolvedModel)
    model.strength_risk_pairs[0]!.evidence_status_ceiling = 'missing' as never

    expect(() => CandidateModelSchema.parse(model)).toThrow()
  })

  it('does not allow missing as a seniority evidence status', () => {
    const model = structuredClone(validUnderResolvedModel)
    model.role_fit[0]!.seniority_evidence.status = 'missing'

    expect(() => CandidateModelSchema.parse(model)).toThrow()
  })

  it('rejects unknown fields and confidence outside [0, 1]', () => {
    expect(() =>
      TranscriptSchema.parse({ ...validTranscript, unexpected: true }),
    ).toThrow()
    expect(() =>
      CandidateModelSchema.parse({
        ...validUnderResolvedModel,
        working_archetype: {
          ...validUnderResolvedModel.working_archetype,
          explanatory_confidence: 1.01,
        },
      }),
    ).toThrow()
  })

  it('defines strict request, job and model response contracts', () => {
    const request = {
      candidateId: 'candidate-1',
      transcript: validTranscript,
      options: { enableCritic: false },
    }
    const job = {
      jobId: 'job-1',
      status: 'queued',
      progress: 0,
      stageMessage: 'Queued',
      modelId: null,
      criticVerdict: null,
      error: null,
    }
    const uiModel = {
      generatedAt: 1787292000000,
      headline: 'Under-resolved',
      thesis: 'More evidence is needed.',
      dimensionCount: 0,
      sourceLabel: 'Chat export',
      unknownCount: 1,
      dimensions: [],
      cannotProve: ['Cross-context transfer'],
      capabilities: [],
      strengths: [],
      risks: [],
      riskNote: 'Missing evidence is not weakness.',
      roles: [],
      nextQuestions: [],
    }

    expect(CreateProfileJobRequestSchema.parse(request)).toEqual(request)
    expect(ProfileJobSchema.parse(job)).toEqual(job)
    expect(
      ProfileModelResponseSchema.parse({
        candidateModel: validUnderResolvedModel,
        uiModel,
        critic: null,
        status: 'completed',
      }),
    ).toBeTruthy()
    expect(() =>
      CreateProfileJobRequestSchema.parse({ ...request, extra: true }),
    ).toThrow()
  })
})
