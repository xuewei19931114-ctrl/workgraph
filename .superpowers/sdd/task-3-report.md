# Task 3 Report: Deterministic Transcript Parsing and Normalization

## Status

Complete. The archive parser now returns `{ stats, transcript }`, reuses the
canonical `Transcript`/`TranscriptSchema`, and normalizes supported inputs with
deterministic SHA-256 conversation and message IDs.

## Files

- Modified `src/types.ts`
- Rewritten `src/lib/parseArchive.ts`
- Created `src/lib/transcriptIds.ts`
- Created `src/lib/parseArchive.test.ts`
- Created synthetic fixtures:
  - `test/fixtures/chatgpt-conversations.json`
  - `test/fixtures/simple-chat.html`
  - `test/fixtures/simple-chat.txt`
- Updated archive consumers in `src/App.tsx` and
  `src/components/FilePreviewModal.tsx` to read `archive.stats`
- Updated `vitest.config.ts` so the required `src/**/*.test.ts` target is
  discoverable

## RED evidence

Initial required command:

```text
npm test -- src/lib/parseArchive.test.ts
No test files found
```

This exposed that Vitest only included `server/test/**/*.test.ts`. After adding
the required source-test include, the same command produced the behavioral RED:

```text
Test Files  1 failed (1)
Tests       6 failed | 3 passed (9)
```

The failures were expected: the old parser returned only `ArchiveStats`, so
`result.stats` and `result.transcript` were absent. No production parser changes
were made before observing this behavioral RED.

## GREEN evidence

After the minimal parser and ID implementation:

```text
npm test -- src/lib/parseArchive.test.ts
Test Files  1 passed (1)
Tests       9 passed (9)
```

Final regression verification:

```text
npm test
Test Files  5 passed (5)
Tests       100 passed (100)

npm run typecheck
exit 0
```

IDE lint diagnostics for edited files reported no errors.

## Format decisions

- ChatGPT JSON follows the `current_node` parent chain and reverses it. Without
  `current_node`, valid message nodes are ordered by `create_time`, then source
  position.
- Message content is joined from ChatGPT content parts; available timestamps
  are normalized to ISO strings, otherwise `null`.
- Explicit `User:`, `Assistant:`, `System:`, and `Tool:` markers preserve role
  and authorship. Unmarked text uses transport role `user` with authorship
  `unknown`.
- `system` and `tool` messages use `third_party` authorship, keeping them
  distinct from user evidence.
- DOCX continues to unwrap `word/document.xml`.
- ZIP entries are processed in stable path order and merged before assigning
  global conversation/message indexes, giving globally unique deterministic
  IDs.
- Every returned transcript is validated with `TranscriptSchema.parse`.

## Self-review

- Confirmed no competing transcript interface/schema was introduced.
- Confirmed transcript IDs contain no time or random input and implement the
  exact required SHA-256 formulas.
- Confirmed active-branch exclusion, role/authorship preservation,
  determinism, unstructured unknown authorship, DOCX, ZIP uniqueness, and
  unsupported PDF/DOC behavior have tests.
- Confirmed all fixture content is synthetic.
- Confirmed no persistence, provider, inference, route, or frontend job
  integration was added.
- Confirmed every `PickedFile.archive` stats read now uses `.stats`.

## Concerns

- The current UI has no candidate identity flow. To keep this task out of job
  integration scope, its parser call uses the non-user placeholder
  `local-import`; a later integration task should supply the actual candidate
  ID.

## Review remediation

All Important findings in `task-3-review.md` were addressed without adding
persistence, providers, inference, routes, frontend job integration, or Git
operations.

### RED/GREEN evidence

1. Absent `current_node` ordering
   - Added a regression case with out-of-order timestamps and equal-time
     messages.
   - The focused test passed immediately (`1 passed`), confirming the existing
     fallback already sorted by `create_time` and then stable source position;
     no production change was made for behavior that was already correct.

2. Dangling `current_node`
   - RED: focused test failed because the promise resolved with the all-message
     fallback instead of rejecting (`1 failed`).
   - GREEN: presence is now distinguished from absence, and a present
     `current_node` that does not identify a mapping node throws explicitly
     (`1 passed`).

3. Deterministic ZIP ordering
   - RED: locale-sensitive ordering returned `ä-chat.txt` before `z-chat.txt`
     (`1 failed`).
   - GREEN: replaced `localeCompare` with an explicit Unicode code-point
     comparator (`1 passed`).
   - A second RED proved UTF-16 unit comparison was insufficient for
     supplementary characters (`1 failed`); the final comparator iterates full
     Unicode code points and both ordering tests pass (`2 passed`).

4. Recognized ZIP entry failures
   - RED: a ZIP containing malformed recognized entries plus one valid entry
     resolved with a partial transcript (`1 failed`).
   - GREEN: recognized-entry failures are collected and the whole parse rejects
     with all failed paths (`1 passed`).
   - A second RED showed zero-byte recognized entries were still skipped
     (`1 failed`); they now enter the same parse-and-aggregate path (`1 passed`).

5. ID guarantees
   - Added conversation ID uniqueness beside the existing message ID uniqueness
     assertion.
   - Added hard-coded SHA-256 expectations for the exact required conversation
     and message hash inputs.
   - These focused coverage tests passed immediately (`2 passed`), confirming
     the existing deterministic ID implementation already met both findings; no
     production ID change was necessary.

### Review verification commands

```text
npm test -- src/lib/parseArchive.test.ts
Test Files  1 passed (1)
Tests       16 passed (16)

npm run typecheck
exit 0

npm test
Test Files  5 passed (5)
Tests       107 passed (107)
```

IDE lint diagnostics for the parser, transcript ID helper, and parser tests
reported no errors.

### Review self-check

- ZIP path ordering no longer calls locale-sensitive APIs and is deterministic
  for BMP and supplementary Unicode code points.
- Only an absent `current_node` uses all-message fallback; a dangling present
  value fails explicitly.
- A failed recognized ZIP entry, including an empty one, prevents any partial
  transcript return and reports every failed path in deterministic order.
- Regression coverage now includes all six cases requested by the review:
  fallback ordering, dangling branch, deterministic ZIP ordering, recognized
  ZIP failure, conversation/message uniqueness, and exact stable hash inputs.

### Remaining concern

- The pre-existing `local-import` candidate ID placeholder remains unchanged;
  replacing it belongs to the later candidate identity/job integration task.

## Re-review finding 5 remediation

- Added inherited-key regressions for `constructor`, `toString`, and
  `__proto__`, plus a multi-conversation case that proves one invalid
  conversation cannot be returned as partial success.
- RED:

```text
npm test -- src/lib/parseArchive.test.ts -t inherited
Test Files  1 failed (1)
Tests       4 failed | 16 skipped (20)
```

  The single-conversation cases produced a generic empty-transcript error, and
  the multi-conversation case incorrectly resolved with a partial transcript.
- Root cause: the `in` operator accepted properties inherited from
  `Object.prototype` as mapping nodes.
- GREEN: replaced the inherited-property lookup with
  `Object.hasOwn(mapping, currentNode)`.

```text
npm test -- src/lib/parseArchive.test.ts -t inherited
Test Files  1 passed (1)
Tests       4 passed | 16 skipped (20)

npm test -- src/lib/parseArchive.test.ts
Test Files  1 passed (1)
Tests       20 passed (20)

npm run typecheck
exit 0
```

- IDE lint diagnostics for the parser and parser tests reported no errors.
- No scope beyond re-review finding 5 was changed.
