import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ProfileJob } from '../../shared/profile-schemas'
import {
  ProfileApiError,
  cancelProfileJob,
  cancelProfileJobOnUnload,
  createProfileJob,
  deleteProfileModels,
  getProfileJob,
  getProfileModel,
  pollProfileJob,
} from './profileApi'

const request = {
  candidateId: 'candidate-1',
  transcript: {
    candidate_id: 'candidate-1',
    source_type: 'merged',
    conversations: [],
  },
  options: { enableCritic: false },
}

function job(status: ProfileJob['status'], progress = 0): ProfileJob {
  return {
    jobId: 'job-1',
    status,
    progress,
    stageMessage: `stage:${status}`,
    modelId: status === 'completed' || status === 'unresolved' ? 'model-1' : null,
    criticVerdict: null,
    error:
      status === 'failed'
        ? { code: 'PROVIDER_FAILED', message: '模型服务暂时不可用。' }
        : status === 'cancelled'
          ? { code: 'CANCELLED', message: '任务已取消。' }
          : null,
  }
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const modelResponse = {
  candidateModel: {
    working_archetype: {
      name_cn: '待验证',
      name_en: 'Unresolved',
      definition: 'Insufficient evidence.',
      explanatory_confidence: 0.2,
      outcome_validation_confidence: 0.2,
      evidence_status: 'unknown',
      claim_polarity: 'neutral',
      supporting_evidence_ids: [],
    },
    core_loop: [],
    why_different: {
      claim: 'Insufficient evidence.',
      evidence_status: 'unknown',
      claim_polarity: 'neutral',
      confidence: 0.2,
      supporting_evidence_ids: [],
    },
    high_signal_episodes: [],
    mechanisms: [],
    capabilities: [],
    archetype_competition_winner: null,
    archetype_competition: [],
    strongest_counterargument: {
      argument: 'Insufficient evidence.',
      what_it_explains: '',
      what_it_fails_to_explain: '',
      why_it_does_or_does_not_win: '',
      evidence_status: 'unknown',
      claim_polarity: 'neutral',
      confidence: 0.2,
      supporting_evidence_ids: [],
    },
    strength_risk_pairs: [],
    role_fit: [],
    evidence_boundaries: [],
    hiring_manager_summary: {
      claims: [
        {
          claim: 'More evidence is required.',
          evidence_status: 'unknown',
          claim_polarity: 'neutral',
          confidence: 0.2,
          supporting_evidence_ids: [],
        },
      ],
      seniority_claims: [],
    },
  },
  uiModel: {
    generatedAt: 1,
    headline: 'More evidence required',
    thesis: 'No supported conclusion yet.',
    dimensionCount: 0,
    sourceLabel: 'test',
    unknownCount: 1,
    dimensions: [],
    cannotProve: [],
    capabilities: [],
    strengths: [],
    risks: [],
    riskNote: 'Unknown is not weakness.',
    roles: [],
    nextQuestions: [],
  },
  critic: null,
  status: 'unresolved',
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('profile API client', () => {
  it('creates a profile job with an idempotency key', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ jobId: 'job-1', status: 'queued' }, 202),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(createProfileJob(request, 'idem-1')).resolves.toEqual({
      jobId: 'job-1',
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile/jobs',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'idem-1' }),
      }),
    )
  })

  it('accepts an idempotent retry whose existing job already advanced', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ jobId: 'job-existing', status: 'inferring' }, 202),
        ),
    )

    await expect(createProfileJob(request, 'idem-retry')).resolves.toEqual({
      jobId: 'job-existing',
    })
  })

  it.each([
    [400, 'INVALID_TRANSCRIPT'],
    [409, 'IDEMPOTENCY_CONFLICT'],
    [413, 'TRANSCRIPT_TOO_LARGE'],
  ])('preserves safe API errors from status %i', async (status, code) => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({ error: { code, message: `safe:${code}` } }, status),
      ),
    )

    await expect(createProfileJob(request, 'idem-1')).rejects.toMatchObject({
      name: 'ProfileApiError',
      status,
      code,
      message: `safe:${code}`,
    })
  })

  it('polls queued through inferring until completed', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(job('queued', 0)))
      .mockResolvedValueOnce(jsonResponse(job('inferring', 0.6)))
      .mockResolvedValueOnce(jsonResponse(job('completed', 1)))
    vi.stubGlobal('fetch', fetchMock)
    const statuses: ProfileJob['status'][] = []

    const result = await pollProfileJob('job-1', {
      sleep: async () => {},
      onUpdate: (next) => statuses.push(next.status),
    })

    expect(result.status).toBe('completed')
    expect(statuses).toEqual(['queued', 'inferring', 'completed'])
  })

  it.each(['unresolved', 'failed', 'cancelled'] as const)(
    'stops polling on %s',
    async (status) => {
      const httpStatus = status === 'failed' ? 502 : status === 'cancelled' ? 499 : 200
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse(job(status, 1), httpStatus))
      vi.stubGlobal('fetch', fetchMock)

      await expect(
        pollProfileJob('job-1', { sleep: async () => {} }),
      ).resolves.toMatchObject({ status })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    },
  )

  it('retries one transient GET failure and then succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'UPSTREAM', message: 'retry' } }, 503))
      .mockResolvedValueOnce(jsonResponse(job('completed', 1)))
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      pollProfileJob('job-1', { sleep: async () => {} }),
    ).resolves.toMatchObject({ status: 'completed' })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('exposes a repeated transient GET failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockImplementation(async () =>
          jsonResponse({ error: { code: 'UPSTREAM', message: 'still unavailable' } }, 502),
        ),
    )

    await expect(
      pollProfileJob('job-1', { sleep: async () => {} }),
    ).rejects.toMatchObject({
      name: 'ProfileApiError',
      status: 502,
      message: 'still unavailable',
    })
  })

  it('never retries a 4xx GET failure', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({ error: { code: 'JOB_NOT_FOUND', message: 'missing' } }, 404),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      pollProfileJob('job-1', { sleep: async () => {} }),
    ).rejects.toBeInstanceOf(ProfileApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('aborts polling without sending DELETE', async () => {
    const controller = new AbortController()
    const fetchMock = vi.fn().mockImplementation(async (_url, init?: RequestInit) => {
      expect(init?.method).toBeUndefined()
      controller.abort()
      return jsonResponse(job('queued', 0))
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      pollProfileJob('job-1', {
        signal: controller.signal,
        sleep: async () => {},
      }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('sends DELETE only for explicit cancellation', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(job('cancelled', 1), 499))
    vi.stubGlobal('fetch', fetchMock)

    await expect(cancelProfileJob('job-1')).resolves.toMatchObject({
      status: 'cancelled',
    })
    expect(fetchMock).toHaveBeenCalledWith('/api/profile/jobs/job-1', {
      method: 'DELETE',
    })
  })

  it('rejects malformed successful responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse({ jobId: 'job-1', progress: 2 })),
    )

    await expect(getProfileJob('job-1')).rejects.toMatchObject({
      name: 'ProfileApiError',
      code: 'INVALID_RESPONSE',
    })
  })

  it('gets and validates the canonical and UI models', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(modelResponse))
    vi.stubGlobal('fetch', fetchMock)

    await expect(getProfileModel('model/1')).resolves.toEqual(modelResponse)
    expect(fetchMock).toHaveBeenCalledWith('/api/profile/models/model%2F1', {
      signal: undefined,
    })
  })

  it('deletes stored models for a candidate', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ deleted: 2 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(deleteProfileModels('candidate/1')).resolves.toEqual({
      deleted: 2,
    })
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/profile/models?candidateId=candidate%2F1',
      { method: 'DELETE' },
    )
  })

  it('cancels an in-flight job on unload with keepalive DELETE', () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(job('cancelled', 1), 499))
    vi.stubGlobal('fetch', fetchMock)

    cancelProfileJobOnUnload('job/1')

    expect(fetchMock).toHaveBeenCalledWith('/api/profile/jobs/job%2F1', {
      method: 'DELETE',
      keepalive: true,
    })
  })
})
