const CANDIDATE_ID_KEY = 'workgraph:candidateId'
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface CandidateIdStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function createUuid(): string {
  const randomUUID = globalThis.crypto?.randomUUID
  if (typeof randomUUID === 'function') {
    return randomUUID.call(globalThis.crypto)
  }

  const bytes = new Uint8Array(16)
  globalThis.crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

export function getOrCreateCandidateId(
  storage: CandidateIdStorage = localStorage,
  createUuidImpl: () => string = createUuid,
): string {
  try {
    const persisted = storage.getItem(CANDIDATE_ID_KEY)
    if (persisted && UUID_PATTERN.test(persisted)) return persisted
  } catch {
    // 隐私模式下仍使用本次页面生命周期内生成的 UUID。
  }

  const candidateId = createUuidImpl()
  try {
    storage.setItem(CANDIDATE_ID_KEY, candidateId)
  } catch {
    // 存储不可用时降级为当前内存中的候选人 ID。
  }
  return candidateId
}
