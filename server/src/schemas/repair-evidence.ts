import type {
  CandidateModel,
  Transcript,
} from '../../../shared/profile-schemas.js'

interface ClaimLike {
  evidence_status: 'observed' | 'inferred' | 'unknown' | 'missing'
  claim_polarity: 'positive' | 'neutral' | 'negative' | 'risk'
  confidence: number
  supporting_evidence_ids: string[]
}

export interface EvidenceRepairStats {
  model: CandidateModel
  reboundEpisodes: number
  droppedEpisodes: number
  droppedMessageRefs: number
  droppedEvidenceRefs: number
  downgradedClaims: number
  nulledQuotes: number
}

function unique(ids: string[]): string[] {
  return [...new Set(ids)]
}

function episodeAliasIndex(id: string): number | null {
  const match = /^(?:e|ep|episode)[-_]?(\d+)$/i.exec(id.trim())
  if (!match) return null
  const index = Number(match[1]) - 1
  return Number.isInteger(index) && index >= 0 ? index : null
}

function resolveEpisodeId(id: string, episodeIds: string[]): string | null {
  if (episodeIds.includes(id)) return id
  const index = episodeAliasIndex(id)
  return index !== null ? (episodeIds[index] ?? null) : null
}

function resolveEvidenceId(
  id: string,
  messageIds: Set<string>,
  episodeIds: string[],
): string | null {
  if (messageIds.has(id)) return id
  return resolveEpisodeId(id, episodeIds)
}

function repairClaim(
  claim: ClaimLike,
  messageIds: Set<string>,
  episodeIds: string[],
  stats: { droppedEvidenceRefs: number; downgradedClaims: number },
): ClaimLike {
  const resolved = unique(
    claim.supporting_evidence_ids.flatMap((id) => {
      const mapped = resolveEvidenceId(id, messageIds, episodeIds)
      if (mapped === null) {
        stats.droppedEvidenceRefs += 1
        return []
      }
      return [mapped]
    }),
  )
  const supported =
    claim.evidence_status === 'observed' || claim.evidence_status === 'inferred'
  if (supported && resolved.length === 0) {
    stats.downgradedClaims += 1
    return {
      ...claim,
      supporting_evidence_ids: [],
      evidence_status: 'unknown',
      claim_polarity: 'neutral',
      confidence: Math.min(claim.confidence, 0.4),
    }
  }
  return { ...claim, supporting_evidence_ids: resolved }
}

