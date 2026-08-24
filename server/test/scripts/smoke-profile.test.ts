import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { TranscriptSchema } from '../../../shared/profile-schemas.js'
import {
  formatSafeSmokeError,
  smokeCallBudgetFailure,
} from '../../scripts/smoke-profile.js'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const smokeScript = resolve(repoRoot, 'server/scripts/smoke-profile.ts')
const smokeTranscript = resolve(
  repoRoot,
  'test/fixtures/profile-smoke-transcript.json',
)

function runSmoke(env: NodeJS.ProcessEnv) {
  return spawnSync(process.execPath, ['--import', 'tsx', smokeScript], {
    cwd: repoRoot,
    encoding: 'utf8',
    env,
  })
}

describe('profile smoke script', () => {
  it('refuses to run unless GPT56_API_KEY and GPT56_BASE_URL are set', () => {
    const env = { ...process.env, WORKGRAPH_SKIP_DOTENV: '1' }
    delete env.GPT56_API_KEY
    delete env.GPT56_BASE_URL
    const result = runSmoke(env)
    const output = `${result.stdout}${result.stderr}`

    expect(result.status).not.toBe(0)
    expect(output).toMatch(/GPT56_API_KEY/)
    expect(output).toMatch(/GPT56_BASE_URL/)
    expect(output).not.toMatch(/sk-/)
  })

  it('loads only the synthetic smoke transcript fixture', () => {
    const transcript = TranscriptSchema.parse(
      JSON.parse(readFileSync(smokeTranscript, 'utf8')),
    )
    const text = JSON.stringify(transcript)

    expect(transcript.source_type).toBe('synthetic-smoke')
    expect(text.length).toBeLessThan(2000)
    expect(text).not.toMatch(/sk-/)
    expect(text.toLowerCase()).not.toContain('chatgpt.com')
    expect(transcript.conversations).toHaveLength(1)
    expect(
      transcript.conversations[0]!.messages.every(
        (message) => message.content.length < 200,
      ),
    ).toBe(true)
  })

  it('exits nonzero when telemetry records extractor or critic stages', () => {
    const extractorFailure = smokeCallBudgetFailure([
      { stage: 'core' },
      { stage: 'extractor' },
    ])
    const criticFailure = smokeCallBudgetFailure([
      { stage: 'core' },
      { stage: 'critic' },
    ])

    expect(extractorFailure).toEqual(expect.any(String))
    expect(criticFailure).toEqual(expect.any(String))
  })

  it('exits nonzero when core call count is not exactly 1', () => {
    expect(smokeCallBudgetFailure([{ stage: 'core' }])).toBeNull()
    expect(
      smokeCallBudgetFailure([{ stage: 'core' }, { stage: 'json_repair' }]),
    ).toBeNull()
    expect(smokeCallBudgetFailure([])).toEqual(expect.any(String))
    expect(
      smokeCallBudgetFailure([{ stage: 'core' }, { stage: 'core' }]),
    ).toEqual(expect.any(String))
    expect(smokeCallBudgetFailure([{ stage: 'json_repair' }])).toEqual(
      expect.any(String),
    )
    expect(
      smokeCallBudgetFailure([
        { stage: 'core' },
        { stage: 'json_repair' },
        { stage: 'json_repair' },
      ]),
    ).toEqual(expect.any(String))
  })

  it('prints the real catch message and omits api key, prompt, and transcript body', () => {
    const apiKey = 'sk-live-not-a-real-key'
    const prompt = 'HIDDEN_SYSTEM_PROMPT_BODY'
    const transcriptBody = 'SECRET_TRANSCRIPT_LINE'
    const printed = formatSafeSmokeError(
      new Error(
        `Provider timeout using ${apiKey} prompt=${prompt} body=${transcriptBody}`,
      ),
      [apiKey, prompt, transcriptBody],
    )

    expect(printed).toMatch(/Provider timeout/)
    expect(printed).not.toContain(apiKey)
    expect(printed).not.toContain(prompt)
    expect(printed).not.toContain(transcriptBody)
    expect(printed).not.toBe('Paid profile smoke failed.')
  })
})
