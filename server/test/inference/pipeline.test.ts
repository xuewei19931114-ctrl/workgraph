import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  CandidateModelSchema,
  TranscriptSchema,
  type CandidateModel,
  type Episode,
  type Transcript,
} from '../../../shared/profile-schemas.js'
import {
  createRepository,
  type JobStatus,
} from '../../src/db/repository.js'
import type { StructuredCall } from '../../src/provider/types.js'
import {
  runProfileInference,
  type PipelineDependencies,
} from '../../src/inference/pipeline.js'

const competitionTypes = [
  'narrow',
  'higher_order',
  'domain',
  'operating_style',
  'null',
] as const

function transcript(authorship: 'user' | 'mixed' = 'user'): Transcript {
  return TranscriptSchema.parse({
    candidate_id: 'candidate-1',
    source_type: 'chat-export',
    conversations: Array.from({ length: 3 }, (_, index) => ({
      conversation_id: `conversation-${index + 1}`,
      title: `Architecture ${index + 1}`,
      messages: [
        {
          message_id: `message-${index + 1}`,
          role: 'user',
          content: `Keep ownership explicit in domain ${index + 1}. ${'x'.repeat(120)}`,
          timestamp: null,
          authorship,
        },
      ],
    })),
  })
}

function conservativeModel(
  overrides: Partial<CandidateModel> = {},
): CandidateModel {
  return CandidateModelSchema.parse({
    working_archetype: {
      name_cn: '待验证',
      name_en: 'Unresolved',
      definition: 'Insufficient evidence.',
      explanatory_confidence: 0.2,
      outcome_validation_confidence: 0.2,
      evidence_status: 'unknown',
      claim_polarity: 'neutral',
      supporting_evidence_ids: [],
    },
    core_loop: [],
    why_different: {
      claim: 'Insufficient evidence.',
      evidence_status: 'unknown',
      claim_polarity: 'neutral',
      confidence: 0.2,
      supporting_evidence_ids: [],
    },
    high_signal_episodes: [],
    mechanisms: [],
    capabilities: [],
    archetype_competition_winner: null,
    archetype_competition: competitionTypes.map((type) => ({
      id: `competition-${type}`,
      name: `${type} candidate`,
      type,
      explains: [],
      fails_to_explain: [],
      unsupported_assumptions: [],
      cross_context_generalization: 0.2,
      discriminative_power: 0.2,
    })),
    strongest_counterargument: {
      argument: 'Insufficient evidence.',
      what_it_explains: '',
      what_it_fails_to_explain: '',
      why_it_does_or_does_not_win: '',
      evidence_status: 'unknown',
      claim_polarity: 'neutral',
      confidence: 0.2,
      supporting_evidence_ids: [],
    },
    strength_risk_pairs: [],
    role_fit: [],
    evidence_boundaries: [],
    hiring_manager_summary: {
      claims: [
        {
          claim: 'More evidence is required.',
          evidence_status: 'unknown',
          claim_polarity: 'neutral',
          confidence: 0.2,
          supporting_evidence_ids: [],
        },
      ],
      seniority_claims: [],
    },
    ...overrides,
  })
}

function episode(id: number): Episode {
  return {
    episode_id: `episode-${id}`,
    context: 'Architecture review',
    trigger: 'Ownership proposal',
    assistant_or_external_proposal: 'Put ownership in transport.',
    user_action: 'Kept ownership in the domain.',
    verbatim_user_quote: null,
    behavior_types: ['correction'],
    protected_standard: 'Explicit ownership',
    protected_standard_alternatives: [],
    has_protected_standard_conflict: false,
    alternative_explanations: [],
    agency: {
      user_authorship: 1,
      user_judgment: 0.9,
      user_correction: 0.9,
      user_reframing: 0,
      ai_authorship: 0,
      third_party_authorship: 0,
    },
    signal_strength: 0.8,
    source_message_ids: [`message-${id}`],
  }
}

type AnyCall = StructuredCall<unknown>

function completed<T>(value: T) {
  return {
    state: 'completed' as const,
    value,
    repaired: false,
    providerRequestId: null,
    providerResponseId: null,
    usage: { inputTokens: null, outputTokens: null, reasoningTokens: null },
  }
}

