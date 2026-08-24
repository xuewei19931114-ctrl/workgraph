import { afterEach, describe, expect, it, vi } from 'vitest'

import { sha256Hex } from './sha256'

describe('sha256Hex', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('matches the empty-string and abc test vectors', async () => {
    await expect(sha256Hex('')).resolves.toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    )
    await expect(sha256Hex('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('keeps the same digest when Web Crypto Subtle is unavailable', async () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues })

    await expect(sha256Hex('abc')).resolves.toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
    await expect(sha256Hex('json:0:Synthetic title')).resolves.toBe(
      'b65d90a5e58f8e2516c120204cdd35d4b6782b40eb2ed88e9fcc704c540260bb',
    )
  })
})
