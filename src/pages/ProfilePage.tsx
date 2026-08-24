import type { Account, ArchiveStats, CareerProfile, Confidence, ImportRecord } from '../types'

interface Props {
  account: Account | null
  profile: CareerProfile | null
  records: ImportRecord[]
  totals: ArchiveStats
  onRequireLogin: () => void
  onLogout: () => void
  onClearProfile: () => void
  onOpenReport: () => void
  onGoImport: () => void
  onGoChat: () => void
  hasModel: boolean
}

const confidenceLabel: Record<Confidence, string> = {
  high: '高置信度',
  medium: '中等置信度',
  unknown: '待进一步验证',
}

export function ProfilePage({
  account,
  profile,
  records,
  totals,
  onRequireLogin,
  onLogout,
  onClearProfile,
  onOpenReport,
  onGoImport,
  onGoChat,
  hasModel,
}: Props) {
  return (
    <section className="tab-page">
      <div className="profile-hero">
        <span aria-hidden="true">{profile?.initials ?? 'WG'}</span>
        <h1>{profile?.title ?? 'Workgraph 看到的你'}</h1>
        <p>{profile?.intent ?? (hasModel ? 'AI 画像 · 可追溯' : '等待生成画像')}</p>
        {profile && <button onClick={onOpenReport}>查看完整 Candidate Model</button>}
      </div>

      <section className="profile-section">
        <div className="section-head">
          <h2>工作特质</h2>
          <small>{profile ? 'AI 画像 · 可追溯' : '等待生成画像'}</small>
        </div>

        {profile ? (
          profile.traits.map((trait) => (
            <div className="trait" key={trait.title}>
              <b>{trait.title}</b>
              <p>{trait.detail}</p>
              <span>
                {confidenceLabel[trait.confidence]} · 证据来自 {trait.evidence}
              </span>
            </div>
          ))
        ) : (
          <>
            <p className="empty-profile">
              导入聊天记录，或先和职业智能体聊一聊，再生成你的真实职业画像。
            </p>
            <div className="empty-profile-actions">
              <button onClick={onGoChat}>去和智能体聊聊</button>
              <button onClick={onGoImport}>生成职业画像</button>
            </div>
          </>
        )}
      </section>

      <section className="profile-section">
        <div className="section-head">
          <h2>资料与证据</h2>
          <small>{account ? '已登录' : '未登录'}</small>
        </div>
        <div className="trait">
          <b>{totals.conversations} 段聊天记录</b>
          <p>
            {account
              ? `当前账号：${account.email}${account.provider === 'guest' ? '（体验模式）' : ''}`
              : '登录后自动恢复历史记录'}
          </p>
          <span>原始 ZIP 不落库，画像按账号隔离</span>
        </div>
      </section>

      <section className="profile-section">
        <div className="section-head">
          <h2>导入记录</h2>
          <small>{records.length} 条</small>
        </div>
        {records.length === 0 ? (
          <p className="empty-profile">尚未导入资料。</p>
        ) : (
          records.map((record) => (
            <div className="record-row" key={record.id}>
              <div>
                <b>{record.name}</b>
                <small>
                  {record.stats.conversations} 段对话 · {record.stats.messages} 条消息
                </small>
              </div>
              <i>{new Date(record.at).toLocaleDateString('zh-CN')}</i>
            </div>
          ))
        )}
      </section>

      <div className="settings">
        <button className="danger" onClick={onClearProfile}>
          <span aria-hidden="true">⌫</span>
          <p>
            <b>一键清空所有画像</b>
            <small>保留聊天与导入记录，重新开始职业分析</small>
          </p>
          <i aria-hidden="true">›</i>
        </button>
        <button onClick={account ? onLogout : onRequireLogin}>
          <span aria-hidden="true">{account ? '⏻' : '→'}</span>
          <p>
            <b>{account ? '退出登录' : '登录后开启你的专属体验'}</b>
            <small>
              {account
                ? '退出后本设备仍保留数据，可再次登录恢复'
                : '邮箱或 ChatGPT 登录，无需设置新的用户名或密码'}
            </small>
          </p>
          <i aria-hidden="true">›</i>
        </button>
      </div>
    </section>
  )
}
