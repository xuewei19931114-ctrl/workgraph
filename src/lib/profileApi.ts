import { z } from 'zod'

import {
  CreateProfileJobRequestSchema,
  ProfileJobSchema,
  ProfileModelResponseSchema,
  type ProfileJob,
  type ProfileModelResponse,
} from '../../shared/profile-schemas'

const CreateJobResponseSchema = z
  .object({
    jobId: z.string().min(1),
    status: z.enum([
      'queued',
      'parsing',
      'extracting',
      'inferring',
      'criticizing',
      'validating',
      'completed',
      'unresolved',
      'failed',
      'cancelled',
    ]),
  })
  .passthrough()

const ApiErrorSchema = z
  .object({
    error: z
      .object({
        code: z.string().min(1),
        message: z.string().min(1),
      })
      .strict(),
  })
  .passthrough()

type CreateProfileJobRequest = z.infer<typeof CreateProfileJobRequestSchema>

export class ProfileApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ProfileApiError'
    this.status = status
    this.code = code
  }
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new ProfileApiError(
      response.status,
      'INVALID_RESPONSE',
      '服务器返回了无法识别的响应。',
    )
  }
}

async function fetchResponse(
  input: string,
  init: RequestInit,
): Promise<Response> {
  try {
    return await fetch(input, init)
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ProfileApiError(0, 'NETWORK_ERROR', '无法连接到 Workgraph 后端。')
  }
}

function throwResponseError(response: Response, body: unknown): never {
  const safeError = ApiErrorSchema.safeParse(body)
  throw new ProfileApiError(
    response.status,
    safeError.success ? safeError.data.error.code : 'HTTP_ERROR',
    safeError.success ? safeError.data.error.message : '请求未能完成，请稍后重试。',
  )
}

async function requestJson<T>(
  input: string,
  init: RequestInit,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetchResponse(input, init)
  const body = await readJson(response)
  if (!response.ok) throwResponseError(response, body)

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ProfileApiError(
      response.status,
      'INVALID_RESPONSE',
      '服务器返回了不符合约定的数据。',
    )
  }
  return parsed.data
}

async function requestProfileJob(
  input: string,
  init: RequestInit,
): Promise<ProfileJob> {
  const response = await fetchResponse(input, init)
  const body = await readJson(response)
  const job = ProfileJobSchema.safeParse(body)
  if (job.success) return job.data
  if (!response.ok) throwResponseError(response, body)
  throw new ProfileApiError(
    response.status,
    'INVALID_RESPONSE',
    '服务器返回了不符合约定的数据。',
  )
}

export async function createProfileJob(
  request: CreateProfileJobRequest,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<{ jobId: string }> {
  const body = CreateProfileJobRequestSchema.parse(request)
  const result = await requestJson(
    '/api/profile/jobs',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(body),
      signal,
    },
    CreateJobResponseSchema,
  )
  return { jobId: result.jobId }
}

export function getProfileJob(
  jobId: string,
  signal?: AbortSignal,
): Promise<ProfileJob> {
  return requestProfileJob(
    `/api/profile/jobs/${encodeURIComponent(jobId)}`,
    { signal },
  )
}

export function cancelProfileJob(jobId: string): Promise<ProfileJob> {
  return requestProfileJob(
    `/api/profile/jobs/${encodeURIComponent(jobId)}`,
    { method: 'DELETE' },
  )
}

export function cancelProfileJobOnUnload(jobId: string): void {
  void fetch(`/api/profile/jobs/${encodeURIComponent(jobId)}`, {
    method: 'DELETE',
    keepalive: true,
  }).catch(() => undefined)
}

export function deleteProfileModels(
  candidateId: string,
): Promise<{ deleted: number }> {
  return requestJson(
    `/api/profile/models?candidateId=${encodeURIComponent(candidateId)}`,
    { method: 'DELETE' },
    z.object({ deleted: z.number().int().nonnegative() }),
  )
}

export function getProfileModel(
  modelId: string,
  signal?: AbortSignal,
): Promise<ProfileModelResponse> {
  return requestJson(
    `/api/profile/models/${encodeURIComponent(modelId)}`,
    { signal },
    ProfileModelResponseSchema,
  )
}

const TERMINAL_STATUSES = new Set<ProfileJob['status']>([
  'completed',
  'unresolved',
  'failed',
  'cancelled',
])
const TRANSIENT_STATUSES = new Set([502, 503, 504])

function abortError(): DOMException {
  return new DOMException('The operation was aborted.', 'AbortError')
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        reject(abortError())
      },
      { once: true },
    )
  })
}

export interface PollProfileJobOptions {
  intervalMs?: number
  signal?: AbortSignal
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  onUpdate?: (job: ProfileJob) => void
}

function isTransient(error: unknown): boolean {
  return (
    error instanceof ProfileApiError &&
    (error.code === 'NETWORK_ERROR' || TRANSIENT_STATUSES.has(error.status))
  )
}

export async function pollProfileJob(
  jobId: string,
  options: PollProfileJobOptions = {},
): Promise<ProfileJob> {
  const intervalMs = options.intervalMs ?? 1000
  const sleep = options.sleep ?? defaultSleep
  let transientFailures = 0

  while (true) {
    if (options.signal?.aborted) throw abortError()
    try {
      const job = await getProfileJob(jobId, options.signal)
      transientFailures = 0
      options.onUpdate?.(job)
      if (TERMINAL_STATUSES.has(job.status)) return job
    } catch (error) {
      if (!isTransient(error) || transientFailures >= 1) throw error
      transientFailures += 1
    }
    if (options.signal?.aborted) throw abortError()
    await sleep(intervalMs, options.signal)
  }
}
