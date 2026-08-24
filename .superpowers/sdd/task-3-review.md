# Task 3 Review Findings

## Verdict

- Spec compliance: REJECTED
- Code quality: REJECTED

## Important fixes

1. Replace locale-dependent ZIP path ordering with deterministic code-point ordering.
2. If `current_node` is present but missing/dangling, fail that ChatGPT conversation explicitly; only use all-message fallback when `current_node` is absent.
3. Do not silently swallow recognized ZIP entry parse failures. Return an explicit aggregate error identifying failed recognized entries, preventing partial transcript success.
4. Add regression tests for:
   - absent `current_node` stable sort by create time then source position;
   - dangling `current_node`;
   - deterministic ZIP path ordering;
   - recognized ZIP entry failure;
   - conversation/message ID uniqueness;
   - exact stable hash inputs.

## Re-review finding

5. Validate `current_node` with an own-property check, not the `in` operator. Add regression cases for inherited keys such as `constructor`, `toString`, and `__proto__`; these must be treated as dangling and fail explicitly, including in multi-conversation JSON.

## Verification

- Follow RED/GREEN for each fix.
- Append evidence to `task-3-report.md`.
- Run parser tests and normal typecheck.
