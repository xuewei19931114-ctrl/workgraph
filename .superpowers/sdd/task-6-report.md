# Task 6 Report

## Status

Completed Task 6 within `/Users/sxw/Desktop/workgraph`.

- Implemented runtime prompts, context strategy, deterministic Episode merge, and canonical-to-UI adapter.
- Added no provider calls, pipeline orchestration, routes, or Git operations.
- All transformations are deterministic and pure; the adapter does not mutate the canonical model.
- No distillation prompt or distillation stage was added.

## Files

Created:

- `server/src/prompts/core-inference.ts`
- `server/src/prompts/evidence-extractor.ts`
- `server/src/prompts/critic.ts`
- `server/src/inference/context-strategy.ts`
- `server/src/inference/episode-merger.ts`
- `server/src/report/to-ui-model.ts`
- `server/test/inference/context-strategy.test.ts`
- `server/test/inference/episode-merger.test.ts`
- `server/test/report/to-ui-model.test.ts`
- `.superpowers/sdd/task-6-report.md`

## RED / GREEN Evidence

Initial RED:

- Command: `npm test -- server/test/inference server/test/report`
- Result: exit 1; all three new suites failed because the requested production modules did not exist.

Context strategy:

- First GREEN attempt exposed an invalid test fixture limit: the required adjacent context message plus the next original message estimated 150 tokens against a 145 limit.
- The fixture limit was corrected to 155 without weakening production behavior.
- Command: `npm test -- server/test/inference/context-strategy.test.ts`
- Result: 5/5 passed.

Episode merge:

- Initial command after implementation: `npm test -- server/test/inference/episode-merger.test.ts`
- Result: 4/4 passed.
- Self-review added a deterministic colliding-ID test.
- RED result: source-to-ID assignment changed with reversed batch order.
- Production ordering was made deterministic before ID disambiguation.
- GREEN result: 5/5 passed.

UI adapter:

- Command: `npm test -- server/test/report/to-ui-model.test.ts`
- Result: 3/3 passed.

Combined target verification before report:

- Command: `npm test -- server/test/inference server/test/report`
- Result: 3 files passed, 12 tests passed.
- Command: `npm run typecheck`
- Result: exit 0.
- Edited-file IDE diagnostics: no linter errors.

Fresh final verification:

- Command: `npm test -- server/test/inference server/test/report`
- Result: 3 files passed, 13 tests passed.
- Command: `npm run typecheck`
- Result: exit 0.
- Command: `npm test`
- Result: 193/194 passed; one existing provider cancellation timing test failed while running the full suite.
- Isolated follow-up: `npm test -- server/test/provider/responses-client.test.ts`
- Result: 23/23 passed without any provider changes, indicating a full-suite timing/flakiness concern rather than a reproducible Task 6 regression.
- Final edited-scope IDE diagnostics: no linter errors.

## Prompt Versions and Source Mapping

### `reviewer-brain-core-v1.0.0`

Sources:

- `04_PROMPTS/CORE_INFERENCE_PROMPT.md`
- `01_BRAIN/CORE_REVIEWER_POLICY.md`
- `01_BRAIN/REVIEWER_THINKING_SEQUENCE.md`
- current `shared/profile-schemas.ts`

Mapping:

- Preserves the latent-person-model objective and discriminative-power target.
- Encodes all 17 public reasoning steps.
- Encodes high/low-signal policy, correction heuristic, authorship/agency separation, alternative hypotheses, cross-context recurrence, predictive validation, and missing-vs-contradictory evidence.
- Requires 3–5 emergent capabilities, all five competing archetype categories, the strongest unweakened counterargument, strength-to-risk derivation, and separate natural-fit/readiness/seniority judgments.
- Allows and conservatively handles null/under-resolved results.
- Requires exact evidence IDs and structured-only hiring-summary claims.
- Embeds the current `CandidateModelSchema` as generated JSON Schema.

### `reviewer-brain-evidence-v1.0.0`

Sources:

