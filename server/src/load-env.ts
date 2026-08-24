import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

function parseEnvLine(line: string): readonly [string, string] | null {
  const trimmed = line.trim()
  if (trimmed.length === 0 || trimmed.startsWith('#')) return null
  const withoutExport = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trim()
    : trimmed
  const separator = withoutExport.indexOf('=')
  if (separator <= 0) return null
  const key = withoutExport.slice(0, separator).trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null
  let value = withoutExport.slice(separator + 1).trim()
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1)
  }
  return [key, value]
}

export function applyEnvFileContents(
  contents: string,
  env: NodeJS.ProcessEnv,
): void {
  for (const line of contents.split(/\r?\n/)) {
    const parsed = parseEnvLine(line)
    if (parsed === null) continue
    const [key, value] = parsed
    if (env[key] === undefined) env[key] = value
  }
}

export function defaultEnvFilePaths(): string[] {
  return [
    resolve(process.cwd(), 'server/.env'),
    resolve(fileURLToPath(new URL('../.env', import.meta.url))),
  ]
}

export function loadOptionalEnvFile(
  filePath: string,
  env: NodeJS.ProcessEnv = process.env,
  readFile: (path: string) => string = (path) => readFileSync(path, 'utf8'),
): void {
  try {
    applyEnvFileContents(readFile(filePath), env)
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return
    }
    throw error
  }
}

export function loadOptionalEnvFiles(
  env: NodeJS.ProcessEnv = process.env,
  filePaths: readonly string[] = defaultEnvFilePaths(),
): void {
  if (env.WORKGRAPH_SKIP_DOTENV === '1') return
  const seen = new Set<string>()
  for (const filePath of filePaths) {
    if (seen.has(filePath)) continue
    seen.add(filePath)
    loadOptionalEnvFile(filePath, env)
  }
}
