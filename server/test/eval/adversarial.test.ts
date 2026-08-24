import { describe, expect, it } from 'vitest'

import {
  CandidateModelSchema,
  TranscriptSchema,
  type CandidateModel,
} from '../../../shared/profile-schemas.js'
import { validateCandidateInvariants } from '../../src/schemas/invariants.js'

const competitionTypes = [
  'narrow',
  'higher_order',
  'domain',
  'operating_style',
  'null',
] as const

function makeFixture() {
  const transcript = TranscriptSchema.parse({
    candidate_id: 'candidate-1',
    source_type: 'chat-export',
    conversations: [
      {
        conversation_id: 'conversation-1',
        title: 'Review',
        messages: [
          {
            message_id: 'message-1',
            role: 'user',
            content: 'Move ownership into the domain layer.',
            timestamp: '2026-08-21T06:00:00.000Z',
            authorship: 'user',
          },
        ],
      },
    ],
  })
  const model = CandidateModelSchema.parse({
    working_archetype: {
      name_cn: '系统边界校正者',
      name_en: 'System Boundary Corrector',
      definition: 'Corrects ownership boundaries.',
      explanatory_confidence: 0.7,
      outcome_validation_confidence: 0.4,
      evidence_status: 'observed',
      claim_polarity: 'positive',
      supporting_evidence_ids: ['episode-1'],
    },
    core_loop: [
      {
        claim: 'Detect and correct ownership boundaries.',
        evidence_status: 'observed',
        claim_polarity: 'positive',
        confidence: 0.8,
        supporting_evidence_ids: ['episode-1'],
      },
    ],
    why_different: {
      claim: 'Protects explicit ownership.',
      evidence_status: 'observed',
      claim_polarity: 'positive',
      confidence: 0.8,
      supporting_evidence_ids: ['episode-1'],
    },
    high_signal_episodes: [
      {
        episode_id: 'episode-1',
        context: 'Architecture review',
        trigger: 'A misplaced ownership proposal.',
        assistant_or_external_proposal: 'Put ownership in transport.',
        user_action: 'Moved ownership to the domain.',
        verbatim_user_quote: 'Move ownership into the domain layer.',
        behavior_types: ['correction', 'judgment'],
        protected_standard: 'Explicit domain ownership.',
        protected_standard_alternatives: [],
        has_protected_standard_conflict: false,
        alternative_explanations: [],
        agency: {
          user_authorship: 0.8,
          user_judgment: 0.9,
          user_correction: 0.9,
          user_reframing: 0.2,
          ai_authorship: 0.1,
          third_party_authorship: 0,
        },
        signal_strength: 0.9,
        source_message_ids: ['message-1'],
      },
    ],
    mechanisms: [
      {
        id: 'mechanism-1',
        name: 'Boundary correction',
        description: 'Detects and corrects misplaced ownership.',
        supporting_episode_ids: ['episode-1'],
        contexts: ['architecture'],
        predicted_observations: [],
        confirmed_predictions: [],
        missing_predictions: [],
        counter_evidence: [],
        evidence_status: 'observed',
        claim_polarity: 'neutral',
        confidence: 0.8,
      },
    ],
    capabilities: [
      {
        id: 'capability-1',
        name: 'Architectural judgment',
        mechanism_ids: ['mechanism-1'],
        supporting_episode_ids: ['episode-1'],
        emergent_logic: 'Repeated boundary correction supports judgment.',
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
          claim: `${type} explanation`,
          evidence_status: 'observed',
          claim_polarity: 'neutral',
          confidence: 0.6,
          supporting_evidence_ids: ['episode-1'],
        },
      ],
      fails_to_explain: [],
      unsupported_assumptions: [],
      cross_context_generalization: 0.5,
      discriminative_power: 0.5,
    })),
    strongest_counterargument: {
      argument: 'This could be domain familiarity.',
      what_it_explains: 'The correction.',
      what_it_fails_to_explain: 'Transfer.',
      why_it_does_or_does_not_win: 'It does not explain the judgment trace.',
      evidence_status: 'inferred',
      claim_polarity: 'neutral',
      confidence: 0.6,
      supporting_evidence_ids: ['episode-1'],
    },
    strength_risk_pairs: [
      {
        capability_id: 'capability-1',
        risk_claim: 'Transfer remains unvalidated.',
        evidence_status_ceiling: 'observed',
        evidence_status: 'inferred',
        claim_polarity: 'neutral',
        confidence: 0.4,
        supporting_evidence_ids: ['episode-1'],
      },
    ],
    role_fit: [
      {
        id: 'role-1',
        role_family: 'Product engineer',
        natural_fit: 0.8,
        readiness: 0.6,
        reason: 'Mechanism fit is stronger than outcome evidence.',
        evidence_status: 'inferred',
        claim_polarity: 'positive',
        confidence: 0.6,
        supporting_evidence_ids: ['episode-1'],
        seniority_evidence: {
          status: 'inferred',
          level: 'mid-level',
          supporting_evidence_ids: ['episode-1'],
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
          claim: 'Transfer requires validation.',
          evidence_status: 'inferred',
          claim_polarity: 'neutral',
          confidence: 0.4,
          supporting_evidence_ids: ['episode-1'],
        },
      ],
      seniority_claims: [],
    },
  })

  return { model, transcript }
}

