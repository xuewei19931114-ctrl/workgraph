# Task 3: Deterministic Transcript Parsing and Normalization

## Binding constraints

- Work in `/Users/sxw/Desktop/workgraph`; no Git initialization or commits.
- Strict TDD with observed RED before production changes.
- Consume the canonical `Transcript` type/schema from `shared/profile-schemas.ts`; do not create a competing transcript type.
- IDs must be deterministic; never use time/random values.
- Preserve authorship distinctions; unknown is not user evidence.
- Do not implement persistence, providers, inference, routes, or frontend job integration.

## Files

- Modify: `src/types.ts`
- Rewrite: `src/lib/parseArchive.ts`
- Create: `src/lib/transcriptIds.ts`
- Test: `src/lib/parseArchive.test.ts`
- Create: `test/fixtures/chatgpt-conversations.json`
- Create: `test/fixtures/simple-chat.html`
- Create: `test/fixtures/simple-chat.txt`

## Interface

```ts
interface ParsedArchive {
  stats: ArchiveStats
  transcript: Transcript
}

parseArchive(file: File, candidateId: string): Promise<ParsedArchive>
```

`PickedFile.archive` becomes `ParsedArchive`; all stats reads become `file.archive?.stats`.

## Required TDD behavior

1. Create synthetic fixtures only—no real user content.
2. JSON fixture includes a ChatGPT `mapping` tree with user/assistant messages and an active branch.
3. HTML/TXT fixtures include explicit `User:` / `Assistant:` markers.
4. Tests first must assert:

```ts
expect(result.stats).toEqual({ conversations: 1, messages: 4 })
expect(result.transcript.conversations[0].messages[0].role).toBe('user')
expect(result.transcript.conversations[0].messages[1].authorship).toBe('assistant')
expect(secondParse.transcript).toEqual(firstParse.transcript)
```

5. Plain text without role markers uses transport `role: 'user'` but `authorship: 'unknown'`.
6. Run `npm test -- src/lib/parseArchive.test.ts` and record expected RED before implementation.

## Required implementation

Stable IDs use Web Crypto SHA-256:

```ts
messageId = sha256(`${sourceType}:${conversationIndex}:${messageIndex}:${role}:${content}`)
conversationId = sha256(`${sourceType}:${conversationIndex}:${title}`)
```

ChatGPT mapping:

- when `current_node` exists, follow parent links and reverse to select the active branch;
- otherwise sort valid messages by `create_time`, then stable source position;
- map roles exactly;
- content comes from message content parts;
- timestamp is ISO string when available, otherwise null.

HTML/TXT/DOCX:

- preserve explicit role markers;
- unstructured blocks are unknown authorship;
- DOCX still unwraps `word/document.xml`;
- ZIP merges recognized JSON/HTML/TXT entries into one Transcript with globally unique deterministic IDs.

PDF and legacy DOC remain explicit unsupported errors.

All outputs must parse through `TranscriptSchema` before return.

## Verification

```bash
npm test -- src/lib/parseArchive.test.ts
npm run typecheck
```

Both pass.

## Report contract

Write `/Users/sxw/Desktop/workgraph/.superpowers/sdd/task-3-report.md` with status, files, RED/GREEN evidence, format decisions, self-review and concerns. Return only status, one-line test summary and concerns.
