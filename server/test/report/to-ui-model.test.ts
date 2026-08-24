import { describe, expect, it } from 'vitest'

import type { CandidateModel } from '../../../shared/profile-schemas.js'
import { toUiCandidateModel } from '../../src/report/to-ui-model.js'

const supportedClaim = (claim: string, confidence = 0.8) => ({
  claim,
  evidence_status: 'observed' as const,
  claim_polarity: 'positive' as const,
  confidence,
  supporting_evidence_ids: ['e1'],
})

function canonicalModel(): CandidateModel {
  return {
    working_archetype: {
      name_cn: '目标守恒型构建者',
      name_en: 'Goal-Invariant Builder',
      definition: '持续恢复目标并把约束转成可执行系统',
      explanatory_confidence: 0.8,
      outcome_validation_confidence: 0.5,
      evidence_status: 'inferred',
      claim_polarity: 'positive',
      supporting_evidence_ids: ['e1'],
    },
    core_loop: [
      supportedClaim('发现目标偏移', 0.8),
      supportedClaim('重构执行路径', 0.5),
      {
        claim: '跨团队扩展能力',
        evidence_status: 'unknown',
        claim_polarity: 'neutral',
        confidence: 0.2,
        supporting_evidence_ids: [],
      },
    ],
    why_different: supportedClaim('以目标一致性而非表面完成度收敛'),
    high_signal_episodes: [
      {
        episode_id: 'e1',
        context: '方案偏离原目标',
        trigger: '助手给出局部修补方案',
        assistant_or_external_proposal: '增加更多步骤',
        user_action: '这会偏离目标，改为删除无关步骤',
        verbatim_user_quote: '改为删除无关步骤',
        behavior_types: ['correction'],
        protected_standard: 'goal fidelity',
        protected_standard_alternatives: [],
        has_protected_standard_conflict: false,
        alternative_explanations: ['domain familiarity'],
        agency: {
          user_authorship: 1,
          user_judgment: 0.9,
          user_correction: 0.9,
          user_reframing: 0.8,
          ai_authorship: 0,
          third_party_authorship: 0,
        },
        signal_strength: 0.9,
        source_message_ids: ['m1', 'm2'],
      },
    ],
    mechanisms: [
      {
        id: 'mech1',
        name: '目标守恒',
        description: '发现偏移并恢复目标',
        supporting_episode_ids: ['e1'],
        contexts: ['产品'],
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
        id: 'cap1',
        name: '约束驱动收敛',
        mechanism_ids: ['mech1'],
        supporting_episode_ids: ['e1'],
        emergent_logic: '在约束下恢复目标并推动行动',
        evidence_status: 'observed',
        claim_polarity: 'positive',
        confidence: 0.8,
      },
    ],
    archetype_competition_winner: 'higher',
    archetype_competition: [
      {
        id: 'higher',
        name: '目标守恒型构建者',
        type: 'higher_order',
        explains: [supportedClaim('跨情境恢复目标')],
        fails_to_explain: [],
        unsupported_assumptions: [],
        cross_context_generalization: 0.8,
        discriminative_power: 0.8,
      },
    ],
    strongest_counterargument: {
      argument: '可能只是领域熟悉',
      what_it_explains: '快速纠错',
      what_it_fails_to_explain: '跨情境复现',
      why_it_does_or_does_not_win: '覆盖不足',
      evidence_status: 'inferred',
      claim_polarity: 'neutral',
      confidence: 0.5,
      supporting_evidence_ids: ['e1'],
    },
    strength_risk_pairs: [
      {
        capability_id: 'cap1',
        risk_claim: '可能过早排除探索性方案',
        evidence_status_ceiling: 'inferred',
        evidence_status: 'inferred',
        claim_polarity: 'risk',
        confidence: 0.5,
        supporting_evidence_ids: ['e1'],
      },
    ],
    role_fit: [
      {
        id: 'role1',
        role_family: '产品系统设计',
        natural_fit: 0.8,
        readiness: 0.6,
        reason: '机制与角色工作相符',
        evidence_status: 'inferred',
        claim_polarity: 'positive',
        confidence: 0.7,
        supporting_evidence_ids: ['e1'],
        seniority_evidence: {
          status: 'unknown',
          level: null,
          supporting_evidence_ids: [],
        },
      },
    ],
    evidence_boundaries: [
      {
        claim: '无法证明真实组织中的持续结果',
        evidence_status: 'unknown',
        claim_polarity: 'neutral',
        confidence: 0.2,
        supporting_evidence_ids: [],
      },
    ],
    hiring_manager_summary: {
      claims: [
        supportedClaim('候选人反复恢复目标一致性'),
        supportedClaim('候选人把约束转化为行动'),
      ],
      seniority_claims: [],
    },
  }
}

