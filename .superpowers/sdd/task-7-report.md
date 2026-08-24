# Task 7 Report

## Status

Implemented the inference runners and end-to-end profile pipeline with fake-provider tests only. No routes, frontend, job-manager, real model calls, or Git operations were added.

## Files

Created:

- `server/src/inference/evidence-runner.ts`
- `server/src/inference/core-runner.ts`
- `server/src/inference/critic-runner.ts`
- `server/src/inference/pipeline.ts`
- `server/test/inference/pipeline.test.ts`

Updated:

- `shared/profile-schemas.ts` — structured Critic issue schema used by runners and persistence.
- `server/src/prompts/critic.ts` — Critic output contract aligned with the structured schema.
- `server/test/prompts/runtime-prompts.test.ts` — prompt-contract assertion aligned with the required structure.

## RED / GREEN Evidence

Observed RED:

1. Initial pipeline test run failed because `server/src/inference/pipeline.ts` did not exist.
2. After the first implementation, the ambiguity test failed with `expected unresolved, received completed`; the fixture was corrected to remove meaningful user agency so it actually represented mixed, ambiguous attribution.
3. The real-repository atomic persistence test failed with `Model null was not found`; structured Critic issues were rejected by the prior shared persistence schema.
4. Full regression initially failed in `runtime-prompts.test.ts` because it still asserted the obsolete string-only Critic issue contract.

Observed GREEN:

- `npm test -- server/test/inference/pipeline.test.ts`: 13/13 passed.
- `npm run typecheck`: passed.
- `npm test`: 225/225 passed across 13 files.

## Exact Call-count Assertions

- Direct/default: Core = 1, Extractor = 0, Critic = 0.
- Evidence fallback with three chunks: Extractor = 3, maximum active = 2, Core = 1.
- Critic enabled (`pass`, `revise`, `unresolved`): Critic = 1 and Core remains = 1.
- Cancellation during extraction: only two capacity-bound Extractors start; queued third call does not start; Core = 0; Critic = 0.

## Cancellation Evidence

- The bounded worker pool starts no more workers than configured capacity.
- Caller abort is linked to a sibling controller.
- Both active Extractor signals become aborted.
- The queued Extractor is never started.
- The pool awaits worker settlement.
- The pipeline persists `cancelled` state and saves no model.
- Any first Extractor failure aborts the same sibling controller and prevents later stages.

## State Traces

- Direct: `parsing → inferring → validating → completed` (terminal transition is performed atomically by `saveModel`).
- Evidence: `parsing → extracting → inferring → validating → completed`.
- Critic pass: `parsing → inferring → criticizing → validating → completed`.
- Critic revise/unresolved: `parsing → inferring → criticizing → validating → unresolved`.
- Extraction cancellation: `parsing → extracting → cancelled`.
- Provider/schema/policy failure: active stage `→ failed`, with no model saved.

## Self-review

- Each runner delegates provider access only to `callStructured`, sets its stage and prompt version, and cannot invoke another runner.
- Core receives exactly one of full Transcript or merged Episodes.
- Extractor, merged Episode, Core, and Critic outputs are schema validated.
- Deterministic invariants run before UI mapping or persistence.
- Hard policy violations fail with `MODEL_POLICY_VIOLATION`.
- Ambiguous attribution retains the conservative canonical/UI model as `unresolved`.
- Canonical, UI, structured Critic result, model ID, and terminal job status are persisted in one repository transaction.
- Critic never regenerates and never causes a second Core call.

## Concerns

- Repository-wide ESLint still reports four pre-existing errors in `server/src/app.ts`, `server/test/provider/redaction.test.ts`, and `server/test/schemas/profile-schemas.test.ts`; the Task 7 files have no IDE lint diagnostics.
- Tests intentionally use a fake provider and do not exercise a real model or network endpoint.

## Review Remediation — 2026-08-21

### Status

All five findings in `task-7-review.md` were addressed without adding routes, frontend, job-manager, real provider calls, or Git operations.

### RED / GREEN Evidence

Observed RED after adding review regressions:

- Pipeline suite: 17 failures / 26 tests.
- Ambiguous attribution persisted the original model instead of creating an under-resolved copy.
- Invalid Critic verdict/issue combinations, duplicate/empty fields, and unknown evidence IDs were accepted.
- All provider failures collapsed to `PROVIDER_FAILED`; unexpected exceptions were mislabeled `MODEL_POLICY_VIOLATION`.
- The first-Extractor-failure regression reached correct sibling settlement behavior but exposed collapsed `PROVIDER_FAILED` semantics.

Observed GREEN after minimal fixes:

- `npm test -- server/test/inference/pipeline.test.ts`: 26/26 passed.
- `npm test`: 238/238 passed across 13 files.
- `npm run typecheck`: passed.
- `npm run lint`: passed with zero errors.

### Finding Resolution

1. Ambiguous attribution now creates a new deterministic conservative copy, selects the null archetype, caps relevant confidence and role scores at `0.4`, neutralizes unsupported claims, removes contaminated support links, clears seniority, and re-runs Candidate schema plus invariant validation before atomic save.
2. Critic schema now enforces verdict/issue cardinality, non-empty and unique codes/messages, and non-empty unique evidence IDs. Pipeline validation resolves every Critic evidence ID against Transcript messages and Candidate Model Episodes.
3. Runner errors preserve provider semantics through the pipeline: timeout, network, unavailable, rejection/refusal, invalid response, invalid output, incomplete, and cancellation remain distinct. Unexpected exceptions use `INTERNAL_ERROR`; only deterministic policy failures use `MODEL_POLICY_VIOLATION`.
4. The first-Extractor-failure regression verifies two active calls only, sibling abort observation, queued work suppression, complete settlement, zero Core calls, and zero `unhandledRejection` events.
5. The four listed ESLint errors were removed without changing tested behavior. The earlier lint concern in this report is superseded: repository-wide lint now passes.

### Remaining Concerns

- Tests intentionally use a fake provider; no real model or external endpoint was called.

## Re-review Finding 6 — 2026-08-21

### RED / GREEN Evidence

Observed RED with a strongly positive ambiguous model:

- Pipeline suite: 1 failure / 26 tests.
- The unresolved UI still contained `LEAK_POSITIVE_CAPABILITY`, `LEAK_POSITIVE_CAPABILITY_DETAIL`, `LEAK_POSITIVE_RISK`, `LEAK_POSITIVE_ROLE`, and `LEAK_STRONG_FIT_REASON`.
- The first failure showed the exact serialized unresolved UI retaining capability, risk, and role assertions despite its under-resolved headline.

Observed GREEN after the conservative transformation was tightened:

- `npm test -- server/test/inference/pipeline.test.ts`: 26/26 passed.
- The conservative canonical copy and derived UI contain no `LEAK_` marker.

### Resolution

- Under ambiguous attribution, all derived mechanisms, capabilities, strength-risk pairs, role fits, dimensions, and evidence-boundary assertions are cleared.
- Working archetype, differentiator, competition labels, strongest counterargument, and hiring summary are replaced with explicit neutral “证据不足/待验证” language.
- The null archetype remains selected and confidence stays conservative.
- Raw Episodes and their source message IDs are preserved unchanged for traceability.
- The transformed copy is schema-validated and invariant-validated before UI mapping and atomic persistence.
- The original provider model is verified unchanged after the pipeline completes.