- `04_PROMPTS/EVIDENCE_EXTRACTOR_PROMPT.md`
- `01_BRAIN/CORE_REVIEWER_POLICY.md`
- current `EpisodeSchema`

Mapping:

- Extracts high-signal Episodes only.
- Explicitly forbids final archetype, mechanism, capability, role, readiness, seniority, and hiring inference.
- Requires agency decomposition, protected standards, 2–4 alternatives, signal strength, and exact source IDs.
- Treats assistant/third-party content as context.
- Embeds the current Episode-array JSON Schema.

### `reviewer-brain-critic-v1.0.0`

Sources:

- `04_PROMPTS/CRITIC_PROMPT.md`
- `01_BRAIN/CORE_REVIEWER_POLICY.md`
- current critic result schema semantics in `shared/profile-schemas.ts`

Mapping:

- Forbids profile regeneration.
- Requests only material inference issues.
- Covers contamination, attribution, missing evidence, generic/overfit inference, alternatives, archetype competition, counterargument quality, role inflation, confidence separation, traceability, and under-resolution.
- Returns exactly `issues` plus `pass | revise | unresolved`.

Prompt builder smoke test:

- Built all three prompts at runtime successfully.
- Resulting lengths: core 35145, extractor 3924, critic 1551 characters.

## Algorithm Decisions

### Context strategy

- Estimate is exactly `Math.ceil(JSON.stringify(value).length / 3) + fixedPromptAndSchemaReserve`.
- The configured maximum is treated as a hard safety limit.
- Whole conversations are packed intact when possible.
- Oversized conversations split only between messages.
- Each continuation receives exactly the immediately preceding message with `context_only: true`.
- Every source message appears once as non-context content.
- A typed `ContextStrategyError` exposes `code: MESSAGE_TOO_LARGE`, the message ID, estimate, and limit.

### Episode merge

- Every input is parsed through `EpisodeSchema`.
- Sorted source-message-ID sets form the deduplication key.
- Duplicate conflicts use the lower signal strength and deterministic unions of behavior types and alternative explanations.
- Conflicting protected standards are both preserved in the singular schema field with deterministic ` | ` separation.
- Unknown transcript source IDs raise typed `INVALID_SOURCE_ID`.
- Output uses greedy marginal conversation coverage, then signal strength, then stable Episode ID.
- Colliding IDs are deterministically suffixed and remain unique.

### UI adapter

- Confidence mapping is `>= 0.75 high`, `>= 0.45 medium`, otherwise `unknown`.
- Dimensions and counts are derived from canonical arrays.
- Capability evidence exposes the Episode user-action quotation and exact source message IDs.
- Role verdict combines natural fit and readiness while seniority remains a separate boundary.
- Unknown/missing evidence boundaries become `cannotProve` and deterministic next questions.
- Hiring-summary structured claims become deterministic Chinese prose.
- Null winner or null archetype produces a conservative headline and thesis.
- Output is validated through `UiCandidateModelSchema`.

## Self-review

- Confirmed no canonical mutation: adapter test compares against `structuredClone`.
- Confirmed no model/provider invocation in merger or adapter.
- Confirmed stable IDs across reversed batch order.
- Confirmed prompt modules build successfully at runtime.
- Confirmed no references to a distillation prompt or stage.
- Confirmed no task-external provider, pipeline, route, or Git changes.

## Concerns

- `EpisodeSchema` has one `protected_standard` string rather than an alternatives array. To avoid silent overwrite, conflicting values are preserved in deterministic `value A | value B` form. A future schema revision could represent this more structurally.
- A continuation's mandatory adjacent context message consumes token budget. If that context-plus-next-message atomic continuation cannot fit, `MESSAGE_TOO_LARGE` is raised even when the next message alone would fit; emitting a compliant chunk is otherwise impossible under the stated requirements.
- The full-suite run had one non-reproducible failure in the existing provider caller-cancellation timing test (`mock.requests` was still empty). Its isolated suite immediately passed 23/23; provider code was intentionally left untouched per Task 6 scope.

## Review Remediation Addendum

