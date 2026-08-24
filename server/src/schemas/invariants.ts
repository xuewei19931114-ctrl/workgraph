import type {
  CandidateModel,
  Episode,
  Transcript,
} from '../../../shared/profile-schemas.js'

export interface InvariantIssue {
  code:
    | 'INVALID_EVIDENCE_REFERENCE'
    | 'AI_ATTRIBUTION_LEAK'
    | 'THIRD_PARTY_ATTRIBUTION_LEAK'
    | 'AMBIGUOUS_ATTRIBUTION'
    | 'MISSING_AS_WEAKNESS'
    | 'ROLE_INFLATION'
    | 'RISK_EVIDENCE_CEILING'
    | 'INCOMPLETE_ARCHETYPE_COMPETITION'
    | 'INVALID_QUOTE_PROVENANCE'
    | 'GENERIC_ATTRACTOR'
    | 'OPERATOR_WITHOUT_ACTION'
    | 'AGENCY_JUDGMENT_COLLAPSE'
  path: string
  message: string
}

type EvidenceStatus =
  CandidateModel['capabilities'][number]['evidence_status']

const evidenceRank: Record<EvidenceStatus, number> = {
  missing: 0,
  unknown: 0,
  inferred: 1,
  observed: 2,
}

const competitionTypes = [
  'narrow',
  'higher_order',
  'domain',
  'operating_style',
  'null',
] as const

const meaningfulAgencyThreshold = 0.5
const actionBehaviorTypes = new Set([
  'action',
  'automation',
  'convergence',
  'transfer',
])

function isGenericAttractorName(name: string) {
  const normalized = name.trim().toLowerCase()
  return (
    normalized === 'smart' ||
    normalized === 'logical' ||
    normalized === '系统思考者' ||
    /\bsystems thinker\b/i.test(name) ||
    /\bstrategic thinker\b/i.test(name) ||
    /\bproblem solver\b/i.test(name) ||
    /\bstrong execution\b/i.test(name)
  )
}

function mentionsOperator(value: string) {
  return (
    /\boperator\b/i.test(value) ||
    /执行者|执行力|操盘手|操盘|落地/.test(value)
  )
}

function mentionsJudgment(value: string) {
  return /\bjudgment\b/i.test(value) || value.includes('判断')
}

function hasActionOrConvergence(episode: Episode) {
  return episode.behavior_types.some((type) =>
    actionBehaviorTypes.has(type.trim().toLowerCase()),
  )
}

function addInvalidReference(
  issues: InvariantIssue[],
  path: string,
  id: string,
) {
  issues.push({
    code: 'INVALID_EVIDENCE_REFERENCE',
    path,
    message: `Evidence reference "${id}" does not exist in the transcript or Episode set.`,
  })
}

function hasUserContribution(episode: Episode) {
  return (
    episode.agency.user_judgment >= meaningfulAgencyThreshold ||
    episode.agency.user_correction >= meaningfulAgencyThreshold ||
    episode.agency.user_reframing >= meaningfulAgencyThreshold ||
    episode.behavior_types.some(
      (type) => type.trim().toLowerCase() === 'transfer',
    )
  )
}

