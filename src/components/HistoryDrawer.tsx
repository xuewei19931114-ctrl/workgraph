import type { Conversation } from '../types'

interface Props {
  conversations: Conversation[]
  activeId: string | null
  onPick: (id: string) => void
  onClose: () => void
}

export function HistoryDrawer({ conversations, activeId, onPick, onClose }: Props) {
  return (
    <div className="overlay sheet" onClick={onClose} role="dialog" aria-modal="true" aria-label="历史对话">
      <div className="drawer-card" onClick={(event) => event.stopPropagation()}>
        <div className="section-head">
          <h2>最近的对话</h2>
          <small>{conversations.length} 个</small>
        </div>

        {conversations.length === 0 ? (
          <p className="empty-profile">还没有保存的对话。</p>
        ) : (
          <div className="history-list">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={conversation.id === activeId ? 'active' : ''}
                onClick={() => onPick(conversation.id)}
              >
                <b>{conversation.title}</b>
                <small>
                  {conversation.messages.length} 条消息 · {formatDate(conversation.createdAt)}
                </small>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function formatDate(at: number): string {
  return new Date(at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}
