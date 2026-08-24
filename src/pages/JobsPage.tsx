import { dailyJobs } from '../data/jobs'
import type { ArchiveStats, Job } from '../types'

interface Props {
  totals: ArchiveStats
  hasModel: boolean
  savedIds: string[]
  onAskAgent: (job: Job) => void
  onToggleSave: (job: Job) => void
}

export function JobsPage({ totals, hasModel, savedIds, onAskAgent, onToggleSave }: Props) {
  return (
    <section className="tab-page">
      <div className="page-title">
        <small>DAILY MATCH · 今日已更新</small>
        <h1>今天，只看这 3 个岗位</h1>
        <p>
          智能体根据你的真实工作证据筛选。不是职位海洋，而是三个值得认真了解的机会。
        </p>
      </div>

      <div className="daily-status">
        <span aria-hidden="true">◈</span>
        <p>
          <b>推荐依据</b>
          <small>
            {hasModel
              ? `来自 ${totals.conversations} 段对话与你确认的画像`
              : '当前为示例推荐，导入记录后将根据你的画像更新'}
          </small>
        </p>
        <i>每日 09:00</i>
      </div>

      <div className="job-list">
        {dailyJobs.map((job) => {
          const saved = savedIds.includes(job.id)
          return (
            <article key={job.id}>
              <header>
                <span aria-hidden="true">{job.badge}</span>
                <p>
                  <small>{job.company}</small>
                  <b>{job.role}</b>
                  <em>{job.meta}</em>
                </p>
                <i>
                  {job.match}%<small>匹配</small>
                </i>
              </header>

              <div className="match-reason">
                <small>为什么推荐给你</small>
                <p>{job.reason}</p>
              </div>

              <div className="job-evidence">
                {job.evidence.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>

              <p className="verify-question">{job.verify}</p>

              <footer>
                <button onClick={() => onToggleSave(job)}>{saved ? '已收藏 ✓' : '收藏岗位'}</button>
                <button onClick={() => onAskAgent(job)}>问问智能体</button>
              </footer>
            </article>
          )
        })}
      </div>

      <p className="next-drop">明天会基于你的反馈重新推荐 · 越聊越了解你</p>
    </section>
  )
}