export function validateCandidateInvariants(
  model: CandidateModel,
  transcript: Transcript,
): InvariantIssue[] {
  const issues: InvariantIssue[] = []
  const reportDuplicateIds = (
    ids: string[],
    path: string,
    label: string,
  ) => {
    if (new Set(ids).size !== ids.length) {
      issues.push({
        code: 'INVALID_EVIDENCE_REFERENCE',
        path,
        message: `${label} IDs must be unique before resolving references.`,
      })
    }
  }
  const messages = transcript.conversations.flatMap(
    (conversation) => conversation.messages,
  )
  reportDuplicateIds(
    messages.map((message) => message.message_id),
    'transcript.conversations',
    'Transcript message',
  )
  reportDuplicateIds(
    model.high_signal_episodes.map((episode) => episode.episode_id),
    'high_signal_episodes',
    'Episode',
  )
  reportDuplicateIds(
    model.mechanisms.map((mechanism) => mechanism.id),
    'mechanisms',
    'Mechanism',
  )
  reportDuplicateIds(
    model.capabilities.map((capability) => capability.id),
    'capabilities',
    'Capability',
  )
  reportDuplicateIds(
    model.archetype_competition.map((candidate) => candidate.id),
    'archetype_competition',
    'Archetype competition',
  )
  reportDuplicateIds(
    model.role_fit.map((role) => role.id),
    'role_fit',
    'Role-fit',
  )
  const messagesById = new Map(
    messages.map((message) => [message.message_id, message]),
  )
  const messageIds = new Set(messagesById.keys())
  const episodesById = new Map(
    model.high_signal_episodes.map((episode) => [episode.episode_id, episode]),
  )
  const episodeIds = new Set(episodesById.keys())
  const mechanismIds = new Set(
    model.mechanisms.map((mechanism) => mechanism.id),
  )
  const capabilitiesById = new Map(
    model.capabilities.map((capability) => [capability.id, capability]),
  )
  const validEvidenceIds = new Set([...messageIds, ...episodeIds])
  const validateEvidenceIds = (ids: string[], pathPrefix: string) => {
    ids.forEach((id, referenceIndex) => {
      if (!validEvidenceIds.has(id)) {
        addInvalidReference(
          issues,
          `${pathPrefix}[${referenceIndex}]`,
          id,
        )
      }
    })
  }
  const validateClaim = (
    claim: {
      evidence_status: EvidenceStatus
      claim_polarity: 'positive' | 'neutral' | 'negative' | 'risk'
      confidence: number
      supporting_evidence_ids: string[]
    },
    path: string,
  ) => {
    validateEvidenceIds(
      claim.supporting_evidence_ids,
      `${path}.supporting_evidence_ids`,
    )
    const supported =
      claim.evidence_status === 'observed' ||
      claim.evidence_status === 'inferred'
    if (supported && claim.supporting_evidence_ids.length === 0) {
      issues.push({
        code: 'INVALID_EVIDENCE_REFERENCE',
        path: `${path}.supporting_evidence_ids`,
        message: 'A supported claim requires at least one evidence ID.',
      })
    }
    if (!supported && claim.claim_polarity !== 'neutral') {
      issues.push({
        code: 'MISSING_AS_WEAKNESS',
        path: `${path}.claim_polarity`,
        message: 'An unknown or missing claim must be neutral.',
      })
    }
    if (!supported && claim.confidence > 0.4) {
      issues.push({
        code: 'MISSING_AS_WEAKNESS',
        path: `${path}.confidence`,
        message:
          'An unknown or missing claim must keep confidence at or below 0.4.',
      })
    }
  }
  const checkAttribution = (episode: Episode, path: string) => {
    if (hasUserContribution(episode)) {
      return
    }
    const sourceAuthorship = episode.source_message_ids.map(
      (messageId) => messagesById.get(messageId)?.authorship,
    )
    if (sourceAuthorship.includes('mixed')) {
      issues.push({
        code: 'AMBIGUOUS_ATTRIBUTION',
        path,
        message:
          'Mixed authorship is ambiguous and cannot support a capability without meaningful user judgment, correction, reframing, or transfer.',
      })
    }
    if (
      episode.agency.ai_authorship >= meaningfulAgencyThreshold ||
      sourceAuthorship.includes('assistant')
    ) {
      issues.push({
        code: 'AI_ATTRIBUTION_LEAK',
        path,
        message:
          'AI-authored content cannot support a capability without meaningful user judgment, correction, reframing, or transfer.',
      })
    }
    if (
      episode.agency.third_party_authorship >= meaningfulAgencyThreshold ||
      sourceAuthorship.includes('third_party')
    ) {
      issues.push({
        code: 'THIRD_PARTY_ATTRIBUTION_LEAK',
        path,
        message:
          'Third-party content cannot support a capability without meaningful user judgment, correction, reframing, or transfer.',
      })
    }
  }

  model.high_signal_episodes.forEach((episode, episodeIndex) => {
    if (episode.source_message_ids.length === 0) {
      issues.push({
        code: 'INVALID_EVIDENCE_REFERENCE',
        path: `high_signal_episodes[${episodeIndex}].source_message_ids`,
        message: 'An Episode requires at least one source message ID.',
      })
    }
    episode.source_message_ids.forEach((id, referenceIndex) => {
      if (!messageIds.has(id)) {
        addInvalidReference(
          issues,
          `high_signal_episodes[${episodeIndex}].source_message_ids[${referenceIndex}]`,
          id,
        )
      }
    })
    if (
      episode.verbatim_user_quote !== null &&
      !episode.source_message_ids.some((id) => {
        const source = messagesById.get(id)
        return (
          source?.role === 'user' &&
          source.content.includes(episode.verbatim_user_quote as string)
        )
      })
    ) {
      issues.push({
        code: 'INVALID_QUOTE_PROVENANCE',
        path: `high_signal_episodes[${episodeIndex}].verbatim_user_quote`,
        message:
          'A verbatim user quote must exactly occur in at least one referenced user-role source message.',
      })
    }
  })
  if (
    isGenericAttractorName(model.working_archetype.name_en) ||
    isGenericAttractorName(model.working_archetype.name_cn)
  ) {
    issues.push({
      code: 'GENERIC_ATTRACTOR',
      path: 'working_archetype',
      message:
        'A generic attractor such as "systems thinker" cannot be the working archetype without a precise mechanism.',
    })
  }
  validateClaim(
    {
      ...model.working_archetype,
      confidence: Math.max(
        model.working_archetype.explanatory_confidence,
        model.working_archetype.outcome_validation_confidence,
      ),
    },
    'working_archetype',
  )
  model.core_loop.forEach((claim, claimIndex) => {
    validateClaim(claim, `core_loop[${claimIndex}]`)
  })
  validateClaim(model.why_different, 'why_different')

  model.mechanisms.forEach((mechanism, mechanismIndex) => {
    if (isGenericAttractorName(mechanism.name)) {
      issues.push({
        code: 'GENERIC_ATTRACTOR',
        path: `mechanisms[${mechanismIndex}].name`,
        message:
          'Generic mechanism labels such as "systems thinker" are not a precise mechanism.',
      })
    }
    mechanism.supporting_episode_ids.forEach((id, referenceIndex) => {
      if (!episodeIds.has(id)) {
        addInvalidReference(
          issues,
          `mechanisms[${mechanismIndex}].supporting_episode_ids[${referenceIndex}]`,
          id,
        )
      }
    })
    validateClaim(
      {
        ...mechanism,
        supporting_evidence_ids: mechanism.supporting_episode_ids,
      },
      `mechanisms[${mechanismIndex}]`,
    )
    ;(
      [
        ['predicted_observations', mechanism.predicted_observations],
        ['confirmed_predictions', mechanism.confirmed_predictions],
        ['missing_predictions', mechanism.missing_predictions],
        ['counter_evidence', mechanism.counter_evidence],
      ] as const
    ).forEach(([claimType, claims]) => {
      claims.forEach((claim, claimIndex) => {
        validateClaim(
          claim,
          `mechanisms[${mechanismIndex}].${claimType}[${claimIndex}]`,
        )
      })
    })
  })

  model.capabilities.forEach((capability, capabilityIndex) => {
    validateClaim(
      {
        ...capability,
        supporting_evidence_ids: capability.supporting_episode_ids,
      },
      `capabilities[${capabilityIndex}]`,
    )
    capability.mechanism_ids.forEach((id, referenceIndex) => {
      const path = `capabilities[${capabilityIndex}].mechanism_ids[${referenceIndex}]`
      const mechanism = model.mechanisms.find((candidate) => candidate.id === id)
      if (!mechanismIds.has(id) || !mechanism) {
        addInvalidReference(
          issues,
          path,
          id,
        )
        return
      }
      mechanism.supporting_episode_ids.forEach((episodeId) => {
        const episode = episodesById.get(episodeId)
        if (episode) {
          checkAttribution(episode, path)
        }
      })
    })

    capability.supporting_episode_ids.forEach((id, referenceIndex) => {
      const path = `capabilities[${capabilityIndex}].supporting_episode_ids[${referenceIndex}]`
      const episode = episodesById.get(id)
      if (!episode) {
        addInvalidReference(issues, path, id)
        return
      }
      checkAttribution(episode, path)
    })

    const supported =
      capability.evidence_status === 'observed' ||
      capability.evidence_status === 'inferred'
    if (supported && capability.confidence > 0.4) {
      const relatedEpisodes = [
        ...capability.supporting_episode_ids,
        ...capability.mechanism_ids.flatMap((mechanismId) => {
          const mechanism = model.mechanisms.find(
            (candidate) => candidate.id === mechanismId,
          )
          return mechanism?.supporting_episode_ids ?? []
        }),
      ]
        .map((id) => episodesById.get(id))
        .filter((episode): episode is Episode => episode !== undefined)
      if (
        relatedEpisodes.length > 0 &&
        (mentionsOperator(capability.name) ||
          mentionsOperator(capability.emergent_logic)) &&
        !relatedEpisodes.some(hasActionOrConvergence)
      ) {
        issues.push({
          code: 'OPERATOR_WITHOUT_ACTION',
          path: `capabilities[${capabilityIndex}]`,
          message:
            'Operator or execution strength cannot be inferred from critique without action, automation, or convergence.',
        })
      }
      if (
        relatedEpisodes.length > 0 &&
        mentionsJudgment(capability.name) &&
        !relatedEpisodes.some(
          (episode) =>
            episode.agency.user_judgment >= meaningfulAgencyThreshold,
        )
      ) {
        issues.push({
          code: 'AGENCY_JUDGMENT_COLLAPSE',
          path: `capabilities[${capabilityIndex}]`,
          message:
            'High agency cannot be collapsed into judgment without independent judgment evidence.',
        })
      }
    }
  })

  model.strength_risk_pairs.forEach((pair, pairIndex) => {
    const capability = capabilitiesById.get(pair.capability_id)
    if (
      evidenceRank[pair.evidence_status] >
      evidenceRank[pair.evidence_status_ceiling]
    ) {
      issues.push({
        code: 'RISK_EVIDENCE_CEILING',
        path: `strength_risk_pairs[${pairIndex}].evidence_status`,
        message:
          'Risk evidence status cannot exceed its declared evidence-status ceiling.',
      })
    }
    if (!capability) {
      addInvalidReference(
        issues,
        `strength_risk_pairs[${pairIndex}].capability_id`,
        pair.capability_id,
      )
    } else if (
      evidenceRank[pair.evidence_status_ceiling] >
      evidenceRank[capability.evidence_status]
    ) {
      issues.push({
        code: 'RISK_EVIDENCE_CEILING',
        path: `strength_risk_pairs[${pairIndex}].evidence_status_ceiling`,
        message:
          'Risk evidence status cannot exceed the linked capability evidence status.',
      })
    }

    validateClaim(pair, `strength_risk_pairs[${pairIndex}]`)
  })

  model.role_fit.forEach((role, roleIndex) => {
    validateClaim(role, `role_fit[${roleIndex}]`)
    if (
      (role.evidence_status === 'unknown' ||
        role.evidence_status === 'missing') &&
      role.readiness > 0.4
    ) {
      issues.push({
        code: 'ROLE_INFLATION',
        path: `role_fit[${roleIndex}].readiness`,
        message:
          'Readiness cannot be asserted while independent role evidence is unknown or missing.',
      })
    }
    if (
      (role.evidence_status === 'unknown' ||
        role.evidence_status === 'missing') &&
      role.natural_fit > 0.4
    ) {
      issues.push({
        code: 'ROLE_INFLATION',
        path: `role_fit[${roleIndex}].natural_fit`,
        message:
          'Natural fit cannot be asserted while independent role evidence is unknown or missing.',
      })
    }
    if (
      role.seniority_evidence.status === 'unknown' &&
      role.seniority_evidence.level !== null
    ) {
      issues.push({
        code: 'ROLE_INFLATION',
        path: `role_fit[${roleIndex}].seniority_evidence`,
        message:
          'Seniority cannot be asserted while independent seniority evidence is unknown.',
      })
    }
    if (
      role.seniority_evidence.status !== 'unknown' &&
      role.seniority_evidence.supporting_evidence_ids.length === 0
    ) {
      issues.push({
        code: 'ROLE_INFLATION',
        path: `role_fit[${roleIndex}].seniority_evidence.supporting_evidence_ids`,
        message:
          'Inferred or observed seniority requires supporting message or Episode evidence IDs.',
      })
    }
    role.seniority_evidence.supporting_evidence_ids.forEach(
      (id, referenceIndex) => {
        if (!validEvidenceIds.has(id)) {
          addInvalidReference(
            issues,
            `role_fit[${roleIndex}].seniority_evidence.supporting_evidence_ids[${referenceIndex}]`,
            id,
          )
        }
      },
    )
  })

  model.evidence_boundaries.forEach((boundary, boundaryIndex) => {
    validateClaim(boundary, `evidence_boundaries[${boundaryIndex}]`)
  })
  model.hiring_manager_summary.claims.forEach((claim, claimIndex) => {
    validateClaim(claim, `hiring_manager_summary.claims[${claimIndex}]`)
  })
  const rolesById = new Map(model.role_fit.map((role) => [role.id, role]))
  model.hiring_manager_summary.seniority_claims.forEach(
    (claim, claimIndex) => {
      const path = `hiring_manager_summary.seniority_claims[${claimIndex}]`
      validateClaim(claim, path)
      const role = rolesById.get(claim.role_fit_id)
      if (!role) {
        issues.push({
          code: 'ROLE_INFLATION',
          path: `${path}.role_fit_id`,
          message:
            'A summary seniority claim must reference an existing role fit ID.',
        })
        return
      }
      if (claim.level !== role.seniority_evidence.level) {
        issues.push({
          code: 'ROLE_INFLATION',
          path: `${path}.level`,
          message:
            'A summary seniority claim must use the exact referenced role-fit seniority level.',
        })
      }
      if (claim.evidence_status !== role.seniority_evidence.status) {
        issues.push({
          code: 'ROLE_INFLATION',
          path: `${path}.evidence_status`,
          message:
            'A summary seniority claim must use the referenced role-fit seniority evidence status.',
        })
      }
      const summaryEvidence = new Set(claim.supporting_evidence_ids)
      const roleEvidence = new Set(
        role.seniority_evidence.supporting_evidence_ids,
      )
      const evidenceMatches =
        summaryEvidence.size === roleEvidence.size &&
        [...summaryEvidence].every((id) => roleEvidence.has(id))
      if (!evidenceMatches) {
        issues.push({
          code: 'ROLE_INFLATION',
          path: `${path}.supporting_evidence_ids`,
          message:
            'A summary seniority claim must use exactly the referenced role-fit seniority evidence IDs.',
        })
      }
    },
  )

  const presentCompetitionTypes = new Set(
    model.archetype_competition.map((candidate) => candidate.type),
  )
  const missingTypes = competitionTypes.filter(
    (type) => !presentCompetitionTypes.has(type),
  )
  if (missingTypes.length > 0) {
    issues.push({
      code: 'INCOMPLETE_ARCHETYPE_COMPETITION',
      path: 'archetype_competition',
      message: `Archetype competition is missing categories: ${missingTypes.join(', ')}.`,
    })
  }
  model.archetype_competition.forEach((candidate, candidateIndex) => {
    ;(
      [
        ['explains', candidate.explains],
        ['fails_to_explain', candidate.fails_to_explain],
        ['unsupported_assumptions', candidate.unsupported_assumptions],
      ] as const
    ).forEach(([claimType, claims]) => {
      claims.forEach((claim, claimIndex) => {
        validateClaim(
          claim,
          `archetype_competition[${candidateIndex}].${claimType}[${claimIndex}]`,
        )
      })
    })
  })
  validateClaim(
    model.strongest_counterargument,
    'strongest_counterargument',
  )

  return issues
}
