import { describe, expect, it } from 'vitest'

import {
  CandidateModelSchema,
  TranscriptSchema,
  type CandidateModel,
} from '../../../shared/profile-schemas.js'
import { repairCandidateEvidence } from '../../src/schemas/repair-evidence.js'
import { validateCandidateInvariants } from '../../src/schemas/invariants.js'

const competitionTypes = [
  'narrow',
  'higher_order',
  'domain',
  'operating_style',
  'null',
] as const

function fixture() {
  const transcript = TranscriptSchema.parse({
    candidate_id: 'candidate-1',
    source_type: 'chat-export',
    conversations: [
      {
        conversation_id: 'conversation-1',
        title: 'Review',
        messages: [
          {
            message_id: 'a'.repeat(64),
            role: 'user',
            content: '社区页面理解错了，那是房间中央的生活空间。',
            timestamp: null,
            authorship: 'user',
          },
        ],
      },
    ],
  })
  const model = CandidateModelSchema.parse({
    working_archetype: {
      name_cn: '需求转译型系统架构者',
      name_en: 'Requirement-to-System Architect',
      definition: 'Turns intent into an executable system.',
      explanatory_confidence: 0.8,
      outcome_validation_confidence: 0.3,
      evidence_status: 'inferred',
      claim_polarity: 'positive',
      supporting_evidence_ids: ['E1', 'E9'],
    },
    core_loop: [
      {
        claim: '模糊目标 → 结构模型',
        evidence_status: 'observed',
        claim_polarity: 'positive',
        confidence: 0.9,
        supporting_evidence_ids: ['E1'],
      },
    ],
    why_different: {
      claim: 'Protects the runtime object model.',
      evidence_status: 'observed',
      claim_polarity: 'positive',
      confidence: 0.8,
      supporting_evidence_ids: ['missing-id'],
    },
    high_signal_episodes: [
      {
        episode_id: 'E1',
        context: 'AI 自定义房间',
        trigger: '助手把社区理解成普通社区页',
        assistant_or_external_proposal: '做一个社区页面',
        user_action: '指出社区对象理解错了',
        verbatim_user_quote: '社区页面理解错了，那是房间中央的生活空间。',
        behavior_types: ['correction', 'reframing'],
        protected_standard: 'runtime object fidelity',
        protected_standard_alternatives: [],
        has_protected_standard_conflict: false,
        alternative_explanations: [],
        agency: {
          user_authorship: 0.9,
          user_judgment: 0.9,
          user_correction: 0.9,
          user_reframing: 0.8,
          ai_authorship: 0.1,
          third_party_authorship: 0,
        },
        signal_strength: 0.9,
        source_message_ids: ['msg-invented', 'E1'],
      },
    ],
    mechanisms: [
      {
        id: 'M1',
        name: 'Operational Model Construction',
        description: 'Builds a runtime model first.',
        supporting_episode_ids: ['E1', 'E9'],
        contexts: ['房间'],
        predicted_observations: [],
        confirmed_predictions: [],
        missing_predictions: [],
        counter_evidence: [],
        evidence_status: 'observed',
        claim_polarity: 'positive',
        confidence: 0.8,
      },
    ],
    capabilities: [
      {
        id: 'C1',
        name: 'System Specification',
        mechanism_ids: ['M1', 'missing-mechanism'],
        supporting_episode_ids: ['E1', 'E9'],
        emergent_logic: 'Combines object correction with interface ownership.',
        evidence_status: 'observed',
        claim_polarity: 'positive',
        confidence: 0.8,
      },
    ],
    archetype_competition_winner: 'competition-higher_order',
    archetype_competition: competitionTypes.map((type) => ({
      id: `competition-${type}`,
      name: `${type} candidate`,
      type,
      explains: [
        {
          claim: 'Explains object correction.',
          evidence_status: 'inferred',
          claim_polarity: 'positive',
          confidence: 0.7,
          supporting_evidence_ids: ['E1', 'bogus'],
        },
      ],
      fails_to_explain: [],
      unsupported_assumptions: [],
      cross_context_generalization: 0.7,
      discriminative_power: 0.7,
    })),
    strongest_counterargument: {
      argument: 'Maybe this is only AI prompting skill.',
      what_it_explains: 'Dense architecture text.',
      what_it_fails_to_explain: 'User object correction.',
      why_it_does_or_does_not_win: 'Does not cover the user judgment.',
      evidence_status: 'inferred',
      claim_polarity: 'neutral',
      confidence: 0.5,
      supporting_evidence_ids: ['E1'],
    },
    strength_risk_pairs: [
      {
        capability_id: 'C1',
        risk_claim: 'Premature concretization.',
        evidence_status_ceiling: 'inferred',
        evidence_status: 'inferred',
        claim_polarity: 'risk',
        confidence: 0.5,
        supporting_evidence_ids: ['E1'],
      },
    ],
    role_fit: [
      {
        id: 'role-1',
        role_family: 'Technical Product Manager',
        natural_fit: 0.8,
        readiness: 0.5,
        reason: 'Matches specification translation.',
        evidence_status: 'inferred',
        claim_polarity: 'positive',
        confidence: 0.7,
        supporting_evidence_ids: ['E1'],
        seniority_evidence: {
          status: 'unknown',
          level: null,
          supporting_evidence_ids: [],
        },
      },
    ],
    evidence_boundaries: [
      {
        claim: 'Cannot prove independent deep architecture authorship.',
        evidence_status: 'unknown',
        claim_polarity: 'neutral',
        confidence: 0.2,
        supporting_evidence_ids: [],
      },
    ],
    hiring_manager_summary: {
      claims: [
        {
          claim: 'Turns ambiguous intent into an executable system.',
          evidence_status: 'inferred',
          claim_polarity: 'positive',
          confidence: 0.8,
          supporting_evidence_ids: ['E1'],
        },
      ],
      seniority_claims: [],
    },
  })
  return { model, transcript }
}

