# Task 6: Prompts, Context Strategy, Episode Merge, and UI Adapter

## Binding constraints

- Work in `/Users/sxw/Desktop/workgraph`; no Git.
- Strict TDD for context strategy, Episode merger and UI adapter.
- Runtime prompts must faithfully encode reviewer brain policy; do not add the distillation prompt.
- This task has no provider calls or pipeline orchestration.
- All transformations are deterministic and pure.
- Canonical model must not be mutated.

## Required source material

Read before implementation:

- `.../workgraph_reviewer_brain_complete_v1/04_PROMPTS/CORE_INFERENCE_PROMPT.md`
- `.../workgraph_reviewer_brain_complete_v1/04_PROMPTS/EVIDENCE_EXTRACTOR_PROMPT.md`
- `.../workgraph_reviewer_brain_complete_v1/04_PROMPTS/CRITIC_PROMPT.md`
- `.../workgraph_reviewer_brain_complete_v1/01_BRAIN/CORE_REVIEWER_POLICY.md`
- `.../workgraph_reviewer_brain_complete_v1/01_BRAIN/REVIEWER_THINKING_SEQUENCE.md`
- current `shared/profile-schemas.ts` and `shared/ui-model.ts`.

## Files

- Create: `server/src/prompts/core-inference.ts`
- Create: `server/src/prompts/evidence-extractor.ts`
- Create: `server/src/prompts/critic.ts`
- Create: `server/src/inference/context-strategy.ts`
- Create: `server/src/inference/episode-merger.ts`
- Create: `server/src/report/to-ui-model.ts`
- Test: `server/test/inference/context-strategy.test.ts`
- Test: `server/test/inference/episode-merger.test.ts`
- Test: `server/test/report/to-ui-model.test.ts`

## Interfaces

```ts
chooseContextPath(transcript, config): 'direct' | 'evidence'
chunkTranscript(transcript, maxEstimatedTokens): TranscriptChunk[]
mergeEpisodes(batches, transcript): Episode[]
toUiCandidateModel(canonical, metadata): CandidateModel
```

Each prompt module exports a version constant and builder.

## Prompt requirements

- Core prompt includes all 17 reasoning steps, high/low signal policy, attribution rules, missing evidence rule, predictive validation, 3–5 capabilities, five competing archetypes, strongest counterargument, strength→risk, natural fit/readiness/seniority separation, under-resolved option, evidence traceability, and exact current JSON schema semantics.
- Extractor prompt forbids final archetype/role inference and requests only high-signal Episodes with agency and source IDs.
- Critic prompt forbids regeneration and returns only material issues plus `pass | revise | unresolved`.
- Prompt version strings are stable and included in telemetry later.
- Canonical hiring summary is structured claims only; prose is generated deterministically by adapter.

## Context strategy TDD

Tests first:

- small transcript chooses direct;
- over-limit chooses evidence;
- normal conversation is never split;
- oversized conversation splits only at message boundaries;
- each continuation carries exactly one adjacent message marked `context_only`;
- every original message appears exactly once as non-context content;
- estimate deterministic;
- no chunk exceeds limit except a single indivisible message, which raises a typed `MESSAGE_TOO_LARGE`.

Estimate:

```ts
Math.ceil(serializedText.length / 3) + fixedPromptAndSchemaReserve
```

The configured threshold is a safety limit.

## Episode merge TDD

Rules:

- validate all input through Episode schema;
- identical sorted source-message-ID sets deduplicate;
- duplicate conflict keeps lower signal strength and unions alternative explanations/behavior types;
- conflicting protected standards are retained as alternatives, not silently overwritten;
- invalid source IDs reject the merge;
- output ordering maximizes distinct conversation coverage, then signal strength, then stable Episode ID;
- output IDs remain unique;
- merger never calls a model.

## UI adapter TDD

Verify:

- confidence `>= 0.75` → high; `>= 0.45` → medium; lower → unknown;
- role verdict mapping from natural fit/readiness;
- evidence quotations and source IDs remain visible;
- unknown boundaries map to cannot-prove content;
- structured hiring summary claims form deterministic prose;
- under-resolved renders conservative headline/thesis, not fabricated certainty;
- `structuredClone(canonical)` is unchanged after mapping.

The adapter returns the existing UI `CandidateModel` shape and computes counts from arrays, not hard-coded values.

## Verification

```bash
npm test -- server/test/inference server/test/report
npm run typecheck
```

Both pass.

## Report contract

Write `/Users/sxw/Desktop/workgraph/.superpowers/sdd/task-6-report.md` with status, files, RED/GREEN evidence, prompt versions/source mapping, algorithm decisions, self-review and concerns. Return only status, test summary and concerns.
