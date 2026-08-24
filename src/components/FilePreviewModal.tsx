import { Modal } from './Modal'
import type { PickedFile } from '../types'

interface Props {
  files: PickedFile[]
  onClose: () => void
  onAdd: (list: FileList | null) => void
  onRemove: (id: string) => void
  onConfirm: () => void
}

const ACCEPT = '.zip,.html,.htm,.txt,.md,.json,.pdf,.doc,.docx'

export function FilePreviewModal({ files, onClose, onAdd, onRemove, onConfirm }: Props) {
  const ready = files.filter((file) => file.status === 'ready')
  const stillReading = files.some((file) => file.status === 'reading')

  return (
    <Modal onClose={onClose} label="确认要分析的聊天记录">
      <small className="eyebrow">导入并分析聊天记录</small>
      <h2>确认要分析的聊天记录</h2>
      <p className="lead">
        文件先在本地解析。只有点击“开始分析”后，归一化后的聊天文本才会发送给 Workgraph 后端和配置的 AI 服务。
        原始文件本身不会上传；报告证据可能保留选中的原文引用和来源 ID。
      </p>

      {files.length === 0 ? (
        <div className="file-empty">
          还没有选择文件
          <br />
          支持 ZIP、HTML、TXT、JSON、DOCX
        </div>
      ) : (
        <div className="file-list">
          {files.map((file) => (
            <div className="file-row" key={file.id}>
              <span>{extensionLabel(file.name)}</span>
              <div>
                <b title={file.name}>{file.name}</b>
                {file.status === 'reading' && <small>正在本地读取…</small>}
                {file.status === 'ready' && (
                  <small>
                    {file.archive?.stats.conversations ?? 0} 段对话 ·{' '}
                    {file.archive?.stats.messages ?? 0} 条消息
                    {' · '}
                    {(file.size / 1024 / 1024).toFixed(1)} MB
                  </small>
                )}
                {file.status === 'error' && <small className="bad">{file.error}</small>}
              </div>
              <button onClick={() => onRemove(file.id)} aria-label={`移除 ${file.name}`}>
                移除
              </button>
            </div>
          ))}
        </div>
      )}

      <label className="add-more">
        <input
          type="file"
          multiple
          accept={ACCEPT}
          onChange={(event) => {
            onAdd(event.target.files)
            event.target.value = ''
          }}
        />
        ＋ 添加更多文件
      </label>

      <div className="local-note">
        <span aria-hidden="true">✓</span>
        <p style={{ margin: 0 }}>
          分析前仍在你的设备里 · {ready.length} 份文件已就绪，可随时移除；点击开始分析后会发送归一化文本
        </p>
      </div>

      <button className="primary-action" disabled={ready.length === 0 || stillReading} onClick={onConfirm}>
        <b>{stillReading ? '正在本地读取…' : '确认，开始生成画像'}</b>
        <small>提取工作特质、证据、适合方向与待确认问题</small>
      </button>
    </Modal>
  )
}

function extensionLabel(name: string): string {
  const ext = name.slice(name.lastIndexOf('.') + 1).toUpperCase()
  return ext.length > 4 ? 'FILE' : ext
}