function codesOf(model: CandidateModel, transcript: ReturnType<typeof makeFixture>['transcript']) {
  return validateCandidateInvariants(model, transcript).map(({ code }) => code)
}

describe('adversarial eval gates', () => {
  it('A1 rejects expert inference from an AI framework the user only accepted', () => {
    const { model, transcript } = makeFixture()
    transcript.conversations[0]!.messages = [
      {
        message_id: 'message-ai',
        role: 'assistant',
        content: 'Here is a complete multi-layer architecture framework.',
        timestamp: '2026-08-21T06:00:00.000Z',
        authorship: 'assistant',
      },
      {
        message_id: 'message-1',
        role: 'user',
        content: 'Yes, that works.',
        timestamp: '2026-08-21T06:00:01.000Z',
        authorship: 'user',
      },
    ]
    model.high_signal_episodes[0]!.source_message_ids = ['message-ai', 'message-1']
    model.high_signal_episodes[0]!.verbatim_user_quote = 'Yes, that works.'
    model.high_signal_episodes[0]!.behavior_types = []
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0.1,
      user_judgment: 0.1,
      user_correction: 0,
      user_reframing: 0,
      ai_authorship: 0.9,
      third_party_authorship: 0,
    }

    expect(codesOf(model, transcript)).toContain('AI_ATTRIBUTION_LEAK')
  })

  it('A1 allows an under-resolved model that does not claim expertise from AI authorship', () => {
    const { model, transcript } = makeFixture()
    model.capabilities = []
    model.mechanisms = []
    model.strength_risk_pairs = []
    model.working_archetype = {
      ...model.working_archetype,
      name_en: 'Under-resolved',
      name_cn: '待验证',
      explanatory_confidence: 0.2,
      outcome_validation_confidence: 0.2,
      evidence_status: 'unknown',
      claim_polarity: 'neutral',
      supporting_evidence_ids: [],
    }

    expect(codesOf(model, transcript)).not.toContain('AI_ATTRIBUTION_LEAK')
  })

  it('A6 treats missing people-management evidence as unknown, not a poor manager', () => {
    const { model, transcript } = makeFixture()
    model.mechanisms[0]!.name = 'People management'
    model.mechanisms[0]!.evidence_status = 'missing'
    model.mechanisms[0]!.claim_polarity = 'negative'
    model.mechanisms[0]!.confidence = 0.2
    model.mechanisms[0]!.supporting_episode_ids = []

    expect(codesOf(model, transcript)).toContain('MISSING_AS_WEAKNESS')
  })

  it('A6 accepts a conservative unknown people-management boundary', () => {
    const { model, transcript } = makeFixture()
    model.evidence_boundaries.push({
      claim: 'People management',
      evidence_status: 'unknown',
      claim_polarity: 'neutral',
      confidence: 0.2,
      supporting_evidence_ids: [],
    })

    expect(validateCandidateInvariants(model, transcript)).toEqual([])
  })

  it('A7 keeps natural fit and readiness as independent fields', () => {
    const { model, transcript } = makeFixture()
    model.role_fit[0]!.natural_fit = 0.85
    model.role_fit[0]!.readiness = 0.2
    model.role_fit[0]!.reason =
      'Mechanism fit is strong; proven readiness remains limited.'

    expect(model.role_fit[0]!.natural_fit).toBeGreaterThan(
      model.role_fit[0]!.readiness,
    )
    expect(validateCandidateInvariants(model, transcript)).toEqual([])
  })

  it('A7 rejects high readiness when role evidence is still unknown', () => {
    const { model, transcript } = makeFixture()
    model.role_fit[0]!.evidence_status = 'unknown'
    model.role_fit[0]!.claim_polarity = 'neutral'
    model.role_fit[0]!.confidence = 0.2
    model.role_fit[0]!.supporting_evidence_ids = []
    model.role_fit[0]!.natural_fit = 0.85
    model.role_fit[0]!.readiness = 0.85
    model.role_fit[0]!.seniority_evidence = {
      status: 'unknown',
      level: null,
      supporting_evidence_ids: [],
    }

    expect(codesOf(model, transcript)).toContain('ROLE_INFLATION')
  })

  it('A7 rejects high natural_fit when role evidence is still unknown', () => {
    const { model, transcript } = makeFixture()
    model.role_fit[0]!.evidence_status = 'unknown'
    model.role_fit[0]!.claim_polarity = 'neutral'
    model.role_fit[0]!.confidence = 0.2
    model.role_fit[0]!.supporting_evidence_ids = []
    model.role_fit[0]!.natural_fit = 0.85
    model.role_fit[0]!.readiness = 0.2
    model.role_fit[0]!.seniority_evidence = {
      status: 'unknown',
      level: null,
      supporting_evidence_ids: [],
    }

    expect(
      validateCandidateInvariants(model, transcript).some(
        (issue) =>
          issue.code === 'ROLE_INFLATION' &&
          issue.path === 'role_fit[0].natural_fit',
      ),
    ).toBe(true)
  })

  it('A8 rejects a generic systems-thinker attractor as the working archetype', () => {
    const { model, transcript } = makeFixture()
    model.working_archetype.name_en = 'Systems Thinker'
    model.working_archetype.name_cn = '系统思考者'

    expect(codesOf(model, transcript)).toContain('GENERIC_ATTRACTOR')
  })

  it('A8 accepts a precise mechanism instead of a generic attractor', () => {
    const { model, transcript } = makeFixture()

    expect(codesOf(model, transcript)).not.toContain('GENERIC_ATTRACTOR')
    expect(model.mechanisms[0]!.name).toMatch(/boundary/i)
  })

  it('A9 keeps a pasted boss or investor framework as third-party context', () => {
    const { model, transcript } = makeFixture()
    transcript.conversations[0]!.messages[0]!.authorship = 'third_party'
    transcript.conversations[0]!.messages[0]!.role = 'user'
    transcript.conversations[0]!.messages[0]!.content =
      'Investor operating system: hire managers, not operators.'
    model.high_signal_episodes[0]!.verbatim_user_quote =
      'Investor operating system: hire managers, not operators.'
    model.high_signal_episodes[0]!.behavior_types = []
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0,
      user_judgment: 0,
      user_correction: 0,
      user_reframing: 0,
      ai_authorship: 0,
      third_party_authorship: 1,
    }

    expect(codesOf(model, transcript)).toContain('THIRD_PARTY_ATTRIBUTION_LEAK')
  })

  it('A10 requires conservative confidence when evidence is thin or unknown', () => {
    const { model, transcript } = makeFixture()
    model.working_archetype.evidence_status = 'unknown'
    model.working_archetype.claim_polarity = 'neutral'
    model.working_archetype.supporting_evidence_ids = []
    model.working_archetype.explanatory_confidence = 0.9
    model.working_archetype.outcome_validation_confidence = 0.9

    expect(codesOf(model, transcript)).toContain('MISSING_AS_WEAKNESS')
  })

  it.each(['Outcome operator', '执行者', '操盘手'])(
    'A11 does not infer operator strength from critique without action for %s',
    (name) => {
      const { model, transcript } = makeFixture()
      model.high_signal_episodes[0]!.behavior_types = ['correction']
      model.high_signal_episodes[0]!.user_action =
        'Wrote a long critique and stopped there.'
      model.capabilities[0]!.name = name
      model.capabilities[0]!.emergent_logic =
        '把长篇批评当成执行或操盘能力。'

      expect(codesOf(model, transcript)).toContain('OPERATOR_WITHOUT_ACTION')
    },
  )

  it('A11 allows a conservative unknown operator-strength boundary', () => {
    const { model, transcript } = makeFixture()
    model.capabilities[0]!.name = 'Architectural judgment'
    model.evidence_boundaries.push({
      claim: 'Operator strength / execution under uncertainty',
      evidence_status: 'unknown',
      claim_polarity: 'neutral',
      confidence: 0.2,
      supporting_evidence_ids: [],
    })

    expect(codesOf(model, transcript)).not.toContain('OPERATOR_WITHOUT_ACTION')
    expect(validateCandidateInvariants(model, transcript)).toEqual([])
  })

  it('A12 separates high agency from judgment', () => {
    const { model, transcript } = makeFixture()
    model.high_signal_episodes[0]!.behavior_types = ['action']
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0.95,
      user_judgment: 0.1,
      user_correction: 0.1,
      user_reframing: 0,
      ai_authorship: 0,
      third_party_authorship: 0,
    }
    model.capabilities[0]!.name = 'Judgment quality'
    model.capabilities[0]!.emergent_logic =
      'High agency is collapsed into strong judgment.'

    expect(model.high_signal_episodes[0]!.agency.user_authorship).toBeGreaterThan(
      model.high_signal_episodes[0]!.agency.user_judgment,
    )
    expect(codesOf(model, transcript)).toContain('AGENCY_JUDGMENT_COLLAPSE')
  })

  it('A12 accepts high agency without inferring judgment', () => {
    const { model, transcript } = makeFixture()
    model.high_signal_episodes[0]!.behavior_types = ['action']
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0.95,
      user_judgment: 0.1,
      user_correction: 0.1,
      user_reframing: 0,
      ai_authorship: 0,
      third_party_authorship: 0,
    }
    model.capabilities[0]!.name = 'High-agency execution'
    model.capabilities[0]!.emergent_logic =
      'The candidate acts quickly; judgment remains unvalidated.'
    model.mechanisms[0]!.name = 'Rapid action under incomplete goals'

    expect(validateCandidateInvariants(model, transcript)).toEqual([])
  })

  it('A14 allows high outcome validation while the latent model stays under-resolved', () => {
    const { model, transcript } = makeFixture()
    model.working_archetype.outcome_validation_confidence = 0.9
    model.working_archetype.explanatory_confidence = 0.3
    model.working_archetype.definition =
      'Outcomes are visible; the latent mechanism remains under-resolved.'
    model.evidence_boundaries.push({
      claim: 'Latent mechanism that produced the outcomes',
      evidence_status: 'unknown',
      claim_polarity: 'neutral',
      confidence: 0.2,
      supporting_evidence_ids: [],
    })

    expect(model.working_archetype.outcome_validation_confidence).toBeGreaterThan(
      model.working_archetype.explanatory_confidence,
    )
    expect(validateCandidateInvariants(model, transcript)).toEqual([])
  })
})
