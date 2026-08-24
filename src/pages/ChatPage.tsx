import { useEffect, useRef, useState } from 'react'
import { Typewriter } from '../components/Typewriter'
import type { ArchiveStats, ChatMessage } from '../types'

interface Props {
  messages: ChatMessage[]
  thinking: boolean
  totals: ArchiveStats
  hasModel: boolean
  onSend: (text: string) => void
  onNewConversation: () => void
  onOpenHistory: () => void
  onGoImport: () => void
}

const suggestions = [
  { label: '帮我分析适合的方向', prompt: '我正在找工作，但还不知道自己真正适合什么。' },
  { label: '探索创业团队', prompt: '我想加入早期创业团队，帮我判断适合什么角色。' },
  { label: '聊聊最近的困惑', prompt: '我最近在工作里有点内耗，想理清楚问题出在哪。' },
]

export function ChatPage({
  messages,
  thinking,
  totals,
  hasModel,
  onSend,
  onNewConversation,
  onOpenHistory,
  onGoImport,
}: Props) {
  const [draft, setDraft] = useState('')
  const threadRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = threadRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [messages, thinking])

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const text = draft.trim()
    if (!text || thinking) return
    onSend(text)
    setDraft('')
  }

  return (
    <section className="tab-page">
      <div className="mode-pill">
        <span aria-hidden="true">✦</span>
        <p>
          <b>AI 职业智能体已就绪</b>
          <small>
            {totals.conversations > 0
              ? `已连接 ${totals.conversations} 段对话，可结合资料回答`
              : '通过对话继续了解你'}
          </small>
        </p>
        <i />
      </div>

      <div className="agent-hero compact">
        <div className="orb">
          <span />
        </div>
        <h1>理解你的工作方式</h1>
        <p>而不只是你的简历</p>
      </div>

      <div className="chat-toolbar">
        <button onClick={onOpenHistory}>☰ 历史对话</button>
        <button onClick={onNewConversation}>＋ 新对话</button>
      </div>

      <div className="agent-box">
        {messages.length === 0 && !thinking ? (
          <div className="empty-agent">
            <h2>你最近在思考什么工作问题？</h2>
            <p>我会通过追问理解你的特质、兴趣和适合的工作环境。</p>
            <div className="suggestions">
              {suggestions.map((item) => (
                <button key={item.label} onClick={() => onSend(item.prompt)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mini-thread" ref={threadRef}>
            {messages.map((message) => (
              <div key={message.id} className={message.role === 'user' ? 'user' : ''}>
                <span aria-hidden="true">{message.role === 'user' ? '我' : '✦'}</span>
                <p>
                  {message.role === 'agent' && message.animate ? (
                    <Typewriter text={message.text} />
                  ) : (
                    message.text
                  )}
                </p>
              </div>
            ))}
            {thinking && (
              <div>
                <span aria-hidden="true">✦</span>
                <p className="thinking">正在理解和组织证据…</p>
              </div>
            )}
          </div>
        )}

        <form onSubmit={submit}>
          <textarea
            value={draft}
            placeholder="和智能体聊聊你的目标、经历或困惑…"
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) submit(event)
            }}
          />
          <button type="submit" disabled={!draft.trim() || thinking} aria-label="发送">
            ↑
          </button>
        </form>
      </div>

      {!hasModel && (
        <button className="connect-records" onClick={onGoImport}>
          <span aria-hidden="true">⌁</span>
          <p>
            <b>让智能体更了解你</b>
            <small>导入聊天记录，获得有证据的分析</small>
          </p>
          <i aria-hidden="true">›</i>
        </button>
      )}
    </section>
  )
}
