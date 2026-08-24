# Task 7: Inference Runners and End-to-End Pipeline

## Binding constraints

- Work in `/Users/sxw/Desktop/workgraph`; no Git.
- Strict TDD with observed RED.
- Default direct path: exactly one Core call.
- Evidence path: N bounded-concurrency Extractor calls followed by exactly one Core call.
- Critic: zero calls by default, at most one when enabled.
- Critic never regenerates; revise/unresolved does not rerun Core.
- Cancellation aborts active and sibling Extractors and prevents later stages.
- Deterministic schema/invariant validation and UI mapping happen after model output.
- No routes/frontend/job-manager implementation in this task.

## Files

- Create: `server/src/inference/evidence-runner.ts`
- Create: `server/src/inference/core-runner.ts`
- Create: `server/src/inference/critic-runner.ts`
- Create: `server/src/inference/pipeline.ts`
- Test: `server/test/inference/pipeline.test.ts`

## Interface

```ts
interface PipelineInput {
  jobId: string
  candidateId: string
  transcript: Transcript
  enableCritic: boolean
  signal: AbortSignal
}

interface PipelineResult {
  status: 'completed' | 'unresolved' | 'failed' | 'cancelled'
  canonicalModel?: CandidateModel
  uiModel?: UiCandidateModel
  critic?: CriticResult
  invariantIssues: InvariantIssue[]
}

runProfileInference(input: PipelineInput, deps: PipelineDependencies): Promise<PipelineResult>
```

Dependencies are narrow interfaces for provider, repository/job-state updates, context strategy, merger, clock and adapter. Do not depend on Fastify.

## Runner contracts

- `evidence-runner`: one extractor prompt/schema per chunk; returns Episode batch only.
- `core-runner`: one core prompt/schema call; input is either complete Transcript or merged Episode map, never both on fallback.
- `critic-runner`: one critic prompt/schema call; output:

```ts
{
  verdict: 'pass' | 'revise' | 'unresolved'
  issues: Array<{
    code: string
    path: string
    message: string
    evidence_ids: string[]
  }>
}
```

Each runner delegates HTTP only to Task 5 `callStructured`, sets stage and prompt version, and cannot call another runner.

## Required RED tests

1. Direct:

```ts
expect(result.status).toBe('completed')
expect(fake.callsByStage('core')).toHaveLength(1)
expect(fake.callsByStage('extractor')).toHaveLength(0)
expect(fake.callsByStage('critic')).toHaveLength(0)
```

2. Evidence fallback:

- N Extractor calls;
- concurrent active calls never exceed configured limit;
- exactly one Core after merge;
- Core receives merged Episodes, not full transcript.

3. Cancellation:

- abort during Extractors reaches every active sibling;
- queued sibling does not start;
- no Core/Critic starts;
- persisted state becomes cancelled.

4. Critic:

- disabled → zero calls;
- enabled + pass → one call, completed;
- revise/unresolved → one call, result unresolved, no second Core.

5. Validation:

- malformed provider output fails through provider/schema layer;
- hard invariant issue fails with `MODEL_POLICY_VIOLATION`;
- ambiguous attribution only returns unresolved with conservative model retained;
- no model is saved before schema/invariant pass;
- canonical and UI models are saved atomically with final job state.

6. State order:

```text
parsing → inferring → validating → completed
parsing → extracting → inferring → validating → completed
... → criticizing → validating/completed or unresolved
```

7. Provider incomplete/refusal/failure maps to failed; caller abort maps cancelled.

## Pipeline implementation

- Update job state only through an injected repository interface.
- Use Task 6 context strategy/chunker and Episode merger.
- Implement bounded async pool without spawning all calls before capacity is available.
- On first Extractor failure, abort sibling controller linked to caller signal; await settlement to avoid unhandled rejections.
- Validate every Extractor output, merged Episodes, Core output and Critic output.
- Run `validateCandidateInvariants`.
- Hard policy issues:
  - invalid references/quotes;
  - AI or third-party attribution;
  - missing-as-weakness;
  - role inflation;
  - risk ceiling;
  - incomplete competition.
  Return failed `MODEL_POLICY_VIOLATION`.
- `AMBIGUOUS_ATTRIBUTION` returns unresolved and retains the conservative model.
- Critic revise/unresolved returns unresolved and persists issues.
- Map UI model with Task 6 adapter.
- Persist canonical/UI/critic and terminal status transactionally through Task 4 repository.
- Cancellation and provider failures must not save a model.

## Verification

```bash
npm test -- server/test/inference/pipeline.test.ts
npm run typecheck
npm test
```

All pass.

## Report contract

Write `/Users/sxw/Desktop/workgraph/.superpowers/sdd/task-7-report.md` with status, files, RED/GREEN evidence, exact call-count assertions, cancellation evidence, state traces, self-review and concerns. Return only status, test summary and concerns.
