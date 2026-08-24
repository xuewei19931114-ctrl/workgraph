import type { ProfileJob } from '../../shared/profile-schemas'

export const analysisStages = [
  '排队并解析资料',
  '提取判断与行为证据',
  '推断 Candidate Model',
  '审阅并校验证据',
  '完成分析',
]

const stageByStatus: Record<ProfileJob['status'], number> = {
  queued: 0,
  parsing: 0,
  extracting: 1,
  inferring: 2,
  criticizing: 3,
  validating: 3,
  completed: 4,
  unresolved: 4,
  failed: 4,
  cancelled: 4,
}

export function analysisStageIndex(status: ProfileJob['status']): number {
  return stageByStatus[status]
}

export function analysisTerminalMessage(
  status: ProfileJob['status'],
): string | null {
  if (status === 'completed') return '分析已完成。'
  if (status === 'unresolved') return '分析已完成，但证据仍不足，结果会保留待确认项。'
  if (status === 'failed') return '分析未能完成。'
  if (status === 'cancelled') return '分析已取消。'
  return null
}
