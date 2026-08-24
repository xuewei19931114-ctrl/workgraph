import { describe, expect, it, vi } from 'vitest'

import { createUuid, getOrCreateCandidateId } from './candidateId'

function memoryStorage(initial?: string) {
  let value = initial ?? null
  return {
    getItem: vi.fn(() => value),
    setItem: vi.fn((_key: string, next: string) => {
      value = next
    }),
  }
}

describe('getOrCreateCandidateId', () => {
  it('returns the persisted candidate UUID', () => {
    const persisted = '11111111-1111-4111-8111-111111111111'
    const storage = memoryStorage(persisted)

    expect(
      getOrCreateCandidateId(
        storage,
        () => '22222222-2222-4222-8222-222222222222',
      ),
    ).toBe(persisted)
    expect(storage.setItem).not.toHaveBeenCalled()
  })

  it('creates and persists a candidate UUID under the canonical key', () => {
    const storage = memoryStorage()
    const created = '22222222-2222-4222-8222-222222222222'

    expect(getOrCreateCandidateId(storage, () => created)).toBe(created)
    expect(storage.setItem).toHaveBeenCalledWith(
      'workgraph:candidateId',
      created,
    )
  })

  it('creates a UUID when crypto.randomUUID is unavailable', () => {
    const original = crypto.randomUUID
    Object.defineProperty(crypto, 'randomUUID', {
      configurable: true,
      value: undefined,
    })
    try {
      expect(createUuid()).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      )
    } finally {
      Object.defineProperty(crypto, 'randomUUID', {
        configurable: true,
        value: original,
      })
    }
  })

  it('replaces and persists a non-UUID candidate ID', () => {
    const storage = memoryStorage('persisted-id')
    const replacement = '33333333-3333-4333-8333-333333333333'

    expect(getOrCreateCandidateId(storage, () => replacement)).toBe(replacement)
    expect(storage.setItem).toHaveBeenCalledWith(
      'workgraph:candidateId',
      replacement,
    )
  })
})
