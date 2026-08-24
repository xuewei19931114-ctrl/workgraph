import { describe, expect, it } from 'vitest'

import {
  CandidateModelSchema,
  TranscriptSchema,
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

function expectIssue(
  issues: ReturnType<typeof validateCandidateInvariants>,
  code: ReturnType<typeof validateCandidateInvariants>[number]['code'],
  path: string,
) {
  expect(issues).toContainEqual(
    expect.objectContaining({
      code,
      path,
      message: expect.any(String),
    }),
  )
}

describe('validateCandidateInvariants', () => {
  it.each([
    ['message', 'transcript.conversations'],
    ['Episode', 'high_signal_episodes'],
    ['mechanism', 'mechanisms'],
    ['capability', 'capabilities'],
    ['competition', 'archetype_competition'],
    ['role fit', 'role_fit'],
  ])('reports duplicate %s IDs before reference lookup', (kind, path) => {
    const { model, transcript } = makeFixture()
    if (kind === 'message') {
      transcript.conversations[0]!.messages.push(
        structuredClone(transcript.conversations[0]!.messages[0]!),
      )
    } else if (kind === 'Episode') {
      model.high_signal_episodes.push(
        structuredClone(model.high_signal_episodes[0]!),
      )
    } else if (kind === 'mechanism') {
      model.mechanisms.push(structuredClone(model.mechanisms[0]!))
    } else if (kind === 'capability') {
      model.capabilities.push(structuredClone(model.capabilities[0]!))
    } else if (kind === 'competition') {
      model.archetype_competition[1]!.id =
        model.archetype_competition[0]!.id
    } else {
      model.role_fit.push(structuredClone(model.role_fit[0]!))
    }

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'INVALID_EVIDENCE_REFERENCE',
      path,
    )
  })

  it('reports a capability that references a nonexistent Episode', () => {
    const { model, transcript } = makeFixture()
    model.capabilities[0]!.supporting_episode_ids = ['missing-episode']

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'INVALID_EVIDENCE_REFERENCE',
      'capabilities[0].supporting_episode_ids[0]',
    )
  })

  it('reports an Episode that references a nonexistent message', () => {
    const { model, transcript } = makeFixture()
    model.high_signal_episodes[0]!.source_message_ids = ['missing-message']

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'INVALID_EVIDENCE_REFERENCE',
      'high_signal_episodes[0].source_message_ids[0]',
    )
  })

  it('reports an Episode without any source message ID', () => {
    const { model, transcript } = makeFixture()
    model.high_signal_episodes[0]!.source_message_ids = []

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'INVALID_EVIDENCE_REFERENCE',
      'high_signal_episodes[0].source_message_ids',
    )
  })

  it('rejects a fabricated verbatim user quote with a stable issue code', () => {
    const { model, transcript } = makeFixture()
    model.high_signal_episodes[0]!.verbatim_user_quote = 'Fabricated quote.'

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'INVALID_QUOTE_PROVENANCE',
      'high_signal_episodes[0].verbatim_user_quote',
    )
  })

  it('rejects a quote found only in an assistant-role source message', () => {
    const { model, transcript } = makeFixture()
    transcript.conversations[0]!.messages[0]!.role = 'assistant'

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'INVALID_QUOTE_PROVENANCE',
      'high_signal_episodes[0].verbatim_user_quote',
    )
  })

  it('accepts an exact quote from a referenced user-role source message', () => {
    const { model, transcript } = makeFixture()

    expect(
      validateCandidateInvariants(model, transcript).some(
        ({ code }) => code === 'INVALID_QUOTE_PROVENANCE',
      ),
    ).toBe(false)
  })

  it.each([
    ['working archetype', 'working_archetype.supporting_evidence_ids[0]'],
    [
      'archetype competition explanation',
      'archetype_competition[0].explains[0].supporting_evidence_ids[0]',
    ],
    [
      'strongest counterargument',
      'strongest_counterargument.supporting_evidence_ids[0]',
    ],
    ['role fit claim', 'role_fit[0].supporting_evidence_ids[0]'],
    [
      'hiring manager summary',
      'hiring_manager_summary.claims[0].supporting_evidence_ids[0]',
    ],
  ])('validates every %s evidence ID', (claim, path) => {
    const { model, transcript } = makeFixture()
    if (claim === 'working archetype') {
      model.working_archetype.supporting_evidence_ids = ['missing-evidence']
    } else if (claim === 'archetype competition explanation') {
      model.archetype_competition[0]!.explains[0]!.supporting_evidence_ids = [
        'missing-evidence',
      ]
    } else if (claim === 'strongest counterargument') {
      model.strongest_counterargument.supporting_evidence_ids = [
        'missing-evidence',
      ]
    } else if (claim === 'role fit claim') {
      model.role_fit[0]!.supporting_evidence_ids = ['missing-evidence']
    } else {
      model.hiring_manager_summary.claims[0]!.supporting_evidence_ids = [
        'missing-evidence',
      ]
    }

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'INVALID_EVIDENCE_REFERENCE',
      path,
    )
  })

  it('rejects AI-authored support without user judgment or correction', () => {
    const { model, transcript } = makeFixture()
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0,
      user_judgment: 0,
      user_correction: 0,
      user_reframing: 0,
      ai_authorship: 1,
      third_party_authorship: 0,
    }
    model.high_signal_episodes[0]!.behavior_types = []

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'AI_ATTRIBUTION_LEAK',
      'capabilities[0].supporting_episode_ids[0]',
    )
  })

  it('uses source-message authorship when checking AI attribution', () => {
    const { model, transcript } = makeFixture()
    transcript.conversations[0]!.messages[0]!.authorship = 'assistant'
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0,
      user_judgment: 0,
      user_correction: 0,
      user_reframing: 0,
      ai_authorship: 0,
      third_party_authorship: 0,
    }
    model.high_signal_episodes[0]!.behavior_types = []

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'AI_ATTRIBUTION_LEAK',
      'capabilities[0].supporting_episode_ids[0]',
    )
  })

  it('rejects third-party support without user transfer or judgment', () => {
    const { model, transcript } = makeFixture()
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0,
      user_judgment: 0,
      user_correction: 0,
      user_reframing: 0,
      ai_authorship: 0,
      third_party_authorship: 1,
    }
    model.high_signal_episodes[0]!.behavior_types = []

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'THIRD_PARTY_ATTRIBUTION_LEAK',
      'capabilities[0].supporting_episode_ids[0]',
    )
  })

  it('follows capability mechanism references to contaminated Episodes', () => {
    const { model, transcript } = makeFixture()
    model.capabilities[0]!.supporting_episode_ids = []
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0,
      user_judgment: 0,
      user_correction: 0,
      user_reframing: 0,
      ai_authorship: 1,
      third_party_authorship: 0,
    }
    model.high_signal_episodes[0]!.behavior_types = []

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'AI_ATTRIBUTION_LEAK',
      'capabilities[0].mechanism_ids[0]',
    )
  })

  it('reports mixed source authorship as one ambiguous attribution issue', () => {
    const { model, transcript } = makeFixture()
    transcript.conversations[0]!.messages[0]!.authorship = 'mixed'
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0,
      user_judgment: 0,
      user_correction: 0,
      user_reframing: 0,
      ai_authorship: 0,
      third_party_authorship: 0,
    }
    model.high_signal_episodes[0]!.behavior_types = []

    const issues = validateCandidateInvariants(model, transcript)
    expectIssue(
      issues,
      'AMBIGUOUS_ATTRIBUTION',
      'capabilities[0].supporting_episode_ids[0]',
    )
    expect(
      issues.some(
        ({ code }) =>
          code === 'AI_ATTRIBUTION_LEAK' ||
          code === 'THIRD_PARTY_ATTRIBUTION_LEAK',
      ),
    ).toBe(false)
  })

  it('keeps independently known AI contamination alongside mixed ambiguity', () => {
    const { model, transcript } = makeFixture()
    transcript.conversations[0]!.messages[0]!.authorship = 'mixed'
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0,
      user_judgment: 0,
      user_correction: 0,
      user_reframing: 0,
      ai_authorship: 0.9,
      third_party_authorship: 0,
    }
    model.high_signal_episodes[0]!.behavior_types = []

    const issues = validateCandidateInvariants(model, transcript)
    expectIssue(
      issues,
      'AMBIGUOUS_ATTRIBUTION',
      'capabilities[0].supporting_episode_ids[0]',
    )
    expectIssue(
      issues,
      'AI_ATTRIBUTION_LEAK',
      'capabilities[0].supporting_episode_ids[0]',
    )
  })

  it('keeps independently known third-party contamination alongside mixed ambiguity', () => {
    const { model, transcript } = makeFixture()
    transcript.conversations[0]!.messages[0]!.authorship = 'mixed'
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0,
      user_judgment: 0,
      user_correction: 0,
      user_reframing: 0,
      ai_authorship: 0,
      third_party_authorship: 0.9,
    }
    model.high_signal_episodes[0]!.behavior_types = []

    const issues = validateCandidateInvariants(model, transcript)
    expectIssue(
      issues,
      'AMBIGUOUS_ATTRIBUTION',
      'capabilities[0].supporting_episode_ids[0]',
    )
    expectIssue(
      issues,
      'THIRD_PARTY_ATTRIBUTION_LEAK',
      'capabilities[0].supporting_episode_ids[0]',
    )
  })

  it('requires meaningful user agency to clear contaminated support', () => {
    const { model, transcript } = makeFixture()
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0,
      user_judgment: 0.1,
      user_correction: 0,
      user_reframing: 0,
      ai_authorship: 0.9,
      third_party_authorship: 0,
    }
    model.high_signal_episodes[0]!.behavior_types = []

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'AI_ATTRIBUTION_LEAK',
      'capabilities[0].supporting_episode_ids[0]',
    )
  })

  it('requires the exact transfer behavior type', () => {
    const { model, transcript } = makeFixture()
    model.high_signal_episodes[0]!.agency = {
      user_authorship: 0,
      user_judgment: 0,
      user_correction: 0,
      user_reframing: 0,
      ai_authorship: 0,
      third_party_authorship: 1,
    }
    model.high_signal_episodes[0]!.behavior_types = ['knowledge_transfer']

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'THIRD_PARTY_ATTRIBUTION_LEAK',
      'capabilities[0].supporting_episode_ids[0]',
    )
  })

  it('rejects a negative mechanism claim with missing evidence', () => {
    const { model, transcript } = makeFixture()
    model.mechanisms[0]!.evidence_status = 'missing'
    model.mechanisms[0]!.claim_polarity = 'negative'
    model.mechanisms[0]!.confidence = 0.2
    model.mechanisms[0]!.supporting_episode_ids = []

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'MISSING_AS_WEAKNESS',
      'mechanisms[0].claim_polarity',
    )
  })

  it('rejects high confidence for a missing mechanism claim', () => {
    const { model, transcript } = makeFixture()
    model.mechanisms[0]!.evidence_status = 'missing'
    model.mechanisms[0]!.claim_polarity = 'neutral'
    model.mechanisms[0]!.confidence = 0.8
    model.mechanisms[0]!.supporting_episode_ids = []

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'MISSING_AS_WEAKNESS',
      'mechanisms[0].confidence',
    )
  })

  it('enforces structured metadata on missing mechanism predictions', () => {
    const { model, transcript } = makeFixture()
    model.mechanisms[0]!.missing_predictions = [
      {
        claim: 'Execution discipline is absent.',
        evidence_status: 'missing',
        claim_polarity: 'negative',
        confidence: 0.2,
        supporting_evidence_ids: [],
      },
    ]

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'MISSING_AS_WEAKNESS',
      'mechanisms[0].missing_predictions[0].claim_polarity',
    )
  })

  it('validates evidence IDs on mechanism prediction claims', () => {
    const { model, transcript } = makeFixture()
    model.mechanisms[0]!.predicted_observations = [
      {
        claim: 'A prediction.',
        evidence_status: 'inferred',
        claim_polarity: 'neutral',
        confidence: 0.5,
        supporting_evidence_ids: ['missing-evidence'],
      },
    ]

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'INVALID_EVIDENCE_REFERENCE',
      'mechanisms[0].predicted_observations[0].supporting_evidence_ids[0]',
    )
  })

  it('rejects an unknown risk claim with risk polarity', () => {
    const { model, transcript } = makeFixture()
    model.strength_risk_pairs[0]!.evidence_status = 'unknown'
    model.strength_risk_pairs[0]!.claim_polarity = 'risk'
    model.strength_risk_pairs[0]!.confidence = 0.2
    model.strength_risk_pairs[0]!.supporting_evidence_ids = []

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'MISSING_AS_WEAKNESS',
      'strength_risk_pairs[0].claim_polarity',
    )
  })

  it('rejects asserted seniority when seniority evidence is unknown', () => {
    const { model, transcript } = makeFixture()
    model.role_fit[0]!.role_family = 'Senior Product Leader'
    model.role_fit[0]!.seniority_evidence = {
      status: 'unknown',
      level: 'senior',
      supporting_evidence_ids: [],
    }

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'ROLE_INFLATION',
      'role_fit[0].seniority_evidence',
    )
  })

  it.each(['inferred', 'observed'] as const)(
    'requires evidence IDs for %s seniority evidence',
    (status) => {
      const { model, transcript } = makeFixture()
      model.role_fit[0]!.seniority_evidence = {
        status,
        level: 'senior',
        supporting_evidence_ids: [],
      }

      expectIssue(
        validateCandidateInvariants(model, transcript),
        'ROLE_INFLATION',
        'role_fit[0].seniority_evidence.supporting_evidence_ids',
      )
    },
  )

  it('rejects a positive role claim with unknown evidence', () => {
    const { model, transcript } = makeFixture()
    model.role_fit[0]!.evidence_status = 'unknown'
    model.role_fit[0]!.claim_polarity = 'positive'
    model.role_fit[0]!.confidence = 0.2
    model.role_fit[0]!.supporting_evidence_ids = []

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'MISSING_AS_WEAKNESS',
      'role_fit[0].claim_polarity',
    )
  })

  it('enforces structured metadata for hiring summary claims', () => {
    const { model, transcript } = makeFixture()
    model.hiring_manager_summary.claims[0]!.evidence_status = 'missing'
    model.hiring_manager_summary.claims[0]!.claim_polarity = 'negative'
    model.hiring_manager_summary.claims[0]!.confidence = 0.2
    model.hiring_manager_summary.claims[0]!.supporting_evidence_ids = []

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'MISSING_AS_WEAKNESS',
      'hiring_manager_summary.claims[0].claim_polarity',
    )
  })

  it('requires a summary seniority claim to reference an existing role fit', () => {
    const { model, transcript } = makeFixture()
    model.hiring_manager_summary.seniority_claims = [
      {
        claim: 'Ready at mid-level.',
        role_fit_id: 'missing-role',
        level: 'mid-level',
        evidence_status: 'inferred',
        claim_polarity: 'positive',
        confidence: 0.6,
        supporting_evidence_ids: ['episode-1'],
      },
    ]

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'ROLE_INFLATION',
      'hiring_manager_summary.seniority_claims[0].role_fit_id',
    )
  })

  it('requires a summary seniority claim to use the exact role level', () => {
    const { model, transcript } = makeFixture()
    model.hiring_manager_summary.seniority_claims = [
      {
        claim: 'Ready at senior level.',
        role_fit_id: 'role-1',
        level: 'senior',
        evidence_status: 'inferred',
        claim_polarity: 'positive',
        confidence: 0.6,
        supporting_evidence_ids: ['episode-1'],
      },
    ]

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'ROLE_INFLATION',
      'hiring_manager_summary.seniority_claims[0].level',
    )
  })

  it('requires a summary seniority claim to use the role seniority evidence', () => {
    const { model, transcript } = makeFixture()
    model.hiring_manager_summary.seniority_claims = [
      {
        claim: 'Ready at mid-level.',
        role_fit_id: 'role-1',
        level: 'mid-level',
        evidence_status: 'inferred',
        claim_polarity: 'positive',
        confidence: 0.6,
        supporting_evidence_ids: ['message-1'],
      },
    ]

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'ROLE_INFLATION',
      'hiring_manager_summary.seniority_claims[0].supporting_evidence_ids',
    )
  })

  it('accepts a summary seniority claim bound to the exact role evidence', () => {
    const { model, transcript } = makeFixture()
    model.hiring_manager_summary.seniority_claims = [
      {
        claim: 'Ready at mid-level.',
        role_fit_id: 'role-1',
        level: 'mid-level',
        evidence_status: 'inferred',
        claim_polarity: 'positive',
        confidence: 0.6,
        supporting_evidence_ids: ['episode-1'],
      },
    ]

    expect(validateCandidateInvariants(model, transcript)).toEqual([])
  })

  it('rejects a risk evidence ceiling above capability evidence', () => {
    const { model, transcript } = makeFixture()
    model.capabilities[0]!.evidence_status = 'inferred'
    model.strength_risk_pairs[0]!.evidence_status_ceiling = 'observed'

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'RISK_EVIDENCE_CEILING',
      'strength_risk_pairs[0].evidence_status_ceiling',
    )
  })

  it('rejects risk evidence above its own evidence ceiling', () => {
    const { model, transcript } = makeFixture()
    model.capabilities[0]!.evidence_status = 'observed'
    model.strength_risk_pairs[0]!.evidence_status_ceiling = 'inferred'
    model.strength_risk_pairs[0]!.evidence_status = 'observed'

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'RISK_EVIDENCE_CEILING',
      'strength_risk_pairs[0].evidence_status',
    )
  })

  it('requires all five archetype competition categories', () => {
    const { model, transcript } = makeFixture()
    model.archetype_competition = model.archetype_competition.filter(
      ({ type }) => type !== 'null',
    )

    expectIssue(
      validateCandidateInvariants(model, transcript),
      'INCOMPLETE_ARCHETYPE_COMPETITION',
      'archetype_competition',
    )
  })

  it('does not mutate a valid model and returns no issues', () => {
    const { model, transcript } = makeFixture()
    const before = structuredClone(model)

    expect(validateCandidateInvariants(model, transcript)).toEqual([])
    expect(model).toEqual(before)
  })
})
