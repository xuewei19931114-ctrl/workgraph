import type { CandidateModel } from '../../../shared/profile-schemas.js'
import {
  UiCandidateModelSchema,
  type UiCandidateModel,
  type UiReviewerReport,
} from '../../../shared/ui-model.js'

export interface UiCandidateMetadata {
  generatedAt: number
  sourceLabel: string
}

type UiConfidence = UiCandidateModel['dimensions'][number]['confidence']

function confidenceLabel(confidence: number): UiConfidence {
  if (confidence >= 0.75) {
    return 'high'
  }
  if (confidence >= 0.45) {
    return 'medium'
  }
  return 'unknown'
}

function confidenceBand(confidence: number): '高' | '中' | '低/未知' {
  if (confidence >= 0.75) {
    return '高'
  }
  if (confidence >= 0.45) {
    return '中'
  }
  return '低/未知'
}

function sentenceJoin(parts: string[]): string {
  const sentences = parts
    .map((part) => part.trim().replace(/[。；;]+$/u, ''))
    .filter(Boolean)
  return sentences.length === 0 ? '' : `${sentences.join('。')}。`
}

function deterministicSummary(model: CandidateModel): string {
  return sentenceJoin([
    ...model.hiring_manager_summary.claims.map((claim) => claim.claim),
    ...model.hiring_manager_summary.seniority_claims.map((claim) => claim.claim),
  ])
}

function roleVerdict(
  naturalFit: number,
  readiness: number,
): UiCandidateModel['roles'][number]['verdict'] {
  if (naturalFit >= 0.75 && readiness >= 0.45) {
    return 'great'
  }
  if (naturalFit >= 0.45) {
    return 'depends'
  }
  return 'avoid'
}

