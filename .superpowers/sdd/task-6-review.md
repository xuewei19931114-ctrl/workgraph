# Task 6 Review Findings

## Verdict

- Spec compliance: REJECTED
- Code quality / acceptance evidence: REJECTED

## Required fixes

1. Core prompt must include an explicit policy appendix for every schema `superRefine` constraint: neutral missing claims, confidence ceilings, ID uniqueness, evidence non-emptiness/validity, winner reference, under-resolved threshold, exact seniority binding, and structured-only summary. JSON Schema alone is insufficient.
2. Add `verbatim_user_quote: string | null` to Episode schema. Extractor must request an exact copied user quote or null; adapter must never render `user_action` as a quote. Null quote renders a non-quoted evidence label plus source IDs.
3. Replace concatenated `protected_standard` conflicts with structured fields:
   - keep one primary `protected_standard`;
   - add `protected_standard_alternatives: string[]`;
   - add `has_protected_standard_conflict: boolean`.
   Merger unions alternatives and marks conflict; it never synthesizes `"A | B"`.
4. Deterministic hiring summary prose must include both regular structured claims and `seniority_claims`.
5. When an adjacent context message plus current message cannot fit but current message alone can, throw a typed `CONTEXT_MESSAGE_TOO_LARGE` with accurate estimates; do not report the current message itself as indivisible.
6. Preserve empty-message conversations as chunks when they fit; throw typed `CONVERSATION_TOO_LARGE` when their metadata alone exceeds the threshold.
7. Add prompt tests for:
   - required policy appendix clauses;
   - current schema field names;
   - exact quote requirement;
   - extractor prohibition on archetype/role;
   - critic output contract;
   - no distillation runtime module/reference.
8. Stabilize the pre-existing provider abort test: do not require that a request reached the mock server when caller cancellation can legally happen before socket dispatch. Preserve assertions for cancelled state and no retry.

## Re-review findings

9. Add the exact-quote rule to the direct Core prompt, not only the Extractor prompt.
10. Add a deterministic quote provenance invariant: a non-null `verbatim_user_quote` must be an exact substring of at least one referenced source message whose role is `user`; otherwise reject it. Add a stable issue code and tests for fabricated, assistant-only, and valid quotes.
11. Make duplicate Episode primary protected-standard selection independent of batch order, including same Episode ID + same source set + different protected standards. Use a deterministic composite sort and add reversed-batch regression.
12. Synchronize seniority schema and prompt: for `observed`/`inferred`, require a non-null level and supporting evidence; `unknown` requires null level. Add schema tests.
13. Extend prompt regression tests to cover direct-core quote requirements and the corrected seniority contract.

## Verification

- Add failing regression tests before each implementation.
- Append RED/GREEN evidence to task-6-report.md.
- Run task tests, provider tests, full test suite, and typecheck.
