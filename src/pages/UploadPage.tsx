import { useState } from 'react'
import type { ArchiveStats } from '../types'

interface Props {
  signedIn: boolean
  totals: ArchiveStats
  pickedCount: number
  hasModel: boolean
  onRequireLogin: () => void
  onPickFiles: (list: FileList | null) => void
  onOpenPreview: () => void
  onImportUrl: (url: string) => Promise<string | null>
  onOpenReport: () => void
}

const ACCEPT = '.zip,.html,.htm,.txt,.md,.json,.pdf,.doc,.docx'

export function UploadPage({
  signedIn,
  totals,
  pickedCount,
  hasModel,
  onRequireLogin,
  onPickFiles,
  onOpenPreview,
  onImportUrl,
  onOpenReport,
}: Props) {
  const [url, setUrl] = useState('')
  const [urlBusy, setUrlBusy] = useState(false)
  const [urlError, setUrlError] = useState('')

  async function submitUrl(event: React.FormEvent) {
    event.preventDefault()
    if (!signedIn) {
      onRequireLogin()
      return
    }
    setUrlBusy(true)
    setUrlError('')
    const error = await onImportUrl(url.trim())
    setUrlBusy(false)
    if (error) setUrlError(error)
    else setUrl('')
  }

  return (
    <section className="tab-page">
      <div className="mode-pill">
        <span aria-hidden="true">⌁</span>
        <p>
          <b>建立你的 Workgraph</b>
          <small>
            {totals.conversations > 0
              ? `已读取 ${totals.conversations} 段对话`
              : '从你真实做过的思考开始'}
          </small>
        </p>
        <i />
      </div>

      <div className="upload-hero">
        <div className="orb">
          <span />
        </div>
        <small>YOUR WORKGRAPH</small>
        <h1>
          让 AI 看见你
          <br />
          是怎样思考和做事的
        </h1>
        <p>导入 AI 聊天记录，建立一份有证据、由你确认的工作画像。</p>
      </div>

      <div className="privacy-promise">
        <span aria-hidden="true">◉</span>
        <p>
          <b>文件先在本地解析</b>
          <small>
            文件先在本地解析。只有点击“开始分析”后，归一化后的聊天文本才会发送给 Workgraph 后端和配置的 AI 服务。
          </small>
        </p>
      </div>

      <div className="upload-actions">
        <div className="chat-upload">
          <span aria-hidden="true">⌁</span>
          <div>
            <em>方式一 · 上传文件</em>
            <b>导入你的 AI 聊天记录</b>
            <small>
              {pickedCount > 0
                ? `已选择 ${pickedCount} 份聊天记录，打开后可继续添加或生成画像`
                : '支持 ZIP / HTML / TXT / JSON / DOCX，可多选'}
            </small>
          </div>
          <i>本地解析</i>

          {!signedIn ? (
            <button className="native-file" onClick={onRequireLogin}>
              登录后上传
            </button>
          ) : pickedCount > 0 ? (
            <button className="native-file" onClick={onOpenPreview}>
              继续管理文件（{pickedCount}）
            </button>
          ) : (
            <label className="native-file">
              <input
                type="file"
                multiple
                accept={ACCEPT}
                onChange={(event) => {
                  onPickFiles(event.target.files)
                  event.target.value = ''
                }}
              />
              选择聊天记录文件
            </label>
          )}

          <footer>
            {signedIn ? '选取后先预览文件，确认后才开始分析' : '上传并生成个人画像前，需要先登录'}
          </footer>
        </div>

        <div className="url-import">
          <header>
            <span aria-hidden="true">↗</span>
            <p>
              <em>方式二 · 输入网址</em>
              <b>解析公开的 AI 聊天链接</b>
              <small>支持 ChatGPT、Claude、Gemini、Poe 的公开分享页</small>
            </p>
          </header>
          <form onSubmit={submitUrl}>
            <input
              type="url"
              value={url}
              aria-label="公开聊天网址"
              placeholder={signedIn ? '粘贴公开聊天网址…' : '登录后输入聊天网址'}
              onChange={(event) => {
                setUrl(event.target.value)
                setUrlError('')
              }}
            />
            <button type="submit" disabled={urlBusy}>
              {!signedIn ? '先登录' : urlBusy ? '读取中' : '开始解析'}
            </button>
          </form>
          {urlError && <p className="form-error">{urlError}</p>}
          <footer>只读取公开页面正文，不会访问你的私人账号</footer>
        </div>
      </div>

      {(totals.conversations > 0 || hasModel) && (
        <button className="import-status" onClick={onOpenReport} disabled={!hasModel}>
          <span aria-hidden="true">◈</span>
          <p>
            <b>资料状态</b>
            <small>
              {totals.conversations} 段对话 · {totals.messages} 条消息
              {hasModel ? ' · 画像已生成' : ' · 等待生成画像'}
            </small>
          </p>
          <i aria-hidden="true">{hasModel ? '›' : ''}</i>
        </button>
      )}

      <section className="trust-panel">
        <header>
          <span aria-hidden="true">✦</span>
          <div>
            <small>AFTER IMPORTING</small>
            <h2>导入之后，会发生什么？</h2>
          </div>
        </header>
        <p className="trust-intro">
          Workgraph 不会把你的聊天简单总结成几个标签，而是寻找反复出现、可以追溯的工作证据。
        </p>

        <div className="analysis-flow">
          <div>
            <i>1</i>
            <p>
              <b>AI 提取线索</b>
              <small>发现你持续关注的问题、思考方式和行动习惯</small>
            </p>
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <i>2</i>
            <p>
              <b>智能体找你确认</b>
              <small>通过对话区分真实特质和仍需验证的假设</small>
            </p>
          </div>
          <span aria-hidden="true">→</span>
          <div>
            <i>3</i>
            <p>
              <b>生成工作画像</b>
              <small>用于探索更合适的角色、环境、机会和合作对象</small>
            </p>
          </div>
        </div>

        <div className="outcome-card">
          <small>你最终会得到</small>
          <div>
            <span>
              <b>工作特质</b>
              <i>附证据</i>
            </span>
            <span>
              <b>适合方向</b>
              <i>附理由</i>
            </span>
            <span>
              <b>探索建议</b>
              <i>可行动</i>
            </span>
          </div>
        </div>

        <div className="privacy-title">
          <span aria-hidden="true">◉</span>
          <b>隐私边界</b>
          <small>原始聊天不会展示给岗位方或其他用户</small>
        </div>
        <div className="privacy-points">
          <p>
            <span aria-hidden="true">✓</span>
            文件先在本地解析。只有点击“开始分析”后，归一化后的聊天文本才会发送给 Workgraph 后端和配置的 AI 服务。
          </p>
          <p>
            <span aria-hidden="true">✓</span>原始文件本身不会上传
          </p>
          <p>
            <span aria-hidden="true">✓</span>
            报告证据可能保留选中的原文引用和来源 ID，供你追溯判断
          </p>
        </div>
      </section>
    </section>
  )
}