class FakeProvider {
  readonly calls: Array<{ request: AnyCall; signal: AbortSignal }> = []

  constructor(
    private readonly respond: (
      request: AnyCall,
      signal: AbortSignal,
      callIndex: number,
    ) => Promise<unknown> | unknown,
  ) {}

  async callStructured<T>(request: StructuredCall<T>, signal: AbortSignal) {
    const callIndex = this.calls.length
    this.calls.push({ request: request as AnyCall, signal })
    return (await this.respond(
      request as AnyCall,
      signal,
      callIndex,
    )) as Awaited<ReturnType<PipelineDependencies['provider']['callStructured']>>
  }

  callsByStage(stage: AnyCall['stage']) {
    return this.calls.filter(({ request }) => request.stage === stage)
  }
}

class FakeRepository {
  readonly states: JobStatus[] = []
  readonly saves: Array<Record<string, unknown>> = []
  readonly updates: Array<{
    status: JobStatus
    details?: {
      criticVerdict?: 'pass' | 'revise' | 'unresolved'
      errorCode?: string | null
      errorMessage?: string | null
    }
  }> = []

  updateJobStatus(
    _jobId: string,
    status: JobStatus,
    details?: {
      criticVerdict?: 'pass' | 'revise' | 'unresolved'
      errorCode?: string | null
      errorMessage?: string | null
    },
  ) {
    this.states.push(status)
    this.updates.push({ status, details })
  }

  saveModel(input: Record<string, unknown>) {
    this.saves.push(input)
  }
}

function dependencies(
  provider: FakeProvider,
  repository = new FakeRepository(),
  evidence = false,
): PipelineDependencies {
  return {
    provider,
    repository,
    context: {
      maxEstimatedTokens: evidence ? 180 : 10_000,
      fixedPromptAndSchemaReserve: 0,
      extractorConcurrency: 2,
    },
    now: () => new Date('2026-08-21T08:00:00.000Z'),
  }
}

function input(signal = new AbortController().signal, enableCritic = false) {
  return {
    jobId: 'job-1',
    candidateId: 'candidate-1',
    transcript: transcript(),
    enableCritic,
    signal,
  }
}

