import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { loadOptionalEnvFile, loadOptionalEnvFiles } from '../src/load-env.js'

const directories: string[] = []

afterEach(() => {
  while (directories.length > 0) {
    rmSync(directories.pop()!, { recursive: true, force: true })
  }
})

describe('loadOptionalEnvFile', () => {
  it('fills missing keys from a dotenv file without logging values', () => {
    const directory = mkdtempSync(join(tmpdir(), 'workgraph-env-'))
    directories.push(directory)
    const filePath = join(directory, '.env')
    writeFileSync(
      filePath,
      ['GPT56_API_KEY=from-file', 'GPT56_BASE_URL=https://proxy.example', ''].join(
        '\n',
      ),
    )
    const env: NodeJS.ProcessEnv = { GPT56_BASE_URL: 'https://already-set.example' }

    loadOptionalEnvFile(filePath, env)

    expect(env.GPT56_API_KEY).toBe('from-file')
    expect(env.GPT56_BASE_URL).toBe('https://already-set.example')
  })

  it('ignores a missing env file', () => {
    const env: NodeJS.ProcessEnv = {}
    expect(() =>
      loadOptionalEnvFile('/tmp/workgraph-missing-env-file-does-not-exist.env', env),
    ).not.toThrow()
    expect(env).toEqual({})
  })

  it('skips dotenv files when WORKGRAPH_SKIP_DOTENV=1', () => {
    const directory = mkdtempSync(join(tmpdir(), 'workgraph-env-skip-'))
    directories.push(directory)
    const filePath = join(directory, '.env')
    writeFileSync(filePath, 'GPT56_API_KEY=from-file\n')
    const env: NodeJS.ProcessEnv = { WORKGRAPH_SKIP_DOTENV: '1' }

    loadOptionalEnvFiles(env, [filePath])
    expect(env.GPT56_API_KEY).toBeUndefined()
  })
})