This addendum records the remediation of all eight findings in `task-6-review.md`. It supersedes the implementation details and concerns above where they describe concatenated protected standards, `user_action` as a quotation, ambiguous continuation errors, or the old provider request-count assertion.

### 1. Explicit `superRefine` policy appendix

RED:

- Added `server/test/prompts/runtime-prompts.test.ts`.
- Command: `npm test -- server/test/prompts/runtime-prompts.test.ts`
- Result: 2/5 failed.
- Failures proved the core prompt lacked the explicit runtime-refinement appendix and the extractor lacked the exact quote/null instruction.

GREEN:

- Added an explicit `Policy appendix (runtime-enforced refinements)` to the core prompt.
- The appendix now states neutral polarity and `<= 0.4` confidence for unknown/missing claims; non-empty evidence for supported claims; reference validity; collection ID uniqueness; winner referential integrity; under-resolved confidence limits; exact seniority summary binding; risk evidence ceilings; complete five-category archetype competition; attribution restrictions; and structured-only summary requirements.
- Intermediate run had 1/5 failing because a tested clause was interrupted by a parenthetical; wording was made explicit without changing semantics.
- Final command: `npm test -- server/test/prompts/runtime-prompts.test.ts`
- Result: 5/5 passed.

### 2. Exact user quotation provenance

RED:

- Added `verbatim_user_quote`, conflict fields, and schema expectations to `profile-schemas.test.ts` before changing the schema.
- Command: `npm test -- server/test/schemas/profile-schemas.test.ts`
- Result: 13/40 failed with `unrecognized_keys`, including the direct Episode contract test.
- Added adapter tests that deliberately made `user_action` differ from `verbatim_user_quote` and tested the null path.
- Command: `npm test -- server/test/report/to-ui-model.test.ts`
- Result: 3/5 failed; the adapter rendered `user_action` for both exact and null quote cases.

GREEN:

- `EpisodeSchema` now requires `verbatim_user_quote: string | null`.
- The extractor requires an exact character-for-character user-authored copy or `null` and explicitly forbids rewriting `user_action` into a quotation.
- The adapter renders only `verbatim_user_quote`; null renders `无可核验的逐字引语` plus source IDs.
- After this adapter change, only the independent seniority-summary test remained failing (1/5), proving both quote paths were green.
- Final adapter result: 5/5 passed.

### 3. Structured protected-standard conflicts

RED:

- Added the three required fields to the Episode schema test:
  - primary `protected_standard`
  - `protected_standard_alternatives`
  - `has_protected_standard_conflict`
- Added a merger regression expecting a stable primary, unioned alternatives, and a conflict flag.
- Command: `npm test -- server/test/inference/episode-merger.test.ts`
- Result: 1/5 failed; actual primary remained synthesized as `goal fidelity | scope discipline`, and `goal fidelity` was missing from alternatives.

GREEN:

- `EpisodeSchema` now carries both structured conflict fields.
- The merger keeps the stable winning Episode's protected standard as primary, unions every other primary/alternative into a sorted alternatives array, excludes the primary from alternatives, and marks conflicts without synthesizing text.
- Command: `npm test -- server/test/inference/episode-merger.test.ts`
- Result: 5/5 passed.

### 4. Complete deterministic hiring summary

RED:

- Added a valid seniority claim bound to an observed role-fit seniority record.
- In the shared adapter RED run, expected prose included the regular claims and seniority claim; actual prose omitted seniority.
- After the quote fix, command `npm test -- server/test/report/to-ui-model.test.ts` had exactly 1/5 failing: the seniority-summary regression.

GREEN:

- Deterministic prose now concatenates `claims` followed by `seniority_claims`, preserving source array order.
- Command: `npm test -- server/test/report/to-ui-model.test.ts`
- Result: 5/5 passed.

### 5. Accurate adjacent-context overflow error

RED:

- Added a computed-limit test where the current message fits alone but the mandatory adjacent context plus current message does not.
- Command: `npm test -- server/test/inference/context-strategy.test.ts`
- Result: this case failed because the implementation reported `MESSAGE_TOO_LARGE` with the continuation estimate assigned to the current message.

