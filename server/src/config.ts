import { z } from 'zod'

import {
  CORE_INFERENCE_PROMPT_VERSIONS,
  DEFAULT_CORE_INFERENCE_PROMPT_VERSION,
  type CoreInferencePromptVersion,
} from './prompts/core-inference.js'

export interface ServerConfig {
  host: string
  port: number
  baseUrl: string
  apiKey: string
  model: 'openai.gpt-5.6-sol'
  reasoningEffort: 'high'
  timeoutMs: number
  maxOutputTokens: number
  contextTokenLimit: number
  extractorConcurrency: number
  enableCritic: boolean
  corePromptVersion: CoreInferencePromptVersion
  dbPath: string
  transcriptRetentionDays: number
  bodyLimit?: number
}

const positiveInteger = z.coerce.number().int().positive()

const envSchema = z.object({
  HOST: z.string().min(1).default('127.0.0.1'),
  PORT: positiveInteger.max(65535).default(8787),
  GPT56_BASE_URL: z
    .url()
    .refine((value) => {
      const protocol = new URL(value).protocol
      return protocol === 'http:' || protocol === 'https:'
    }, 'must use HTTP or HTTPS')
    .default('https://api.openai.com/v1'),
  GPT56_API_KEY: z.string().min(1),
  GPT56_MODEL: z.literal('openai.gpt-5.6-sol').default('openai.gpt-5.6-sol'),
  GPT56_REASONING_EFFORT: z.literal('high').default('high'),
  GPT56_TIMEOUT_MS: positiveInteger.default(600000),
  GPT56_MAX_OUTPUT_TOKENS: positiveInteger.default(64000),
  PROFILE_CONTEXT_TOKEN_LIMIT: positiveInteger.default(400000),
  PROFILE_EXTRACTOR_CONCURRENCY: positiveInteger.default(3),
  PROFILE_ENABLE_CRITIC: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .default(false),
  CORE_INFERENCE_PROMPT_VERSION: z
    .enum(CORE_INFERENCE_PROMPT_VERSIONS)
    .default(DEFAULT_CORE_INFERENCE_PROMPT_VERSION),
  WORKGRAPH_DB_PATH: z.string().min(1).default('server/data/workgraph.db'),
  TRANSCRIPT_RETENTION_DAYS: positiveInteger.default(7),
  PROFILE_MAX_BODY_BYTES: positiveInteger.default(10 * 1024 * 1024),
})

export function applyVercelDefaults(
  env: NodeJS.ProcessEnv = process.env,
): void {
  if (env.VERCEL !== '1') return
  if (env.WORKGRAPH_DB_PATH === undefined || env.WORKGRAPH_DB_PATH === '') {
    env.WORKGRAPH_DB_PATH = '/tmp/workgraph.db'
  }
}

function isRailway(env: NodeJS.ProcessEnv): boolean {
  return (
    env.RAILWAY_ENVIRONMENT !== undefined ||
    env.RAILWAY_PROJECT_ID !== undefined
  )
}

export function applyPlatformDefaults(
  env: NodeJS.ProcessEnv = process.env,
): void {
  applyVercelDefaults(env)
  if (!isRailway(env)) return
  if (
    env.HOST === undefined ||
    env.HOST === '' ||
    env.HOST === '127.0.0.1' ||
    env.HOST === 'localhost'
  ) {
    env.HOST = '0.0.0.0'
  }
  if (env.WORKGRAPH_DB_PATH === undefined || env.WORKGRAPH_DB_PATH === '') {
    env.WORKGRAPH_DB_PATH = '/tmp/workgraph.db'
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const result = envSchema.safeParse(env)

  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ')
    throw new Error(`Invalid server configuration: ${details}`)
  }

  return {
    host: result.data.HOST,
    port: result.data.PORT,
    baseUrl: result.data.GPT56_BASE_URL,
    apiKey: result.data.GPT56_API_KEY,
    model: result.data.GPT56_MODEL,
    reasoningEffort: result.data.GPT56_REASONING_EFFORT,
    timeoutMs: result.data.GPT56_TIMEOUT_MS,
    maxOutputTokens: result.data.GPT56_MAX_OUTPUT_TOKENS,
    contextTokenLimit: result.data.PROFILE_CONTEXT_TOKEN_LIMIT,
    extractorConcurrency: result.data.PROFILE_EXTRACTOR_CONCURRENCY,
    enableCritic: result.data.PROFILE_ENABLE_CRITIC,
    corePromptVersion: result.data.CORE_INFERENCE_PROMPT_VERSION,
    dbPath: result.data.WORKGRAPH_DB_PATH,
    transcriptRetentionDays: result.data.TRANSCRIPT_RETENTION_DAYS,
    bodyLimit: result.data.PROFILE_MAX_BODY_BYTES,
  }
}
