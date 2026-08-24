import { afterEach, describe, expect, it, vi } from 'vitest'

import { ProfileApiError } from './profileApi'
import { requestAgentChat } from './agentApi'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('requestAgentChat', () => {
  it('posts conversation turns and returns the reply', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ reply: '能举一个最近的具体例子吗？' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await expect(
      requestAgentChat({
        messages: [{ role: 'user', content: '我适合什么工作？' }],
        profile: null,
      }),
    ).resolves.toEqual({ reply: '能举一个最近的具体例子吗？' })

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/agent/chat',
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('surfaces a provider rejection', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'PROVIDER_REJECTED', message: '智能体暂时无法回复。' },
          }),
          { status: 502, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    )

    await expect(
      requestAgentChat({
        messages: [{ role: 'user', content: '你好' }],
        profile: null,
      }),
    ).rejects.toMatchObject({
      name: 'ProfileApiError',
      code: 'PROVIDER_REJECTED',
    } satisfies Partial<ProfileApiError>)
  })
})
