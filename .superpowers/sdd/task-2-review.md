# Task 2 Review Findings

## Verdict

- Spec compliance: REJECTED
- Code quality: REJECTED

## Important fixes required

1. `shared/profile-schemas.ts`: Transcript timestamp must accept `string | null`.
2. Express under-resolved explicitly: add a nullable archetype competition winner and enforce conservative confidence for null/under-resolved output.
3. AI/third-party attribution invariants must follow both direct Episode references and capability → mechanism → Episode references; handle `mixed`; use meaningful agency thresholds; require exact behavior types rather than substring `transfer`.
4. Add evidence ID fields for major claims: working archetype, archetype competition explanations, strongest counterargument, role fit claims, and hiring manager summary. Validate every ID.
5. Strengthen missing-as-weakness and role-inflation checks beyond fragile paired keyword matching. Seniority `inferred`/`observed` must require supporting evidence IDs; seniority assertions in reason/summary must also be checked.
6. Include `shared/**/*.ts` in the persistent TypeScript project graph and normal `npm run typecheck`; fix `rootDir`/include boundaries so later server imports compile.

## Minor fix

- Derive invariant input types from exported Zod schema types instead of manually duplicating them.

## Required verification

- Add failing regression tests for each Important item before implementation.
- Record observed RED and GREEN commands/results by appending to `task-2-report.md`.
- Run `npm test -- server/test/schemas` and `npm run typecheck`.

## Re-review findings

7. Archetype competition winner must reference a unique stable ID, not a non-unique name. Enforce competition IDs and winner referential integrity; null winner or null-type winner must enforce the conservative confidence ceiling.
8. Important claim evidence cannot be empty on supported claims. Add evidence references to `core_loop` and `why_different`. For working archetype, competition claims, counterargument, role fit, and hiring summary: require at least one valid evidence ID when evidence status is supported; allow empty only when structured status is `unknown/missing` and confidence remains conservative.
9. Replace missing-as-weakness keyword dependence with structured claim metadata. Claims need `evidence_status` and `claim_polarity`; enforce that `unknown/missing` claims are neutral and cannot be risk/negative. Free-text summaries must be backed by structured summary claims using the same rule.
10. Summary seniority claims must reference the exact role-fit seniority level and its evidence IDs; unrelated or lower-level evidence cannot authorize another level.
11. Represent `mixed` as an ambiguous attribution issue rather than simultaneously asserting both AI and third-party contamination.
12. Correct under-resolved validation messages for the null-type-winner case.

## Final re-review findings

13. Remove unbound free-text hiring summary from the canonical model input contract. Canonical `hiring_manager_summary` must contain only structured claims; deterministic report/UI rendering will compose prose later. This closes unsupported negative/seniority text bypasses.
14. Enforce uniqueness for transcript message IDs, Episode IDs, mechanism IDs, capability IDs, competition IDs, and role-fit IDs before building lookup maps.
15. Require every Episode `source_message_ids` array to contain at least one valid message ID.
16. Enforce `risk.evidence_status <= risk.evidence_status_ceiling <= capability.evidence_status`.
17. Define a dedicated evidence ceiling enum of `observed | inferred | unknown`; do not allow `missing`. Seniority evidence status also uses `observed | inferred | unknown`.
18. Correct winner validation wording to reference ID.
19. For mixed attribution, report ambiguity without suppressing independently known assistant or third-party contamination in the same Episode.
