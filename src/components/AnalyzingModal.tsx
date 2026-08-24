import { Modal } from './Modal'
import {
  analysisStageIndex,
  analysisStages,
  analysisTerminalMessage,
} from '../data/analysis'
import type { ProfileJob } from '../types'

interface Props {
  job: ProfileJob
  fileCount: number
  cancelling: boolean
  onCancel: () => void
}

const terminalStatuses = new Set<ProfileJob['status']>([
  'completed',
  'unresolved',
  'failed',
  'cancelled',
])

export function AnalyzingModal({ job, fileCount, cancelling, onCancel }: Props) {
  const progress = Math.round(job.progress * 100)
  const activeStage = analysisStageIndex(job.status)
  const terminal = terminalStatuses.has(job.status)
  const terminalMessage = analysisTerminalMessage(job.status)
  return (
    <Modal onClose={() => {}} dismissible={false} label="正在建立你的 Candidate Model">
      <div className="analyzing-card" aria-live="polite" aria-atomic="true">
        <div className="orb">
          <span />
        </div>
        <h2>正在建立你的 Candidate Model</h2>
        <p>智能体正在跨 {fileCount} 份文件寻找反复出现、能被证据支持的工作信号。</p>

        <div className="progress-rail">
          <div style={{ width: `${progress}%` }} />
        </div>
        <div className="progress-meta">
          <span>{progress}%</span>
          <span>{terminalMessage ?? '后端正在分析真实资料'}</span>
        </div>

        <p className="narration">{job.stageMessage}</p>

        <div className="stage-list">
          {analysisStages.map((stage, index) => {
            const state = index < activeStage ? 'done' : index === activeStage ? 'active' : ''
            return (
              <div className={state} key={stage}>
                <i>{index < activeStage ? '✓' : index + 1}</i>
                <span>{stage}</span>
              </div>
            )
          })}
        </div>

        <p className="analyzing-note">
          进度来自后端实际阶段。取消只会在你明确点击后发送给服务器。
        </p>
        <button
          className="primary-action"
          disabled={cancelling || terminal}
          onClick={onCancel}
        >
          {cancelling ? '正在取消…' : '取消分析'}
        </button>
      </div>
    </Modal>
  )
}