GREEN:

- Added typed `CONTEXT_MESSAGE_TOO_LARGE`.
- It reports `messageId`, `contextMessageId`, `currentMessageEstimatedTokens`, `continuationEstimatedTokens`, and `maxEstimatedTokens` separately.
- Command: `npm test -- server/test/inference/context-strategy.test.ts`
- Result: 8/8 passed.

### 6. Empty conversation preservation

RED:

- Added one test proving fitting empty conversations remain in output and one proving oversized empty metadata raises a typed error.
- In the shared context RED run, 2/8 failed overall: the fitting empty conversation already worked, while oversized empty metadata was silently dropped instead of throwing.

GREEN:

- Empty conversations are emitted unchanged when their metadata fits.
- Oversized empty metadata raises `CONVERSATION_TOO_LARGE` with conversation ID, exact estimate, and safety limit.
- Command: `npm test -- server/test/inference/context-strategy.test.ts`
- Result: 8/8 passed.

### 7. Prompt contract tests and no distillation

RED:

- Added tests for every required appendix clause, current Episode schema field names, exact quote/null policy, extractor archetype/role prohibition, critic material-issues/output contract, and absence of distillation modules/references.
- Initial result: 2/5 failed for the missing appendix and quote instruction.

GREEN:

- Core and extractor prompts were updated as described above; critic already satisfied the tested contract.
- The no-distillation test recursively checks runtime `.ts` filenames and contents under `server/src`, plus all built prompt text.
- Command: `npm test -- server/test/prompts/runtime-prompts.test.ts`
- Result: 5/5 passed.

### 8. Provider caller-abort test stabilization

Root cause evidence:

- Earlier full-suite RED was 193/194 with `cancels immediately from the caller signal`: cancelled state was correct, but `mock.requests` was `0` instead of exactly `1`.
- This is a legal race: caller cancellation can win before socket dispatch. Exact-one therefore tested transport timing rather than the client contract.

Fix and GREEN:

- Preserved assertions for `state: cancelled` and error code `cancelled`.
- Replaced the exact-one request assertion with `requests.length <= 1`, which still proves there was no retry while allowing pre-dispatch cancellation.
- No provider implementation or model-call behavior changed.
- Isolated command: `npm test -- server/test/provider/responses-client.test.ts`
- Result: 23/23 passed.
- Final provider command: `npm test -- server/test/provider`
- Result: 2 files passed, 31/31 tests passed.

### Compatibility updates

- Updated the canonical Episode fixtures in schema, invariant, merger, and adapter tests to carry the new required fields.
- No pipeline, route, provider implementation, or model-call scope was added or changed.
- No Git operation was performed.

### Final verification evidence

- Target/schema command: `npm test -- server/test/inference server/test/report server/test/prompts server/test/schemas`
  - Result: 6 files passed, 104/104 tests passed.
- Provider command: `npm test -- server/test/provider`
  - Result: 2 files passed, 31/31 tests passed.
- Full command: `npm test`
  - Result: 12 files passed, 205/205 tests passed.
- Typecheck command: `npm run typecheck`
  - Result: exit 0.
- Edited-scope IDE diagnostics:
  - Result: no linter errors.

### Current concerns

- No blocking concern remains from the eight review findings.
- The UI schema still names the display field `quote`; when no verbatim quote exists, the adapter intentionally places the non-quoted label `无可核验的逐字引语` there because the existing UI model has no separate evidence-label field. It never substitutes `user_action`.

## Re-review Remediation Addendum (Findings 9–13)

This section records the second strict-TDD remediation round for findings 9–13 in `task-6-review.md`.

### 9 and 13. Direct Core quote/null rule and prompt regressions

RED:

- Added a Core-specific prompt test requiring:
  - `verbatim_user_quote` to be an exact character-for-character substring;
  - the matching source to be referenced and have role `user`;
  - `null` when no exact referenced user-role text exists.
