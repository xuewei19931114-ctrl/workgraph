import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_CORE_INFERENCE_PROMPT_VERSION,
  buildCoreInferencePrompt,
  resolveCoreInferencePromptVersion,
} from '../../src/prompts/core-inference.js'
import { buildCriticPrompt } from '../../src/prompts/critic.js'
import { buildEvidenceExtractorPrompt } from '../../src/prompts/evidence-extractor.js'

describe('runtime reviewer prompts', () => {
  it('keeps reviewer-brain-core-v1.1.0 as a selectable prompt', () => {
    const prompt = buildCoreInferencePrompt(
      undefined,
      'reviewer-brain-core-v1.1.0',
    )

    expect(prompt).toContain('Optimization target: DISCRIMINATIVE POWER.')
    expect(prompt).toContain(
      'Follow this public, implementation-oriented reasoning sequence:',
    )
    expect(prompt).not.toContain('I. EPISTEMIC HIERARCHY')
  })

  it('adds reviewer-brain-core-v1.2.0 as the default core prompt', () => {
    expect(DEFAULT_CORE_INFERENCE_PROMPT_VERSION).toBe(
      'reviewer-brain-core-v1.2.0',
    )
    expect(resolveCoreInferencePromptVersion({})).toBe(
      'reviewer-brain-core-v1.2.0',
    )
    expect(
      resolveCoreInferencePromptVersion({
        CORE_INFERENCE_PROMPT_VERSION: 'reviewer-brain-core-v1.1.0',
      }),
    ).toBe('reviewer-brain-core-v1.1.0')

    const prompt = buildCoreInferencePrompt()

    expect(prompt).toContain('I. EPISTEMIC HIERARCHY')
    expect(prompt).toContain('STAGE 1 — Evidence Mining')
    expect(prompt).toContain('VI. ANTI-HALLUCINATION RULES')
    expect(prompt).toContain('XI. HARD INVARIANTS')
    expect(prompt).toContain('XII. FINAL QUALITY TEST')
    expect(prompt).toContain(
      'Could the candidate simply be unusually good at prompting AI',
    )
  })

  it('requires essay-density Chinese report fields inside the JSON', () => {
    const prompt = buildCoreInferencePrompt()

    expect(prompt).toMatch(/Narrative density/i)
    expect(prompt).toContain('# Working Archetype')
    expect(prompt).toContain('# Highest-Signal Episodes')
    expect(prompt).toContain('# Competing Archetypes')
    expect(prompt).toContain('# Strongest Counterargument')
    expect(prompt).toContain('multi-sentence')
    expect(prompt).toContain(
      'hiring_manager_summary MUST contain structured claims only',
    )
  })

  it('carries an explicit appendix for runtime-enforced refinements', () => {
    const prompt = buildCoreInferencePrompt()

    expect(prompt).toContain('Policy appendix (runtime-enforced refinements)')
    expect(prompt).toContain(
      'Unknown or missing claims MUST use claim_polarity "neutral"',
    )
    expect(prompt).toContain('confidence MUST be <= 0.4')
    expect(prompt).toContain(
      'Supported claims MUST contain at least one supporting evidence ID',
    )
    expect(prompt).toContain(
      'Every evidence ID MUST reference a valid transcript message or Episode',
    )
    expect(prompt).toContain(
      'Copy source_message_ids character-for-character from the supplied transcript',
    )
    expect(prompt).toContain('Transcript message, Episode, mechanism, capability')
    expect(prompt).toContain(
      'archetype_competition_winner MUST reference a listed competition ID',
    )
    expect(prompt).toContain(
      'both working-archetype confidence values MUST be <= 0.4',
    )
    expect(prompt).toContain(
      'Seniority summary claims MUST bind exactly to the referenced role fit',
    )
    expect(prompt).toContain(
      'hiring_manager_summary MUST contain structured claims only',
    )
  })

  it('contains all current Episode schema field names', () => {
    const prompts = [
      buildCoreInferencePrompt(),
      buildEvidenceExtractorPrompt(),
    ]

    for (const field of [
      'verbatim_user_quote',
      'protected_standard',
      'protected_standard_alternatives',
      'has_protected_standard_conflict',
    ]) {
      expect(prompts.every((prompt) => prompt.includes(`"${field}"`))).toBe(true)
    }
  })

  it('requires exact user quotes or null and prohibits final inference', () => {
    const prompt = buildEvidenceExtractorPrompt()

    expect(prompt).toContain('exact character-for-character copy')
    expect(prompt).toContain('verbatim_user_quote')
    expect(prompt).toContain('use null')
    expect(prompt).toMatch(/Do not infer a final archetype/i)
    expect(prompt).toMatch(/Do not infer[^.]*role/i)
  })

  it('requires exact quote provenance in the direct core path', () => {
    const prompt = buildCoreInferencePrompt()

    expect(prompt).toContain(
      'verbatim_user_quote MUST be an exact character-for-character substring',
    )
    expect(prompt).toContain('referenced source message whose role is "user"')
    expect(prompt).toContain(
      'If no such exact user-role source text exists, verbatim_user_quote MUST be null',
    )
  })

  it('states the complete seniority evidence contract', () => {
    const prompt = buildCoreInferencePrompt()

    expect(prompt).toContain(
      'Observed or inferred seniority MUST use a non-null level and at least one supporting evidence ID',
    )
    expect(prompt).toContain(
      'Unknown seniority MUST use level null',
    )
  })

  it('keeps the critic to material issues and its exact output contract', () => {
    const prompt = buildCriticPrompt()

    expect(prompt).toContain('Do not regenerate')
    expect(prompt).toContain('only material issues')
    expect(prompt).toContain('"verdict": "pass | revise | unresolved"')
    expect(prompt).toContain('"code": "stable_machine_readable_code"')
    expect(prompt).toContain('"path": "candidate_model.path"')
    expect(prompt).toContain('"evidence_ids": ["exact message or Episode ID"]')
    expect(prompt).toContain('no additional keys')
  })

  it('has no runtime distillation module or prompt reference', () => {
    const runtimeDirectory = fileURLToPath(
      new URL('../../src/', import.meta.url),
    )
    const runtimeModuleNames = readdirSync(runtimeDirectory, {
      recursive: true,
      encoding: 'utf8',
    })
    const runtimeSource = runtimeModuleNames
      .filter((path) => path.endsWith('.ts'))
      .map((path) => readFileSync(join(runtimeDirectory, path), 'utf8'))
      .join('\n')
    const allPromptText = [
      buildCoreInferencePrompt(),
      buildEvidenceExtractorPrompt(),
      buildCriticPrompt(),
    ].join('\n')

    expect(runtimeModuleNames.join('\n')).not.toMatch(/distill/i)
    expect(runtimeSource).not.toMatch(/distill/i)
    expect(allPromptText).not.toMatch(/distill/i)
  })
})