describe('repairCandidateEvidence', () => {
  it('rebinds invented message IDs via exact user quotes and drops unmapped references', () => {
    const { model, transcript } = fixture()
    const realMessageId = transcript.conversations[0]!.messages[0]!.message_id

    const repaired = repairCandidateEvidence(model, transcript)

    expect(repaired.model.high_signal_episodes[0]!.source_message_ids).toEqual([
      realMessageId,
    ])
    expect(repaired.model.working_archetype.supporting_evidence_ids).toEqual([
      'E1',
    ])
    expect(repaired.model.mechanisms[0]!.supporting_episode_ids).toEqual(['E1'])
    expect(repaired.model.capabilities[0]!.mechanism_ids).toEqual(['M1'])
    expect(repaired.model.capabilities[0]!.supporting_episode_ids).toEqual([
      'E1',
    ])
    expect(repaired.model.why_different.evidence_status).toBe('unknown')
    expect(repaired.model.why_different.claim_polarity).toBe('neutral')
    expect(repaired.model.why_different.confidence).toBeLessThanOrEqual(0.4)
    expect(repaired.reboundEpisodes).toBe(1)
    expect(validateCandidateInvariants(repaired.model, transcript)).toEqual([])
  })

  it('maps E2-style aliases onto episode order when episode IDs are not E1', () => {
    const { model, transcript } = fixture()
    model.high_signal_episodes[0]!.episode_id = 'ep_room'
    model.working_archetype.supporting_evidence_ids = ['E1']
    model.core_loop[0]!.supporting_evidence_ids = ['EP1']
    model.mechanisms[0]!.supporting_episode_ids = ['E1']
    model.capabilities[0]!.supporting_episode_ids = ['episode-1']

    const repaired = repairCandidateEvidence(model, transcript)

    expect(repaired.model.working_archetype.supporting_evidence_ids).toEqual([
      'ep_room',
    ])
    expect(repaired.model.core_loop[0]!.supporting_evidence_ids).toEqual([
      'ep_room',
    ])
    expect(repaired.model.mechanisms[0]!.supporting_episode_ids).toEqual([
      'ep_room',
    ])
    expect(repaired.model.capabilities[0]!.supporting_episode_ids).toEqual([
      'ep_room',
    ])
  })

  it('nulls a quote that cannot be found and drops episodes with no recoverable source', () => {
    const { model, transcript } = fixture()
    model.high_signal_episodes[0]!.source_message_ids = ['invented']
    model.high_signal_episodes[0]!.verbatim_user_quote = '这段话并不存在'

    const repaired = repairCandidateEvidence(model, transcript)

    expect(repaired.model.high_signal_episodes).toEqual([])
    expect(repaired.model.mechanisms[0]!.supporting_episode_ids).toEqual([])
    expect(repaired.model.mechanisms[0]!.evidence_status).toBe('unknown')
    expect(repaired.droppedEpisodes).toBe(1)
  })
})