- Added a prompt test for the complete seniority contract.
- Command: `npm test -- server/test/prompts/runtime-prompts.test.ts`
- Result: 2/7 failed. The existing Core appendix had neither the direct quote provenance rule nor the exact tested seniority wording.

GREEN:

- Added the quote/null rule directly to the Core runtime policy appendix, including the prohibition on rewriting `user_action` into a quotation.
- Synchronized the seniority appendix wording with the schema contract.
- Command: `npm test -- server/test/prompts/runtime-prompts.test.ts`
- Result: 7/7 passed.

### 10. Deterministic quote provenance invariant

Root cause:

- `verbatim_user_quote` was structurally typed but never checked against its claimed source messages. The adapter therefore preserved provenance only by convention, not by deterministic validation.

RED:

- Corrected the invariant fixture's valid quote to an actual exact substring of its referenced user-role message.
- Added three regressions:
  - fabricated quote;
  - text found only in a referenced assistant-role message;
  - valid exact quote in a referenced user-role message.
- Both invalid cases require stable code `INVALID_QUOTE_PROVENANCE` at `high_signal_episodes[0].verbatim_user_quote`.
- Command: `npm test -- server/test/schemas/invariants.test.ts`
- Result: 2/44 failed; fabricated and assistant-only quotes produced no issue. The valid quote test passed.

GREEN:

- Added stable `InvariantIssue` code `INVALID_QUOTE_PROVENANCE`.
- A non-null quote now passes only when at least one referenced message has `role === "user"` and its content contains the quote exactly, case-sensitively and without normalization.
- `null` remains the explicit no-verbatim-evidence representation.
- Command: `npm test -- server/test/schemas/invariants.test.ts`
- Result: 44/44 passed.

### 11. Batch-order-independent duplicate primary standard

Root cause:

- Duplicate-group base selection sorted only by `episode_id`. For identical IDs and source sets, JavaScript's stable sort preserved incoming batch order, so conflicting primary standards could swap between primary and alternatives.

RED:

- Added a reversed-batch regression with the same Episode ID, same source set, and different protected standards.
- Command: `npm test -- server/test/inference/episode-merger.test.ts`
- Result: 1/6 failed. Forward and reversed batches selected different primaries.

GREEN:

- Added deterministic composite comparison by Episode ID, normalized source-set key, protected standard, then complete serialized Episode as a final tie-breaker.
- Primary and alternatives are now identical across reversed batches; the deterministic primary in the regression is `goal fidelity`.
- Command: `npm test -- server/test/inference/episode-merger.test.ts`
- Result: 6/6 passed.

### 12 and 13. Supported/unknown seniority synchronization

RED:

- Existing schema tests already covered:
  - supported seniority requiring evidence IDs;
  - unknown seniority rejecting a non-null level.
- Added the missing regression: `observed` seniority with evidence IDs but `level: null`.
- Command: `npm test -- server/test/schemas/profile-schemas.test.ts`
- Result: 1/41 failed because the schema accepted supported seniority with a null level.

GREEN:

- `SeniorityEvidenceSchema.superRefine` now requires both:
  - non-null level; and
  - at least one evidence ID
  for `observed` or `inferred`.
- `unknown` continues to require `level: null`.
- Core prompt tests assert the same contract.
- Command: `npm test -- server/test/schemas/profile-schemas.test.ts`
- Result: 41/41 passed.

### Second-round final verification

- Target command: `npm test -- server/test/inference server/test/report server/test/prompts server/test/schemas`
  - Result: 6 files passed, 111/111 tests passed.
- Provider command: `npm test -- server/test/provider`
  - Result: 2 files passed, 31/31 tests passed.
- Full command: `npm test`
  - Result: 12 files passed, 212/212 tests passed.
- Typecheck command: `npm run typecheck`
  - Result: exit 0.
- Scope:
  - No model call, pipeline, route, or provider implementation changed.
  - No Git operation was performed.

### Second-round concerns

- No blocking concern remains from findings 9–13.
- Quote provenance is intentionally exact and case-sensitive; whitespace or Unicode normalization differences do not count as verbatim evidence and must use `null`.