describe('runProfileInference', () => {
  it('uses exactly one Core call on the direct default path', async () => {
    const model = conservativeModel()
    const fake = new FakeProvider((request) => {
      expect(request.instructions).toContain('reviewer-brain-core-v1.1.0')
      return completed(model)
    })
    const repository = new FakeRepository()

    const result = await runProfileInference(
      input(),
      dependencies(fake, repository),
    )

    expect(result.status).toBe('completed')
    expect(fake.callsByStage('core')).toHaveLength(1)
    expect(fake.callsByStage('extractor')).toHaveLength(0)
    expect(fake.callsByStage('critic')).toHaveLength(0)
    expect(repository.states).toEqual(['parsing', 'inferring', 'validating'])
    expect(repository.saves).toHaveLength(1)
    expect(repository.saves[0]).toMatchObject({ status: 'completed' })
  })

  it('emits a stage log for parse, core, skipped critic, invariants, and UI', async () => {
    const lines: string[] = []
    const fake = new FakeProvider(() => completed(conservativeModel()))
    const result = await runProfileInference(input(), {
      ...dependencies(fake),
      log: (line) => lines.push(line),
    })

    expect(result.status).toBe('completed')
    expect(lines.some((line) => line.includes('00_parse'))).toBe(true)
    expect(lines.some((line) => line.includes('uploaded_transcript'))).toBe(
      true,
    )
    expect(lines.some((line) => line.includes('extractor skipped'))).toBe(true)
    expect(
      lines.some((line) =>
        line.includes('prompt=reviewer-brain-core-v1.1.0'),
      ),
    ).toBe(true)
    expect(lines.some((line) => line.includes('critic skipped'))).toBe(true)
    expect(lines.some((line) => line.includes('06_invariants'))).toBe(true)
    expect(lines.some((line) => line.includes('07_ui'))).toBe(true)
    expect(lines.some((line) => line.includes('done status=completed'))).toBe(
      true,
    )
  })

  it('bounds Extractors, merges Episodes, then makes exactly one Core call', async () => {
    let active = 0
    let maximumActive = 0
    const fake = new FakeProvider(async (request, signal, callIndex) => {
      if (request.stage === 'extractor') {
        expect(request.instructions).toContain('reviewer-brain-evidence-v1.0.0')
        active += 1
        maximumActive = Math.max(maximumActive, active)
        await new Promise<void>((resolve, reject) => {
          const timer = setTimeout(resolve, 5)
          signal.addEventListener(
            'abort',
            () => {
              clearTimeout(timer)
              reject(signal.reason)
            },
            { once: true },
          )
        })
        active -= 1
        return completed([episode(callIndex + 1)])
      }
      const parsedInput = JSON.parse(request.input) as Record<string, unknown>
      expect(parsedInput).toHaveProperty('episodes')
      expect(parsedInput).not.toHaveProperty('transcript')
      return completed(conservativeModel())
    })
    const repository = new FakeRepository()

    const result = await runProfileInference(
      input(),
      dependencies(fake, repository, true),
    )

    expect(result.status).toBe('completed')
    expect(fake.callsByStage('extractor')).toHaveLength(3)
    expect(maximumActive).toBe(2)
    expect(fake.callsByStage('core')).toHaveLength(1)
    expect(repository.states).toEqual([
      'parsing',
      'extracting',
      'inferring',
      'validating',
    ])
  })

  it('aborts active sibling Extractors, leaves queued work unstarted, and stops later stages', async () => {
    const caller = new AbortController()
    const activeSignals: AbortSignal[] = []
    let notifyStarted!: () => void
    const twoStarted = new Promise<void>((resolve) => {
      notifyStarted = resolve
    })
    const fake = new FakeProvider((request, signal) => {
      expect(request.stage).toBe('extractor')
      activeSignals.push(signal)
      if (activeSignals.length === 2) notifyStarted()
      return new Promise((resolve) => {
        signal.addEventListener(
          'abort',
          () =>
            resolve({
              state: 'cancelled',
              error: { code: 'cancelled', message: 'cancelled' },
              providerRequestId: null,
              providerResponseId: null,
              usage: {
                inputTokens: null,
                outputTokens: null,
                reasoningTokens: null,
              },
            }),
          { once: true },
        )
      })
    })
    const repository = new FakeRepository()
    const running = runProfileInference(
      input(caller.signal),
      dependencies(fake, repository, true),
    )

    await twoStarted
    caller.abort(new Error('caller cancelled'))
    const result = await running

    expect(result.status).toBe('cancelled')
    expect(activeSignals).toHaveLength(2)
    expect(activeSignals.every((signal) => signal.aborted)).toBe(true)
    expect(fake.callsByStage('core')).toHaveLength(0)
    expect(fake.callsByStage('critic')).toHaveLength(0)
    expect(repository.states.at(-1)).toBe('cancelled')
    expect(repository.saves).toHaveLength(0)
  })

  it('settles and aborts siblings after the first Extractor failure without an unhandled rejection', async () => {
    const activeSignals: AbortSignal[] = []
    const settled: string[] = []
    const unhandled: unknown[] = []
    const onUnhandled = (reason: unknown) => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    const fake = new FakeProvider((request, signal, callIndex) => {
      expect(request.stage).toBe('extractor')
      activeSignals.push(signal)
      if (callIndex === 0) {
        return Promise.resolve({
          state: 'failed',
          error: { code: 'network_error', message: 'network failed' },
          providerRequestId: null,
          providerResponseId: null,
          usage: {
            inputTokens: null,
            outputTokens: null,
            reasoningTokens: null,
          },
        }).finally(() => settled.push('failed'))
      }
      return new Promise((resolve) => {
        signal.addEventListener(
          'abort',
          () => {
            settled.push('aborted-sibling')
            resolve({
              state: 'cancelled',
              error: { code: 'cancelled', message: 'cancelled' },
              providerRequestId: null,
              providerResponseId: null,
              usage: {
                inputTokens: null,
                outputTokens: null,
                reasoningTokens: null,
              },
            })
          },
          { once: true },
        )
      })
    })
    const repository = new FakeRepository()

    try {
      const result = await runProfileInference(
        input(),
        dependencies(fake, repository, true),
      )
      await new Promise<void>((resolve) => setImmediate(resolve))

      expect(result.status).toBe('failed')
      expect(activeSignals).toHaveLength(2)
      expect(activeSignals[1]?.aborted).toBe(true)
      expect(settled).toEqual(
        expect.arrayContaining(['failed', 'aborted-sibling']),
      )
      expect(fake.callsByStage('core')).toHaveLength(0)
      expect(fake.callsByStage('extractor')).toHaveLength(2)
      expect(unhandled).toEqual([])
      expect(repository.updates.at(-1)?.details?.errorCode).toBe(
        'PROVIDER_NETWORK_ERROR',
      )
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it.each([
    ['pass', 'completed'],
    ['revise', 'unresolved'],
    ['unresolved', 'unresolved'],
  ] as const)('calls Critic once for %s without rerunning Core', async (verdict, status) => {
    const fake = new FakeProvider((request) =>
      request.stage === 'core'
        ? completed(conservativeModel())
        : completed({
            verdict,
            issues:
              verdict === 'pass'
                ? []
                : [
                    {
                      code: 'MATERIAL_ISSUE',
                      path: 'working_archetype',
                      message: 'Needs review.',
                      evidence_ids: [],
                    },
                  ],
          }),
    )
    const repository = new FakeRepository()

    const result = await runProfileInference(
      input(undefined, true),
      dependencies(fake, repository),
    )

    expect(result.status).toBe(status)
    expect(fake.callsByStage('core')).toHaveLength(1)
    expect(fake.callsByStage('critic')).toHaveLength(1)
    expect(repository.states).toEqual([
      'parsing',
      'inferring',
      'criticizing',
      'validating',
    ])
    expect(repository.saves).toHaveLength(1)
    expect(repository.saves[0]).toMatchObject({ status, critic: { verdict } })
  })

  it.each([
    [
      'pass with issues',
      {
        verdict: 'pass',
        issues: [
          {
            code: 'ISSUE',
            path: 'working_archetype',
            message: 'Material issue.',
            evidence_ids: [],
          },
        ],
      },
    ],
    ['revise without issues', { verdict: 'revise', issues: [] }],
    [
      'duplicate issue codes',
      {
        verdict: 'unresolved',
        issues: [
          {
            code: 'DUPLICATE',
            path: 'working_archetype',
            message: 'First issue.',
            evidence_ids: [],
          },
          {
            code: 'DUPLICATE',
            path: 'capabilities',
            message: 'Second issue.',
            evidence_ids: [],
          },
        ],
      },
    ],
    [
      'empty issue message',
      {
        verdict: 'revise',
        issues: [
          {
            code: 'EMPTY_MESSAGE',
            path: 'working_archetype',
            message: ' ',
            evidence_ids: [],
          },
        ],
      },
    ],
    [
      'duplicate evidence IDs',
      {
        verdict: 'revise',
        issues: [
          {
            code: 'DUPLICATE_EVIDENCE',
            path: 'working_archetype',
            message: 'Material issue.',
            evidence_ids: ['message-1', 'message-1'],
          },
        ],
      },
    ],
  ])('rejects Critic semantic violation: %s', async (_name, invalidCritic) => {
    const fake = new FakeProvider((request) =>
      request.stage === 'core'
        ? completed(conservativeModel())
        : completed(invalidCritic),
    )
    const repository = new FakeRepository()

    const result = await runProfileInference(
      input(undefined, true),
      dependencies(fake, repository),
    )

    expect(result.status).toBe('failed')
    expect(repository.saves).toHaveLength(0)
    expect(repository.updates.at(-1)?.details?.errorCode).toBe(
      'PROVIDER_INVALID_OUTPUT',
    )
  })

  it('rejects Critic evidence IDs that resolve to neither a message nor an Episode', async () => {
    const fake = new FakeProvider((request) =>
      request.stage === 'core'
        ? completed(conservativeModel())
        : completed({
            verdict: 'revise',
            issues: [
              {
                code: 'UNRESOLVED_EVIDENCE',
                path: 'working_archetype',
                message: 'Material issue.',
                evidence_ids: ['missing-evidence'],
              },
            ],
          }),
    )
    const repository = new FakeRepository()

    const result = await runProfileInference(
      input(undefined, true),
      dependencies(fake, repository),
    )

    expect(result.status).toBe('failed')
    expect(repository.saves).toHaveLength(0)
    expect(repository.updates.at(-1)?.details?.errorCode).toBe(
      'MODEL_POLICY_VIOLATION',
    )
  })

  it('persists structured Critic issues and terminal state atomically in the repository', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'workgraph-pipeline-'))
    const repository = createRepository(join(directory, 'workgraph.db'))
    try {
      const source = transcript()
      const storedTranscript = repository.createTranscript(
        source,
        new Date('2026-08-28T00:00:00.000Z'),
      )
      const job = repository.createJob({
        candidateId: source.candidate_id,
        transcriptId: storedTranscript.id,
        idempotencyKey: null,
        requestHash: 'pipeline-atomic-save',
      })
      const fake = new FakeProvider((request) =>
        request.stage === 'core'
          ? completed(conservativeModel())
          : completed({
              verdict: 'revise',
              issues: [
                {
                  code: 'MATERIAL_ISSUE',
                  path: 'working_archetype',
                  message: 'Needs review.',
                  evidence_ids: [],
                },
              ],
            }),
      )

      const result = await runProfileInference(
        {
          ...input(undefined, true),
          jobId: job.id,
          transcript: source,
        },
        dependencies(fake, repository),
      )
      const finalJob = repository.getJob(job.id)
      const storedModel = repository.getModel(finalJob.modelId!)

      expect(result.status).toBe('unresolved')
      expect(finalJob.status).toBe('unresolved')
      expect(storedModel.critic).toEqual({
        verdict: 'revise',
        issues: [
          {
            code: 'MATERIAL_ISSUE',
            path: 'working_archetype',
            message: 'Needs review.',
            evidence_ids: [],
          },
        ],
      })
    } finally {
      repository.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })

  it('fails malformed model output through the provider schema parser and saves nothing', async () => {
    const fake = new FakeProvider((request) => {
      expect(() => request.parse({ malformed: true })).toThrow()
      return {
        state: 'failed',
        error: { code: 'invalid_output', message: 'invalid output' },
        providerRequestId: null,
        providerResponseId: null,
        usage: { inputTokens: null, outputTokens: null, reasoningTokens: null },
      }
    })
    const repository = new FakeRepository()

    const result = await runProfileInference(
      input(),
      dependencies(fake, repository),
    )

    expect(result.status).toBe('failed')
    expect(repository.states.at(-1)).toBe('failed')
    expect(repository.saves).toHaveLength(0)
  })

  it('fails hard invariant issues with MODEL_POLICY_VIOLATION before saving', async () => {
    const invalid = conservativeModel()
    invalid.archetype_competition = invalid.archetype_competition.filter(
      ({ type }) => type !== 'null',
    )
    const fake = new FakeProvider(() => completed(invalid))
    const repository = new FakeRepository()

    const result = await runProfileInference(
      input(),
      dependencies(fake, repository),
    )

    expect(result.status).toBe('failed')
    expect(result.invariantIssues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'INCOMPLETE_ARCHETYPE_COMPETITION' }),
      ]),
    )
    expect(repository.saves).toHaveLength(0)
    expect(repository.states.at(-1)).toBe('failed')
  })

  it('repairs invented message IDs from verbatim quotes instead of failing the job', async () => {
    const recovered = episode(1)
    recovered.source_message_ids = ['invented-message']
    recovered.verbatim_user_quote =
      'Keep ownership explicit in domain 1. ' + 'x'.repeat(120)
    const model = conservativeModel({
      high_signal_episodes: [recovered],
    })
    const fake = new FakeProvider(() => completed(model))
    const repository = new FakeRepository()

    const result = await runProfileInference(
      input(),
      dependencies(fake, repository),
    )

    expect(result.status).toBe('completed')
    expect(result.canonicalModel?.high_signal_episodes[0]?.source_message_ids).toEqual(
      ['message-1'],
    )
    expect(repository.saves).toHaveLength(1)
  })

  it('creates, revalidates, and atomically saves an under-resolved copy for ambiguous attribution', async () => {
    const ambiguousEpisode = episode(1)
    ambiguousEpisode.behavior_types = []
    ambiguousEpisode.agency = {
      user_authorship: 0,
      user_judgment: 0,
      user_correction: 0,
      user_reframing: 0,
      ai_authorship: 0,
      third_party_authorship: 0,
    }
    const model = conservativeModel({
      working_archetype: {
        name_cn: 'LEAK_POSITIVE_ARCHETYPE',
        name_en: 'LEAK_POSITIVE_ARCHETYPE_EN',
        definition: 'LEAK_POSITIVE_ARCHETYPE_DEFINITION',
        explanatory_confidence: 0.9,
        outcome_validation_confidence: 0.8,
        evidence_status: 'observed',
        claim_polarity: 'positive',
        supporting_evidence_ids: ['episode-1'],
      },
      high_signal_episodes: [ambiguousEpisode],
      mechanisms: [
        {
          id: 'mechanism-1',
          name: 'Boundary correction',
          description: 'Corrects ownership.',
          supporting_episode_ids: ['episode-1'],
          contexts: ['architecture'],
          predicted_observations: [],
          confirmed_predictions: [],
          missing_predictions: [],
          counter_evidence: [],
          evidence_status: 'observed',
          claim_polarity: 'neutral',
          confidence: 0.7,
        },
      ],
      capabilities: [
        {
          id: 'capability-1',
          name: 'LEAK_POSITIVE_CAPABILITY',
          mechanism_ids: ['mechanism-1'],
          supporting_episode_ids: ['episode-1'],
          emergent_logic: 'LEAK_POSITIVE_CAPABILITY_DETAIL',
          evidence_status: 'observed',
          claim_polarity: 'positive',
          confidence: 0.7,
        },
      ],
      archetype_competition_winner: 'competition-higher_order',
      strength_risk_pairs: [
        {
          capability_id: 'capability-1',
          risk_claim: 'LEAK_POSITIVE_RISK',
          evidence_status_ceiling: 'observed',
          evidence_status: 'observed',
          claim_polarity: 'risk',
          confidence: 0.7,
          supporting_evidence_ids: ['episode-1'],
        },
      ],
      role_fit: [
        {
          id: 'role-1',
          role_family: 'LEAK_POSITIVE_ROLE',
          natural_fit: 0.9,
          readiness: 0.8,
          reason: 'LEAK_STRONG_FIT_REASON',
          evidence_status: 'observed',
          claim_polarity: 'positive',
          confidence: 0.8,
          supporting_evidence_ids: ['episode-1'],
          seniority_evidence: {
            status: 'observed',
            level: 'senior',
            supporting_evidence_ids: ['episode-1'],
          },
        },
      ],
      hiring_manager_summary: {
        claims: [
          {
            claim: 'LEAK_POSITIVE_SUMMARY',
            evidence_status: 'observed',
            claim_polarity: 'positive',
            confidence: 0.9,
            supporting_evidence_ids: ['episode-1'],
          },
        ],
        seniority_claims: [],
      },
    })
    model.archetype_competition.forEach((candidate) => {
      candidate.name = `LEAK_POSITIVE_COMPETITION_${candidate.type}`
    })
    const originalModel = structuredClone(model)
    const fake = new FakeProvider(() => completed(model))
    const repository = new FakeRepository()
    const pipelineInput = {
      ...input(),
      transcript: transcript('mixed'),
    }

    const result = await runProfileInference(
      pipelineInput,
      dependencies(fake, repository),
    )

    expect(result.status).toBe('unresolved')
    expect(result.uiModel).toBeDefined()
    const serializedUi = JSON.stringify(result.uiModel)
    expect(serializedUi).not.toContain('LEAK_')
    expect(result.canonicalModel).not.toEqual(model)
    expect(result.canonicalModel?.archetype_competition_winner).toBe(
      'competition-null',
    )
    expect(result.canonicalModel?.working_archetype).toMatchObject({
      explanatory_confidence: 0.4,
      outcome_validation_confidence: 0.4,
      evidence_status: 'unknown',
      claim_polarity: 'neutral',
      supporting_evidence_ids: [],
    })
    expect(result.canonicalModel?.mechanisms).toEqual([])
    expect(result.canonicalModel?.capabilities).toEqual([])
    expect(result.canonicalModel?.strength_risk_pairs).toEqual([])
    expect(result.canonicalModel?.role_fit).toEqual([])
    expect(result.canonicalModel?.hiring_manager_summary.claims).toEqual([
      {
        claim: '证据不足，候选人画像待验证。',
        evidence_status: 'unknown',
        claim_polarity: 'neutral',
        confidence: 0.2,
        supporting_evidence_ids: [],
      },
    ])
    expect(result.canonicalModel?.high_signal_episodes).toEqual([
      ambiguousEpisode,
    ])
    expect(
      result.canonicalModel?.high_signal_episodes[0]?.source_message_ids,
    ).toEqual(['message-1'])
    expect(JSON.stringify(result.canonicalModel)).not.toContain('LEAK_')
    expect(result.uiModel).toMatchObject({
      headline: '尚未形成可验证的工作原型',
      capabilities: [],
      strengths: [],
      risks: [],
      roles: [],
    })
    expect(model).toEqual(originalModel)
    expect(result.invariantIssues).toEqual([])
    expect(repository.states).toEqual(['parsing', 'inferring', 'validating'])
    expect(repository.saves).toHaveLength(1)
    expect(repository.saves[0]).toMatchObject({
      canonicalModel: result.canonicalModel,
      status: 'unresolved',
    })
  })

  it.each([
    ['timeout', 'failed', 'timeout', 'PROVIDER_TIMEOUT'],
    ['network', 'failed', 'network_error', 'PROVIDER_NETWORK_ERROR'],
    [
      'unavailable',
      'failed',
      'provider_unavailable',
      'PROVIDER_UNAVAILABLE',
    ],
    ['rejection', 'failed', 'provider_rejected', 'PROVIDER_REJECTED'],
    [
      'invalid response',
      'failed',
      'invalid_provider_response',
      'PROVIDER_INVALID_RESPONSE',
    ],
    ['invalid output', 'failed', 'invalid_output', 'PROVIDER_INVALID_OUTPUT'],
    ['refusal', 'refusal_empty', null, 'PROVIDER_REJECTED'],
    ['incomplete', 'incomplete', null, 'PROVIDER_INCOMPLETE'],
  ] as const)(
    'preserves %s provider failure as %s',
    async (_name, state, providerCode, expectedCode) => {
      const fake = new FakeProvider(() => ({
        state,
        ...(state === 'failed'
          ? { error: { code: providerCode, message: 'provider failed' } }
          : state === 'incomplete'
            ? { incompleteDetails: 'max_output_tokens' }
            : {}),
        providerRequestId: null,
        providerResponseId: null,
        usage: { inputTokens: null, outputTokens: null, reasoningTokens: null },
      }))
      const repository = new FakeRepository()

      const result = await runProfileInference(
        input(),
        dependencies(fake, repository),
      )

      expect(result.status).toBe('failed')
      expect(repository.states.at(-1)).toBe('failed')
      expect(repository.updates.at(-1)?.details?.errorCode).toBe(expectedCode)
      expect(repository.saves).toHaveLength(0)
    },
  )

  it('labels unexpected exceptions as INTERNAL_ERROR rather than policy violations', async () => {
    const fake = new FakeProvider(() => {
      throw new Error('unexpected')
    })
    const repository = new FakeRepository()

    const result = await runProfileInference(
      input(),
      dependencies(fake, repository),
    )

    expect(result.status).toBe('failed')
    expect(repository.updates.at(-1)?.details?.errorCode).toBe('INTERNAL_ERROR')
  })
})
