# Task 1: Workspace Tooling and Fastify Bootstrap

## Binding global constraints

- Work in `/Users/sxw/Desktop/workgraph`.
- Do not initialize Git or create commits.
- Use TDD: write tests first, run them and observe the expected failure, then implement.
- API keys must never enter source, fixtures, logs, SQLite, or browser code.
- Model is fixed to `openai.gpt-5.6-sol`; reasoning effort defaults to `high`.
- This task is bootstrap only; do not implement inference, database, profile routes, frontend integration, chat, jobs, or auth.

## Files

- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `tsconfig.server.json`
- Create: `vitest.config.ts`
- Create: `server/src/config.ts`
- Create: `server/src/app.ts`
- Create: `server/src/index.ts`
- Create: `server/.env.example`
- Modify: `.gitignore`
- Test: `server/test/config.test.ts`
- Test: `server/test/health.test.ts`

## Interfaces

```ts
loadConfig(env?: NodeJS.ProcessEnv): ServerConfig
buildApp(deps?: AppDependencies): Promise<FastifyInstance>
```

`ServerConfig`:

```ts
interface ServerConfig {
  host: string
  port: number
  baseUrl: string
  apiKey: string
  model: 'openai.gpt-5.6-sol'
  reasoningEffort: 'high'
  timeoutMs: number
  contextTokenLimit: number
  extractorConcurrency: number
  enableCritic: boolean
  dbPath: string
  transcriptRetentionDays: number
}
```

Reject a missing API key, a non-HTTP URL, non-positive limits, and any model other than `openai.gpt-5.6-sol`.

## Required implementation

1. Install runtime dependencies with the package manager:

```bash
npm install fastify @fastify/cors zod better-sqlite3
npm install -D @types/better-sqlite3 tsx vitest concurrently
```

2. Add scripts:

```json
{
  "dev": "concurrently -k \"npm:dev:web\" \"npm:dev:server\"",
  "dev:web": "vite",
  "dev:server": "tsx watch server/src/index.ts",
  "build": "tsc -b && tsc -p tsconfig.server.json && vite build",
  "typecheck": "tsc -b && tsc -p tsconfig.server.json --noEmit",
  "test": "vitest run",
  "test:watch": "vitest",
  "smoke:profile": "tsx server/scripts/smoke-profile.ts"
}
```

3. Write configuration tests first:

```ts
expect(() => loadConfig({})).toThrow(/GPT56_API_KEY/)
expect(loadConfig(validEnv).model).toBe('openai.gpt-5.6-sol')
expect(loadConfig(validEnv).reasoningEffort).toBe('high')
expect(loadConfig(validEnv).enableCritic).toBe(false)
```

Run `npm test -- server/test/config.test.ts`; record the expected failure in the report.

4. Implement strict config parsing.

5. Write the health test:

```ts
const app = await buildApp({ config: testConfig })
const response = await app.inject({ method: 'GET', url: '/api/health' })
expect(response.statusCode).toBe(200)
expect(response.json()).toEqual({ ok: true })
```

`server/src/index.ts` is the only file allowed to call `app.listen`.

6. `server/.env.example` contains names and safe placeholders only. Add these ignores:

```gitignore
.env
.env.*
!server/.env.example
server/data/
*.db
*.db-shm
*.db-wal
```

7. Final verification:

```bash
npm run typecheck
npm test -- server/test/config.test.ts server/test/health.test.ts
```

Both commands must pass without warnings caused by this task.

## Report contract

Write `/Users/sxw/Desktop/workgraph/.superpowers/sdd/task-1-report.md` containing:

- status: `DONE`, `DONE_WITH_CONCERNS`, `NEEDS_CONTEXT`, or `BLOCKED`;
- files changed;
- RED test commands and exact reason each failed;
- GREEN verification commands and concise results;
- self-review findings;
- concerns or deviations.

Return only status, one-line test summary, and concerns to the parent.
