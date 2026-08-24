import { describe, expect, it } from 'vitest'

import { buildCareerAgentPrompt } from '../../src/prompts/career-agent.js'

describe('career agent prompt', () => {
  it('asks for Chinese coaching and includes the profile headline', () => {
    const prompt = buildCareerAgentPrompt({
      headline: '约束驱动的AI产品系统收敛者',
      sourceLabel: 'merged-local-archives',
      thesis: '先把约束说清楚再收敛方案。',
    })

    expect(prompt).toMatch(/简体中文/)
    expect(prompt).toContain('约束驱动的AI产品系统收敛者')
    expect(prompt).toContain('merged-local-archives')
    expect(prompt).toMatch(/追问/)
  })

  it('says evidence is thin when no profile is present', () => {
    const prompt = buildCareerAgentPrompt(null)
    expect(prompt).toMatch(/没有画像|依据不足/)
  })
})
