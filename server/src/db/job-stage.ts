export type JobStatus =
  | 'queued'
  | 'parsing'
  | 'extracting'
  | 'inferring'
  | 'criticizing'
  | 'validating'
  | 'completed'
  | 'unresolved'
  | 'failed'
  | 'cancelled'

const STAGE_PROGRESS: Record<JobStatus, number | null> = {
  queued: 0.05,
  parsing: 0.15,
  extracting: 0.4,
  inferring: 0.7,
  criticizing: 0.85,
  validating: 0.95,
  completed: 1,
  unresolved: 1,
  failed: null,
  cancelled: null,
}

const STAGE_MESSAGE: Record<JobStatus, string> = {
  queued: '任务已排队',
  parsing: '正在解析对话记录',
  extracting: '正在抽取证据',
  inferring: '正在生成画像',
  criticizing: '正在复核结论',
  validating: '正在校验结果',
  completed: '画像已生成',
  unresolved: '证据不足，已给出保守结论',
  failed: '生成失败',
  cancelled: '已取消',
}

export function stageFieldsForStatus(
  status: JobStatus,
  currentProgress: number,
): { progress: number; stageMessage: string } {
  const mapped = STAGE_PROGRESS[status]
  return {
    progress: mapped === null ? currentProgress : Math.max(currentProgress, mapped),
    stageMessage: STAGE_MESSAGE[status],
  }
}