describe('toUiCandidateModel', () => {
  it('maps confidence thresholds, counts, roles and traceable evidence', () => {
    const canonical = canonicalModel()
    const ui = toUiCandidateModel(canonical, {
      generatedAt: 123,
      sourceLabel: '3 conversations',
    })

    expect(ui.dimensions.map((dimension) => dimension.confidence)).toEqual([
      'high',
      'medium',
      'unknown',
    ])
    expect(ui.dimensionCount).toBe(3)
    expect(ui.unknownCount).toBe(2)
    expect(ui.roles[0]).toMatchObject({
      role: '产品系统设计',
      verdict: 'great',
      boundary: expect.stringContaining('无法证明职级'),
    })
    expect(ui.capabilities[0].evidence[0]).toMatchObject({
      narrative: expect.stringContaining('这会偏离目标，改为删除无关步骤'),
      quote: '改为删除无关步骤',
      source: 'm1, m2',
    })
  })

  it('composes a 14-section reviewer report from canonical fields', () => {
    const ui = toUiCandidateModel(canonicalModel(), {
      generatedAt: 123,
      sourceLabel: '3 conversations',
    })
    const report = ui.reviewerReport

    expect(report.coreLoopNarrative).toContain('发现目标偏移')
    expect(report.coreLoopNarrative).toContain('→')
    expect(report.whyDifferent).toContain('以目标一致性而非表面完成度收敛')
    expect(report.explanatoryConfidenceLabel).toContain('高')
    expect(report.outcomeConfidenceLabel).toContain('中')
    expect(report.episodes[0]).toMatchObject({
      title: '方案偏离原目标',
      quote: '改为删除无关步骤',
      protectedStandard: 'goal fidelity',
    })
    expect(report.episodes[0].narrative).toContain('用户判断/纠错')
    expect(report.mechanisms[0]).toMatchObject({
      name: '目标守恒',
      description: '发现偏移并恢复目标',
    })
    expect(report.competingArchetypes.some((item) => item.isWinner)).toBe(true)
    expect(report.counterargument.argument).toContain('可能只是领域熟悉')
    expect(report.strengthRisks[0]).toEqual({
      strength: '约束驱动收敛',
      risk: '可能过早排除探索性方案',
    })
    expect(report.hiringManagerSummary).toContain('候选人反复恢复目标一致性')
  })

  it('uses the episode chain when no exact user quote exists, without inventing a quotation', () => {
    const canonical = canonicalModel()
    canonical.high_signal_episodes[0].verbatim_user_quote = null

    const ui = toUiCandidateModel(canonical, {
      generatedAt: 123,
      sourceLabel: 'source',
    })

    expect(ui.capabilities[0].evidence[0]).toMatchObject({
      narrative: expect.stringContaining('这会偏离目标，改为删除无关步骤'),
      quote: null,
      source: 'm1, m2',
    })
    expect(ui.reviewerReport.episodes[0].quote).toBeNull()
  })

  it('turns unknown boundaries into cannot-prove content and summary claims into deterministic prose', () => {
    const ui = toUiCandidateModel(canonicalModel(), {
      generatedAt: 123,
      sourceLabel: 'source',
    })

    expect(ui.cannotProve).toContain('无法证明真实组织中的持续结果')
    expect(ui.thesis).toBe(
      '候选人反复恢复目标一致性。候选人把约束转化为行动。',
    )
    expect(ui.nextQuestions).toContain(
      '请提供可验证“无法证明真实组织中的持续结果”的新增证据。',
    )
  })

  it('includes structured seniority claims in deterministic summary prose', () => {
    const canonical = canonicalModel()
    canonical.role_fit[0].seniority_evidence = {
      status: 'observed',
      level: 'Senior',
      supporting_evidence_ids: ['e1'],
    }
    canonical.hiring_manager_summary.seniority_claims = [
      {
        claim: '已有 Senior 层级的独立证据',
        role_fit_id: 'role1',
        level: 'Senior',
        evidence_status: 'observed',
        claim_polarity: 'positive',
        confidence: 0.8,
        supporting_evidence_ids: ['e1'],
      },
    ]

    const ui = toUiCandidateModel(canonical, {
      generatedAt: 123,
      sourceLabel: 'source',
    })

    expect(ui.thesis).toBe(
      '候选人反复恢复目标一致性。候选人把约束转化为行动。已有 Senior 层级的独立证据。',
    )
  })

  it('renders under-resolved models conservatively without mutating canonical input', () => {
    const canonical = canonicalModel()
    canonical.archetype_competition_winner = null
    canonical.working_archetype.explanatory_confidence = 0.3
    canonical.working_archetype.outcome_validation_confidence = 0.2
    const before = structuredClone(canonical)

    const ui = toUiCandidateModel(canonical, {
      generatedAt: 123,
      sourceLabel: 'source',
    })

    expect(ui.headline).toBe('尚未形成可验证的工作原型')
    expect(ui.thesis).toContain('证据不足')
    expect(ui.thesis).not.toContain('候选人反复')
    expect(canonical).toEqual(before)
  })
})