export function repairCandidateEvidence(
  model: CandidateModel,
  transcript: Transcript,
): EvidenceRepairStats {
  const cloned = structuredClone(model)
  const messages = transcript.conversations.flatMap(
    (conversation) => conversation.messages,
  )
  const messageIds = new Set(messages.map((message) => message.message_id))
  const userMessages = messages.filter((message) => message.role === 'user')
  const stats = {
    reboundEpisodes: 0,
    droppedEpisodes: 0,
    droppedMessageRefs: 0,
    droppedEvidenceRefs: 0,
    downgradedClaims: 0,
    nulledQuotes: 0,
  }

  const keptEpisodes = cloned.high_signal_episodes.flatMap((episode) => {
    const originalSources = episode.source_message_ids
    const existing = originalSources.filter((id) => messageIds.has(id))
    stats.droppedMessageRefs += originalSources.length - existing.length
    const quote = episode.verbatim_user_quote
    const quoteMatches =
      quote === null
        ? []
        : userMessages
            .filter((message) => message.content.includes(quote))
            .map((message) => message.message_id)
    if (quote !== null && quoteMatches.length === 0) {
      episode.verbatim_user_quote = null
      stats.nulledQuotes += 1
    }
    const sources = unique([...existing, ...quoteMatches])
    if (sources.length === 0) {
      stats.droppedEpisodes += 1
      return []
    }
    if (sources.join('\0') !== originalSources.join('\0')) {
      stats.reboundEpisodes += 1
    }
    return [{ ...episode, source_message_ids: sources }]
  })
  cloned.high_signal_episodes = keptEpisodes
  const episodeIds = keptEpisodes.map((episode) => episode.episode_id)

  const claimStats = {
    droppedEvidenceRefs: stats.droppedEvidenceRefs,
    downgradedClaims: stats.downgradedClaims,
  }
  const nextClaim = <T extends ClaimLike>(claim: T): T =>
    repairClaim(claim, messageIds, episodeIds, claimStats) as T

  const repairedArchetype = nextClaim({
    evidence_status: cloned.working_archetype.evidence_status,
    claim_polarity: cloned.working_archetype.claim_polarity,
    confidence: Math.max(
      cloned.working_archetype.explanatory_confidence,
      cloned.working_archetype.outcome_validation_confidence,
    ),
    supporting_evidence_ids: cloned.working_archetype.supporting_evidence_ids,
  })
  cloned.working_archetype = {
    ...cloned.working_archetype,
    evidence_status: repairedArchetype.evidence_status,
    claim_polarity: repairedArchetype.claim_polarity,
    supporting_evidence_ids: repairedArchetype.supporting_evidence_ids,
  }
  if (
    cloned.working_archetype.evidence_status === 'unknown' ||
    cloned.working_archetype.evidence_status === 'missing'
  ) {
    cloned.working_archetype.explanatory_confidence = Math.min(
      cloned.working_archetype.explanatory_confidence,
      0.4,
    )
    cloned.working_archetype.outcome_validation_confidence = Math.min(
      cloned.working_archetype.outcome_validation_confidence,
      0.4,
    )
  }
  cloned.core_loop = cloned.core_loop.map(nextClaim)
  cloned.why_different = nextClaim(cloned.why_different)
  cloned.mechanisms = cloned.mechanisms.map((mechanism) => {
    const supporting = unique(
      mechanism.supporting_episode_ids.flatMap((id) => {
        const mapped = resolveEpisodeId(id, episodeIds)
        if (mapped === null) {
          claimStats.droppedEvidenceRefs += 1
          return []
        }
        return [mapped]
      }),
    )
    const repaired = nextClaim({
      ...mechanism,
      supporting_evidence_ids: supporting,
    })
    return {
      ...mechanism,
      supporting_episode_ids: repaired.supporting_evidence_ids,
      evidence_status: repaired.evidence_status,
      claim_polarity: repaired.claim_polarity,
      confidence: repaired.confidence,
      predicted_observations: mechanism.predicted_observations.map(nextClaim),
      confirmed_predictions: mechanism.confirmed_predictions.map(nextClaim),
      missing_predictions: mechanism.missing_predictions.map(nextClaim),
      counter_evidence: mechanism.counter_evidence.map(nextClaim),
    }
  })
  const mechanismIds = new Set(
    cloned.mechanisms.map((mechanism) => mechanism.id),
  )
  cloned.capabilities = cloned.capabilities.map((capability) => {
    const supporting = unique(
      capability.supporting_episode_ids.flatMap((id) => {
        const mapped = resolveEpisodeId(id, episodeIds)
        if (mapped === null) {
          claimStats.droppedEvidenceRefs += 1
          return []
        }
        return [mapped]
      }),
    )
    const mechanism_ids = unique(
      capability.mechanism_ids.flatMap((id) => {
        if (!mechanismIds.has(id)) {
          claimStats.droppedEvidenceRefs += 1
          return []
        }
        return [id]
      }),
    )
    const repaired = nextClaim({
      ...capability,
      supporting_evidence_ids: supporting,
    })
    return {
      ...capability,
      mechanism_ids,
      supporting_episode_ids: repaired.supporting_evidence_ids,
      evidence_status: repaired.evidence_status,
      claim_polarity: repaired.claim_polarity,
      confidence: repaired.confidence,
    }
  })
  const capabilityIds = new Set(
    cloned.capabilities.map((capability) => capability.id),
  )
  cloned.strength_risk_pairs = cloned.strength_risk_pairs.flatMap((pair) => {
    if (!capabilityIds.has(pair.capability_id)) {
      claimStats.droppedEvidenceRefs += 1
      return []
    }
    return [nextClaim(pair)]
  })
  cloned.role_fit = cloned.role_fit.map((role) => {
    const repaired = nextClaim(role)
    const seniorityIds = unique(
      role.seniority_evidence.supporting_evidence_ids.flatMap((id) => {
        const mapped = resolveEvidenceId(id, messageIds, episodeIds)
        if (mapped === null) {
          claimStats.droppedEvidenceRefs += 1
          return []
        }
        return [mapped]
      }),
    )
    const senioritySupported =
      role.seniority_evidence.status === 'observed' ||
      role.seniority_evidence.status === 'inferred'
    const seniority =
      senioritySupported && seniorityIds.length === 0
        ? {
            status: 'unknown' as const,
            level: null,
            supporting_evidence_ids: [],
          }
        : {
            ...role.seniority_evidence,
            supporting_evidence_ids: seniorityIds,
          }
    return {
      ...role,
      ...repaired,
      seniority_evidence: seniority,
    }
  })
  cloned.evidence_boundaries = cloned.evidence_boundaries.map(nextClaim)
  cloned.hiring_manager_summary = {
    claims: cloned.hiring_manager_summary.claims.map(nextClaim),
    seniority_claims: cloned.hiring_manager_summary.seniority_claims.map(
      (claim) => nextClaim(claim),
    ),
  }
  cloned.archetype_competition = cloned.archetype_competition.map(
    (candidate) => ({
      ...candidate,
      explains: candidate.explains.map(nextClaim),
      fails_to_explain: candidate.fails_to_explain.map(nextClaim),
      unsupported_assumptions: candidate.unsupported_assumptions.map(nextClaim),
    }),
  )
  cloned.strongest_counterargument = nextClaim(cloned.strongest_counterargument)
  stats.droppedEvidenceRefs = claimStats.droppedEvidenceRefs
  stats.downgradedClaims = claimStats.downgradedClaims
  return { model: cloned, ...stats }
}
