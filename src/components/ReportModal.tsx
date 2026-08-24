import { Modal } from './Modal'
import type { CandidateModel, Confidence, ReviewerReport } from '../types'

interface Props {
  model: CandidateModel
  onClose: () => void
  onVerifyUnknown: () => void
  onSave: () => void
}

const confidenceLabel: Record<Confidence, string> = {
  high: '高置信度',
  medium: '中等置信度',
  unknown: '证据不足',
}

const strengthLabel = {
  strong: '强证据',
  repeated: '多次出现',
  early: '初步信号',
}

const verdictLabel = {
  great: '非常匹配',
  depends: '可能很好，但要看团队',
  avoid: '不会优先推荐',
}

const competitorTypeLabel: Record<string, string> = {
  narrow: '窄任务型',
  higher_order: '高阶机制型',
  domain: '领域型',
  operating_style: '运作风格型',
  null: '证据不足 / 未决',
}

function Prose({ text }: { text: string }) {
  const lines = text.split('\n').filter((line) => line.trim().length > 0)
  return (
    <div className="report-prose">
      {lines.map((line, index) => (
        <p key={`${index}-${line.slice(0, 24)}`}>{line}</p>
      ))}
    </div>
  )
}

function ReviewerEssay({
  model,
  report,
}: {
  model: CandidateModel
  report: ReviewerReport
}) {
  return (
    <>
      <section className="report-section" style={{ borderTop: 0, paddingTop: 8 }}>
        <h3>01 · Working Archetype</h3>
        <p className="report-kicker">{report.nameEn}</p>
        <Prose text={report.definition} />
        {report.whyThisNotThat !== report.definition && (
          <Prose text={report.whyThisNotThat} />
        )}
        <div className="confidence-split">
          <span>{report.explanatoryConfidenceLabel}</span>
          <span>{report.outcomeConfidenceLabel}</span>
        </div>
      </section>

      <section className="report-section">
        <h3>02 · 典型工作循环</h3>
        <p className="core-loop">{report.coreLoopNarrative || '尚未形成稳定循环。'}</p>
      </section>

      <section className="report-section">
        <h3>03 · 为什么这个人不同</h3>
        <Prose text={report.whyDifferent} />
      </section>

      <section className="report-section">
        <h3>04 · 高信号 Episode</h3>
        {report.episodes.length === 0 ? (
          <p className="report-empty">没有可展示的高信号片段。</p>
        ) : (
          report.episodes.map((episode) => (
            <article className="episode-block" key={`${episode.source}-${episode.title}`}>
              <header>
                <b>{episode.title}</b>
                <i className="chip repeated">{episode.protectedStandard}</i>
              </header>
              <Prose text={episode.narrative} />
              {episode.quote ? (
                <blockquote>
                  {episode.quote}
                  <cite>{episode.source}</cite>
                </blockquote>
              ) : (
                <cite>来源 {episode.source} · 无逐字引语</cite>
              )}
            </article>
          ))
        )}
      </section>

      <section className="report-section">
        <h3>05 · Stable Mechanisms</h3>
        {report.mechanisms.map((mechanism) => (
          <article className="capability" key={mechanism.name}>
            <header>
              <b>{mechanism.name}</b>
              <i className={`chip ${mechanism.confidence}`}>
                {confidenceLabel[mechanism.confidence]}
              </i>
            </header>
            <p>{mechanism.description}</p>
            {mechanism.contexts.length > 0 && (
              <p className="boundary">跨场景：{mechanism.contexts.join(' / ')}</p>
            )}
            {mechanism.confirmed.length > 0 && (
              <p className="boundary">已验证预测：{mechanism.confirmed.join('；')}</p>
            )}
            {mechanism.missing.length > 0 && (
              <p className="boundary">缺失预测：{mechanism.missing.join('；')}</p>
            )}
          </article>
        ))}
      </section>

      <section className="report-section">
        <h3>06 · Capability Configuration</h3>
        {report.capabilities.map((capability) => (
          <article className="capability" key={capability.name}>
            <header>
              <b>{capability.name}</b>
            </header>
            <p>{capability.emergentLogic}</p>
            {capability.episodeTitles.length > 0 && (
              <p className="boundary">
                支撑 Episode：{capability.episodeTitles.join('；')}
              </p>
            )}
          </article>
        ))}
      </section>

      <section className="report-section">
        <h3>07 · Competing Archetypes</h3>
        {report.competingArchetypes.map((competitor) => (
          <article
            className={`competitor-card${competitor.isWinner ? ' winner' : ''}`}
            key={`${competitor.type}-${competitor.name}`}
          >
            <header>
              <b>{competitor.name}</b>
              <i className={`chip ${competitor.isWinner ? 'strong' : 'early'}`}>
                {competitor.isWinner
                  ? '胜出'
                  : (competitorTypeLabel[competitor.type] ?? competitor.type)}
              </i>
            </header>
            {competitor.explains.length > 0 && (
              <p>能解释：{competitor.explains.join('；')}</p>
            )}
            {competitor.failsToExplain.length > 0 && (
              <p>解释不了：{competitor.failsToExplain.join('；')}</p>
            )}
          </article>
        ))}
      </section>

      <section className="report-section">
        <h3>08 · 最强反方</h3>
        <Prose text={report.counterargument.argument} />
        {report.counterargument.whatItExplains && (
          <p className="boundary">
            它能解释：{report.counterargument.whatItExplains}
          </p>
        )}
        {report.counterargument.whatItFailsToExplain && (
          <p className="boundary">
            它解释不了：{report.counterargument.whatItFailsToExplain}
          </p>
        )}
        {report.counterargument.whyItDoesOrDoesNotWin && (
          <p className="boundary">
            判断：{report.counterargument.whyItDoesOrDoesNotWin}
          </p>
        )}
      </section>

      <section className="report-section">
        <h3>09 · Strength → Risk</h3>
        {report.strengthRisks.length === 0 ? (
          <p className="report-empty">{model.riskNote}</p>
        ) : (
          report.strengthRisks.map((pair) => (
            <div className="strength-risk" key={`${pair.strength}-${pair.risk}`}>
              <b>{pair.strength}</b>
              <p>{pair.risk}</p>
            </div>
          ))
        )}
        <p className="risk-note">{model.riskNote}</p>
      </section>

      <section className="report-section">
        <h3>10 · Role Fit</h3>
        {model.roles.map((role) => (
          <div className="role-row" key={role.role}>
            <header>
              <b>{role.role}</b>
              <i className={`chip ${role.verdict}`}>{verdictLabel[role.verdict]}</i>
            </header>
            <p>{role.reason}</p>
            <p className="boundary">前提 / 边界：{role.boundary}</p>
          </div>
        ))}
      </section>

      <section className="report-section">
        <h3>11 · 证据边界</h3>
        <div className="cannot-prove">
          <b>这份记录还不能证明：</b>
          <ul>
            {model.cannotProve.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="report-section">
        <h3>12 · 给招聘经理的一页纸</h3>
        <div className="thesis">
          <small>HIRING MANAGER SUMMARY · 结构化主张拼接，不是另写散文</small>
          {report.hiringManagerSummary || model.thesis}
        </div>
      </section>

      <section className="report-section">
        <h3>13 · 下一轮最值得验证什么</h3>
        <div className="next-questions">
          {model.nextQuestions.map((question, index) => (
            <div key={question}>
              <i>{index + 1}</i>
              <span>{question}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

function LegacyCards({ model }: { model: CandidateModel }) {
  return (
    <>
      <section className="report-section" style={{ borderTop: 0, paddingTop: 8 }}>
        <h3>01 · 摘要结论</h3>
        <div className="thesis">
          <small>CANDIDATE THESIS · 如果完全不看简历</small>
          {model.thesis}
        </div>
      </section>
      <section className="report-section">
        <h3>02 · 我会怎么给这个人建模</h3>
        {model.dimensions.map((dimension) => (
          <div className="dimension" key={dimension.label}>
            <header>
              <b>{dimension.label}</b>
              <i className={`chip ${dimension.confidence}`}>
                {confidenceLabel[dimension.confidence]}
              </i>
            </header>
            <p>{dimension.detail}</p>
          </div>
        ))}
        <div className="cannot-prove">
          <b>这份记录还不能证明：</b>
          <ul>
            {model.cannotProve.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </section>
      <section className="report-section">
        <h3>03 · 反复出现的工作能力</h3>
        {model.capabilities.map((capability) => (
          <article className="capability" key={capability.title}>
            <header>
              <b>{capability.title}</b>
              <i className={`chip ${capability.strength}`}>
                {strengthLabel[capability.strength]}
              </i>
            </header>
            <p>{capability.detail}</p>
            <div className="evidence">
              <small>证据</small>
              {capability.evidence.map((item) => (
                <blockquote key={item.source}>
                  {item.narrative ?? item.quote}
                  <cite>{item.source}</cite>
                </blockquote>
              ))}
            </div>
          </article>
        ))}
      </section>
      <section className="report-section">
        <h3>04 · 适合与不适合的工作方式</h3>
        <div className="fit-columns">
          <div className="good">
            <b>更能发挥长处</b>
            <ul>
              {model.strengths.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
          <div className="bad">
            <b>可能消耗或放大风险</b>
            <ul>
              {model.risks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        <p className="risk-note">
          <b style={{ fontSize: 10 }}>风险为什么值得关注：</b>
          <br />
          {model.riskNote}
        </p>
      </section>
      <section className="report-section">
        <h3>05 · 推荐的工作类型</h3>
        {model.roles.map((role) => (
          <div className="role-row" key={role.role}>
            <header>
              <b>{role.role}</b>
              <i className={`chip ${role.verdict}`}>{verdictLabel[role.verdict]}</i>
            </header>
            <p>{role.reason}</p>
            <p className="boundary">前提 / 边界：{role.boundary}</p>
          </div>
        ))}
      </section>
      <section className="report-section">
        <h3>06 · 下一轮最值得验证什么</h3>
        <div className="next-questions">
          {model.nextQuestions.map((question, index) => (
            <div key={question}>
              <i>{index + 1}</i>
              <span>{question}</span>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}

export function ReportModal({ model, onClose, onVerifyUnknown, onSave }: Props) {
  const report = model.reviewerReport

  return (
    <Modal onClose={onClose} wide label="Candidate Model 报告">
      <small className="eyebrow">CANDIDATE MODEL · 仅基于对话证据</small>
      <h2>{model.headline}</h2>

      <div className="report-stats">
        <div>
          <b>{model.dimensionCount}</b>
          <small>判断维度</small>
        </div>
        <div>
          <b>{model.sourceLabel.split(' · ')[0]}</b>
          <small>资料来源</small>
        </div>
        <div>
          <b>{model.unknownCount}</b>
          <small>关键未知</small>
        </div>
      </div>

      {report ? <ReviewerEssay model={model} report={report} /> : <LegacyCards model={model} />}

      <p className="report-disclaimer">
        这份模型描述的是可观察到的 reasoning style 和工作倾向，不等于履历验证、能力测验或长期结果。
        没有证据的地方会被明确保留为 Unknown。
      </p>

      <div className="report-actions">
        <button onClick={onVerifyUnknown}>继续验证 Unknown</button>
        <button onClick={onSave}>保存 Candidate Model</button>
      </div>
    </Modal>
  )
}
