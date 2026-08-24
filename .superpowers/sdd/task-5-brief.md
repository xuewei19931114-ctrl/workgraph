# Task 5: GPT-5.6 Responses Client, Retries, Cancellation, and Telemetry

## Binding constraints

- Work in `/Users/sxw/Desktop/workgraph`; no Git.
- Strict TDD with observed RED before implementation.
- Never use the real API key or external model in tests.
- Tests use a local mock HTTP server and synthetic text.
- Model fixed to `openai.gpt-5.6-sol`; reasoning effort from config defaults to `high`.
- Request URL is `{GPT56_BASE_URL}/openai/v1/responses`; header is `x-api-key`.
- No key, prompt, transcript, invalid model body, or full provider response may enter telemetry/logs/database.
- Do not implement business prompts, inference pipeline, routes, or frontend.

## Files

- Create: `server/src/provider/types.ts`
- Create: `server/src/provider/responses-client.ts`
- Create: `server/src/provider/call-recorder.ts`
- Test: `server/test/provider/responses-client.test.ts`
- Test: `server/test/provider/redaction.test.ts`

## Interface

```ts
interface StructuredCall<T> {
  stage: 'extractor' | 'core' | 'critic' | 'json_repair'
  instructions: string
  input: string
  schemaName: string
  jsonSchema: Record<string, unknown>
  parse: (value: unknown) => T
}

callStructured<T>(
  request: StructuredCall<T>,
  signal: AbortSignal,
): Promise<ProviderResult<T>>
```

Provider states:

```ts
type ProviderState =
  | 'completed'
  | 'incomplete'
  | 'refusal_empty'
  | 'failed'
  | 'cancelled'
```

Use dependency injection for config, fetch, sleep/jitter, and telemetry recorder so tests are deterministic.

## Required RED tests

Local mock server tests must cover:

1. standard `output[].content[].type === 'output_text'`;
2. request body model, `reasoning.effort`, strict JSON schema format;
3. exact `x-api-key` header and content type;
4. 429 then success;
5. repeated 503 then failure after max retries;
6. network timeout;
7. caller AbortSignal, including during backoff;
8. refusal, empty output, incomplete response;
9. malformed JSON;
10. explicit provider rejection of `json_schema` followed by strict JSON text fallback;
11. exactly one JSON repair call for malformed JSON, never a full inference rerun;
12. output parser selects only final `output_text`;
13. endpoint joining does not duplicate slashes/path.

Run provider test and record RED before production code.

## Implementation requirements

- Retry only network failures, timeout, 429, 502, 503, 504.
- Maximum retries: 2 after the initial attempt.
- Backoff: `250ms * 2^attempt + jitter(0..100ms)`.
- Caller abort cancels fetch and backoff immediately and is never retried.
- Each attempt has configured timeout; combine timeout and caller signal safely.
- Parse Responses usage:
  - `input_tokens`
  - `output_tokens`
  - `output_tokens_details.reasoning_tokens`
- Capture provider response ID and request ID header if present.
- Refusal/empty/incomplete become typed errors/states; never fabricate output.
- First call uses:

```json
{
  "model": "openai.gpt-5.6-sol",
  "reasoning": { "effort": "high" },
  "text": {
    "format": {
      "type": "json_schema",
      "name": "<schemaName>",
      "strict": true,
      "schema": {}
    }
  }
}
```

- Only an explicit unsupported-format provider error may trigger strict JSON text fallback.
- If completed output is malformed/invalid, allow exactly one separate `json_repair` call using the invalid JSON and target schema. It does not repeat original instructions/input.
- If repair fails, return typed failure.

## Telemetry

Record only:

- local call ID, job ID when provided;
- provider request/response IDs;
- stage/model/reasoning;
- start/end/wall time;
- provider status/incomplete details;
- input/output/reasoning token counts;
- safe error code/cancel details.

Redaction tests serialize all telemetry and errors and assert absence of:

- configured API key;
- synthetic secret marker from prompt/input;
- malformed JSON body;
- provider raw response.

Use Task 4 repository recorder through a narrow injected interface; provider client must remain testable without SQLite.

## Verification

```bash
npm test -- server/test/provider
npm run typecheck
```

Both pass.

## Report contract

Write `/Users/sxw/Desktop/workgraph/.superpowers/sdd/task-5-report.md` containing status, files, RED/GREEN evidence, retry/abort decisions, telemetry redaction evidence, self-review and concerns. Return only status, one-line test summary and concerns.
