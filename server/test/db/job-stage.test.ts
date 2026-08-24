import { describe, expect, it } from 'vitest'

import {
  stageFieldsForStatus,
  type JobStatus,
} from '../../src/db/job-stage.js'

describe('stageFieldsForStatus', () => {
  it.each([
    ['queued', 0.05, '任务已排队'],
    ['parsing', 0.15, '正在解析对话记录'],
    ['extracting', 0.4, '正在抽取证据'],
    ['inferring', 0.7, '正在生成画像'],
    ['criticizing', 0.85, '正在复核结论'],
    ['validating', 0.95, '正在校验结果'],
    ['completed', 1, '画像已生成'],
    ['unresolved', 1, '证据不足，已给出保守结论'],
  ] as const)('maps %s to monotonic progress and a Chinese message', (status, progress, message) => {
    expect(stageFieldsForStatus(status, 0)).toEqual({
      progress,
      stageMessage: message,
    })
  })

  it.each(['failed', 'cancelled'] as const)(
    'keeps the last progress for %s and still writes a Chinese message',
    (status) => {
      expect(stageFieldsForStatus(status, 0.7)).toEqual({
        progress: 0.7,
        stageMessage:
          status === 'failed' ? '生成失败' : '已取消',
      })
    },
  )

  it('does not let a later stage rewind progress', () => {
    expect(stageFieldsForStatus('parsing', 0.5).progress).toBe(0.5)
  })
})

const ordered: JobStatus[] = [
  'queued',
  'parsing',
  'extracting',
  'inferring',
  'criticizing',
  'validating',
  'completed',
]

describe('stage progress monotonicity', () => {
  it('increases through live stages', () => {
    const values = ordered.map((status) => stageFieldsForStatus(status, 0).progress)
    for (let index = 1; index < values.length; index += 1) {
      expect(values[index]!).toBeGreaterThan(values[index - 1]!)
    }
  })
})
