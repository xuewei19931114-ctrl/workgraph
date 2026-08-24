import { Modal } from './Modal'

interface Props {
  onClose: () => void
  onConfirm: () => void
}

export function ConfirmClearModal({ onClose, onConfirm }: Props) {
  return (
    <Modal onClose={onClose} label="确认清空职业画像">
      <small className="eyebrow">确认清空职业画像</small>
      <h2>确认清空所有画像？</h2>
      <p className="lead">
        这会永久清除当前账号中 AI 生成的职业标题、职业意图和全部工作特质。
      </p>

      <div className="keep-list">
        <b>会保留</b>
        <span>登录账号、聊天历史、导入记录</span>
      </div>

      <div className="confirm-actions">
        <button onClick={onClose}>取消</button>
        <button className="danger" onClick={onConfirm}>
          确认清空所有画像
        </button>
      </div>
    </Modal>
  )
}