function episodeNarrative(
  episode: CandidateModel['high_signal_episodes'][number],
): string {
  return [
    episode.context,
    episode.trigger ? `触发：${episode.trigger}` : '',
    episode.assistant_or_external_proposal
      ? `外部提议：${episode.assistant_or_external_proposal}`
      : '',
    `用户判断/纠错：${episode.user_action}`,
    episode.protected_standard
      ? `保护的内部标准：${episode.protected_standard}`
      : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function claimTexts(
  claims: Array<{ claim: string }>,
): string[] {
  return claims.map((item) => item.claim).filter(Boolean)
}

function composeWhyThisNotThat(model: CandidateModel): string {
  const winnerId = model.archetype_competition_winner
  const winner = model.archetype_competition.find(
    (candidate) => candidate.id === winnerId,
  )
  const rivals = model.archetype_competition.filter(
    (candidate) => candidate.id !== winnerId,
  )
  if (winner === undefined || rivals.length === 0) {
    return model.working_archetype.definition
  }
  const rivalLines = rivals.map((rival) => {
    const fails = claimTexts(rival.fails_to_explain)
    return fails.length > 0
      ? `${rival.name}不够：${fails.join('；')}`
      : `${rival.name}的解释力较弱。`
  })
  return `${model.working_archetype.definition} 这比「${rivals[0]?.name}」更准确。${rivalLines.join(' ')}`
}

function composeReviewerReport(model: CandidateModel): UiReviewerReport {
  const episodesById = new Map(
    model.high_signal_episodes.map((episode) => [episode.episode_id, episode]),
  )
  const capabilitiesById = new Map(
    model.capabilities.map((capability) => [capability.id, capability]),
  )
  const loopSteps = model.core_loop
    .map((step) => step.claim.trim())
    .filter(Boolean)
  const winner =
    model.archetype_competition_winner === null
      ? undefined
      : model.archetype_competition.find(
          (candidate) => candidate.id === model.archetype_competition_winner,
        )
  const underResolved =
    model.archetype_competition_winner === null || winner?.type === 'null'
  const summary = underResolved
    ? '现有证据不足以支持稳定、可区分的候选人模型；保留为未解决。'
    : deterministicSummary(model)

  return {
    nameEn: model.working_archetype.name_en,
    definition: model.working_archetype.definition,
    whyThisNotThat: composeWhyThisNotThat(model),
    coreLoopNarrative: loopSteps.join(' → '),
    whyDifferent: model.why_different.claim,
    explanatoryConfidenceLabel: `系统判断置信度：${confidenceBand(
      model.working_archetype.explanatory_confidence,
    )}`,
    outcomeConfidenceLabel: `真实交付结果置信度：${confidenceBand(
      model.working_archetype.outcome_validation_confidence,
    )}`,
    episodes: model.high_signal_episodes.map((episode) => ({
      title: episode.context,
      narrative: episodeNarrative(episode),
      quote: episode.verbatim_user_quote,
      source: episode.source_message_ids.join(', '),
      protectedStandard: episode.protected_standard,
    })),
    mechanisms: model.mechanisms.map((mechanism) => ({
      name: mechanism.name,
      description: mechanism.description,
      contexts: mechanism.contexts,
      confirmed: claimTexts(mechanism.confirmed_predictions),
      missing: claimTexts(mechanism.missing_predictions),
      confidence: confidenceLabel(mechanism.confidence),
    })),
    capabilities: model.capabilities.map((capability) => ({
      name: capability.name,
      emergentLogic: capability.emergent_logic,
      episodeTitles: capability.supporting_episode_ids.flatMap((episodeId) => {
        const episode = episodesById.get(episodeId)
        return episode ? [episode.context] : []
      }),
    })),
    competingArchetypes: model.archetype_competition.map((candidate) => ({
      name: candidate.name,
      type: candidate.type,
      explains: claimTexts(candidate.explains),
      failsToExplain: claimTexts(candidate.fails_to_explain),
      isWinner: candidate.id === model.archetype_competition_winner,
    })),
    counterargument: {
      argument: model.strongest_counterargument.argument,
      whatItExplains: model.strongest_counterargument.what_it_explains,
      whatItFailsToExplain:
        model.strongest_counterargument.what_it_fails_to_explain,
      whyItDoesOrDoesNotWin:
        model.strongest_counterargument.why_it_does_or_does_not_win,
    },
    strengthRisks: model.strength_risk_pairs.map((pair) => ({
      strength: capabilitiesById.get(pair.capability_id)?.name ?? pair.capability_id,
      risk: pair.risk_claim,
    })),
    hiringManagerSummary: summary,
  }
}

export function toUiCandidateModel(
  canonical: CandidateModel,
  metadata: UiCandidateMetadata,
): UiCandidateModel {
  const episodesById = new Map(
    canonical.high_signal_episodes.map((episode) => [
      episode.episode_id,
      episode,
    ]),
  )
  const dimensions = canonical.core_loop.map((claim) => ({
    label: claim.claim,
    confidence: confidenceLabel(claim.confidence),
    detail:
      claim.evidence_status === 'unknown' ||
      claim.evidence_status === 'missing'
        ? '当前证据不足，保持未知。'
        : '属于反复出现的工作循环步骤。',
  }))
  const cannotProve = canonical.evidence_boundaries
    .filter(
      (boundary) =>
        boundary.evidence_status === 'unknown' ||
        boundary.evidence_status === 'missing',
    )
    .map((boundary) => boundary.claim)
  const winner =
    canonical.archetype_competition_winner === null
      ? undefined
      : canonical.archetype_competition.find(
          (candidate) =>
            candidate.id === canonical.archetype_competition_winner,
        )
  const underResolved =
    canonical.archetype_competition_winner === null || winner?.type === 'null'

  const result: UiCandidateModel = {
    generatedAt: metadata.generatedAt,
    headline: underResolved
      ? '尚未形成可验证的工作原型'
      : canonical.working_archetype.name_cn,
    thesis: underResolved
      ? '现有证据不足以支持稳定、可区分的候选人模型；保留为未解决。'
      : deterministicSummary(canonical),
    dimensionCount: dimensions.length,
    sourceLabel: metadata.sourceLabel,
    unknownCount:
      dimensions.filter((dimension) => dimension.confidence === 'unknown')
        .length + cannotProve.length,
    dimensions,
    cannotProve,
    capabilities: canonical.capabilities.map((capability) => ({
      title: capability.name,
      strength:
        capability.confidence >= 0.75
          ? 'strong'
          : capability.confidence >= 0.45
            ? 'repeated'
            : 'early',
      detail: capability.emergent_logic,
      evidence: capability.supporting_episode_ids.flatMap((episodeId) => {
        const episode = episodesById.get(episodeId)
        return episode
          ? [
              {
                narrative: episodeNarrative(episode),
                quote: episode.verbatim_user_quote,
                source: episode.source_message_ids.join(', '),
              },
            ]
          : []
      }),
    })),
    strengths: canonical.hiring_manager_summary.claims
      .filter((claim) => claim.claim_polarity === 'positive')
      .map((claim) => claim.claim),
    risks: canonical.strength_risk_pairs.map((pair) => pair.risk_claim),
    riskNote:
      canonical.strength_risk_pairs.length > 0
        ? '风险是已观察优势在特定情境下的反面，不应被解释为独立弱点。'
        : '当前没有足够证据形成强度—风险判断。',
    roles: canonical.role_fit.map((role) => {
      const boundaryParts: string[] = []
      if (role.readiness < 0.45) {
        boundaryParts.push('尚未证明可立即胜任')
      }
      if (role.seniority_evidence.status === 'unknown') {
        boundaryParts.push('无法证明职级')
      } else if (role.seniority_evidence.level) {
        boundaryParts.push(
          `职级证据：${role.seniority_evidence.level}（${role.seniority_evidence.status}）`,
        )
      }
      return {
        role: role.role_family,
        verdict: roleVerdict(role.natural_fit, role.readiness),
        reason: role.reason,
        boundary:
          boundaryParts.length > 0 ? boundaryParts.join('；') : '未发现额外边界。',
      }
    }),
    nextQuestions: cannotProve.map(
      (claim) => `请提供可验证“${claim}”的新增证据。`,
    ),
    reviewerReport: composeReviewerReport(canonical),
  }

  return UiCandidateModelSchema.parse(result)
}
