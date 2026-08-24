import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BottomTabs } from './components/BottomTabs'
import { LoginModal } from './components/LoginModal'
import { FilePreviewModal } from './components/FilePreviewModal'
import { AnalyzingModal } from './components/AnalyzingModal'
import { ReportModal } from './components/ReportModal'
import { ConfirmClearModal } from './components/ConfirmClearModal'
import { HistoryDrawer } from './components/HistoryDrawer'
import { UploadPage } from './pages/UploadPage'
import { ChatPage } from './pages/ChatPage'
import { JobsPage } from './pages/JobsPage'
import { ProfilePage } from './pages/ProfilePage'
import { parseArchive } from './lib/parseArchive'
import { createUuid, getOrCreateCandidateId } from './lib/candidateId'
import { mergeParsedArchives } from './lib/profileData'
import { createRunGenerationCoordinator } from './lib/runGeneration'
import {
  ProfileApiError,
  cancelProfileJob,
  cancelProfileJobOnUnload,
  createProfileJob,
  deleteProfileModels,
  getProfileModel,
  pollProfileJob,
} from './lib/profileApi'
import { requestAgentChat } from './lib/agentApi'
import { titleFromMessage } from './lib/agent'
import { buildCareerProfile } from './data/model'
import { load, remove, save } from './lib/storage'
import type {
  Account,
  ArchiveStats,
  CandidateModel,
  CanonicalCandidateModel,
  CareerProfile,
  Conversation,
  ImportRecord,
  Job,
  PickedFile,
  ProfileJob,
  TabKey,
} from './types'

const SHARE_HOSTS = ['chatgpt.com', 'chat.openai.com', 'claude.ai', 'gemini.google.com', 'poe.com']

export default function App() {
  const [candidateId] = useState(() => getOrCreateCandidateId())
  const [tab, setTab] = useState<TabKey>('upload')
  const [account, setAccount] = useState<Account | null>(() => load<Account | null>('account', null))
  const [records, setRecords] = useState<ImportRecord[]>(() => load<ImportRecord[]>('records', []))
  const [model, setModel] = useState<CandidateModel | null>(() =>
    load<CandidateModel | null>('model', null),
  )
  const [profile, setProfile] = useState<CareerProfile | null>(() =>
    load<CareerProfile | null>('profile', null),
  )
  const [canonicalModel, setCanonicalModel] = useState<CanonicalCandidateModel | null>(() =>
    load<CanonicalCandidateModel | null>('canonicalModel', null),
  )
  const [conversations, setConversations] = useState<Conversation[]>(() =>
    load<Conversation[]>('conversations', []),
  )
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null)
  const [savedJobs, setSavedJobs] = useState<string[]>(() => load<string[]>('savedJobs', []))

  const [pickedFiles, setPickedFiles] = useState<PickedFile[]>([])
  const [showPreview, setShowPreview] = useState(false)
  const [activeJob, setActiveJob] = useState<ProfileJob | null>(null)
  const [cancelling, setCancelling] = useState(false)
  const [showReport, setShowReport] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [showClear, setShowClear] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [thinking, setThinking] = useState(false)
  const [toast, setToast] = useState('')
  const runCoordinatorRef = useRef(createRunGenerationCoordinator())

  useEffect(() => save('account', account), [account])
  useEffect(() => save('records', records), [records])
  useEffect(() => save('model', model), [model])
  useEffect(() => save('profile', profile), [profile])
  useEffect(() => save('canonicalModel', canonicalModel), [canonicalModel])
  useEffect(() => save('conversations', conversations), [conversations])
  useEffect(() => save('savedJobs', savedJobs), [savedJobs])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(''), 3200)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    const coordinator = runCoordinatorRef.current
    const onPageHide = () => {
      const jobId = coordinator.current()?.jobId
      if (jobId) cancelProfileJobOnUnload(jobId)
    }
    window.addEventListener('pagehide', onPageHide)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      const { jobId } = coordinator.invalidate()
      if (jobId) cancelProfileJobOnUnload(jobId)
    }
  }, [])

  const totals = useMemo<ArchiveStats>(
    () =>
      records.reduce(
        (sum, record) => ({
          conversations: sum.conversations + record.stats.conversations,
          messages: sum.messages + record.stats.messages,
        }),
        { conversations: 0, messages: 0 },
      ),
    [records],
  )

  const messages = useMemo(
    () => conversations.find((item) => item.id === activeConversationId)?.messages ?? [],
    [conversations, activeConversationId],
  )

  /* ---------- 文件导入 ---------- */

  const discardLocalRun = useCallback(() => {
    const { jobId } = runCoordinatorRef.current.invalidate()
    if (jobId) cancelProfileJobOnUnload(jobId)
  }, [])

  const addFiles = useCallback((list: FileList | null) => {
    if (!list || list.length === 0) return
    discardLocalRun()
    const incoming = Array.from(list)

    setPickedFiles((current) => [
      ...current,
      ...incoming.map((file) => ({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name,
        size: file.size,
        status: 'reading' as const,
      })),
    ])
    setShowPreview(true)

    incoming.forEach(async (file, index) => {
      try {
        const archive = await parseArchive(file, candidateId)
        updateByPosition(index, incoming.length, (item) => ({ ...item, status: 'ready', archive }))
      } catch (error) {
        updateByPosition(index, incoming.length, (item) => ({
          ...item,
          status: 'error',
          error: error instanceof Error ? error.message : '无法解析这个文件。',
        }))
      }
    })

    /** 解析是并发的，按本批次的相对位置回填结果，避免同名文件互相覆盖。 */
    function updateByPosition(
      index: number,
      batchSize: number,
      patch: (item: PickedFile) => PickedFile,
    ) {
      setPickedFiles((current) => {
        const target = current.length - batchSize + index
        if (target < 0 || target >= current.length) return current
        return current.map((item, position) => (position === target ? patch(item) : item))
      })
    }
  }, [candidateId, discardLocalRun])

  function requireLogin() {
    setShowLogin(true)
  }

  async function confirmAnalyze() {
    const ready = pickedFiles.filter((file) => file.status === 'ready')
    if (ready.length === 0) return
    let merged
    try {
      merged = mergeParsedArchives(
        ready.flatMap((file) => (file.archive ? [file.archive] : [])),
        candidateId,
      )
    } catch (error) {
      setToast(error instanceof Error ? error.message : '无法合并这些聊天记录。')
      return
    }

    const coordinator = runCoordinatorRef.current
    const run = coordinator.start(createUuid)
    if (!run) {
      setToast('已有分析正在进行，请等待完成或先取消。')
      return
    }
    setShowPreview(false)
    setCancelling(false)

    try {
      console.log('[profile] uploaded transcript', merged.transcript)
      const { jobId } = await createProfileJob(
        {
          candidateId,
          transcript: merged.transcript,
          options: { enableCritic: false },
        },
        run.idempotencyKey,
        run.controller.signal,
      )
      if (!coordinator.attachJob(run, jobId)) return
      coordinator.commit(run, () => {
        setActiveJob({
          jobId,
          status: 'queued',
          progress: 0,
          stageMessage: '任务已创建，正在等待后端开始分析。',
          modelId: null,
          criticVerdict: null,
          error: null,
        })
      })

      const terminal = await pollProfileJob(jobId, {
        signal: run.controller.signal,
        onUpdate: (job) => {
          coordinator.commit(run, () => setActiveJob(job))
        },
      })
      if (terminal.status === 'failed' || terminal.status === 'cancelled') {
        coordinator.finish(run, () => {
          setActiveJob(null)
          setCancelling(false)
          setToast(
            terminal.error?.message ??
              (terminal.status === 'cancelled'
                ? '分析已取消。'
                : '分析未能完成，请稍后重试。'),
          )
        })
        return
      }
      if (!terminal.modelId) {
        throw new ProfileApiError(
          200,
          'INVALID_RESPONSE',
          '分析已结束，但后端没有返回画像标识。',
        )
      }

      const response = await getProfileModel(
        terminal.modelId,
        run.controller.signal,
      )
      const newRecords: ImportRecord[] = ready.map((file) => ({
        id: file.id,
        name: file.name,
        at: Date.now(),
        stats: file.archive?.stats ?? { conversations: 0, messages: 0 },
      }))
      coordinator.finish(run, () => {
        setRecords((current) => [...newRecords, ...current])
        setModel(response.uiModel)
        setCanonicalModel(response.candidateModel)
        setProfile(buildCareerProfile(response.uiModel))
        setPickedFiles([])
        setActiveJob(null)
        setCancelling(false)
        setShowReport(true)
        setToast(
          terminal.status === 'unresolved'
            ? `已分析 ${merged.stats.messages} 条消息，但部分结论证据仍不足，请查看待确认项。`
            : `已从 ${ready.length} 份文件中分析 ${merged.stats.messages} 条消息并生成职业画像。`,
        )
      })
    } catch (error) {
      if (!(error instanceof DOMException && error.name === 'AbortError')) {
        coordinator.pauseForRetry(run, () => {
          setActiveJob(null)
          setToast(
            error instanceof ProfileApiError
              ? error.message
              : '画像分析未能完成，请检查后端服务后重试。',
          )
        })
      }
    }
  }

  async function cancelAnalysis() {
    const coordinator = runCoordinatorRef.current
    const run = coordinator.current()
    if (!run?.jobId || cancelling) return
    if (!coordinator.commit(run, () => setCancelling(true))) return
    try {
      const result = await coordinator.cancelCurrent(cancelProfileJob)
      if (!result.applied) return
      setActiveJob(null)
      setCancelling(false)
      setToast(result.job.error?.message ?? '分析已取消。')
    } catch (error) {
      coordinator.commit(run, () => {
        setCancelling(false)
        setToast(
          error instanceof ProfileApiError
            ? error.message
            : '取消请求未能完成，分析仍在继续，请稍后重试。',
        )
      })
    }
  }

  async function confirmClearProfile() {
    setModel(null)
    setCanonicalModel(null)
    setProfile(null)
    remove('model')
    remove('canonicalModel')
    remove('profile')
    setShowClear(false)
    try {
      await deleteProfileModels(candidateId)
      setToast('所有已生成的职业画像已清空。聊天历史和导入记录仍然保留。')
    } catch {
      setToast('本地画像已清空，但服务器副本可能仍在。请稍后重试清空。')
    }
  }

  async function importUrl(url: string): Promise<string | null> {
    if (!url) return '请输入一个公开的聊天分享链接。'

    let parsed: URL
    try {
      parsed = new URL(url)
    } catch {
      return '这不是一个有效的网址。'
    }
    if (!/^https?:$/.test(parsed.protocol)) return '只支持 http 或 https 链接。'
    if (!SHARE_HOSTS.some((host) => parsed.hostname.endsWith(host))) {
      return '目前只支持 ChatGPT、Claude、Gemini、Poe 的公开分享页。'
    }

    await new Promise((resolve) => setTimeout(resolve, 900))

    // 演示环境不做跨域抓取，用链接长度生成一份稳定的统计值。
    const seed = parsed.pathname.length + parsed.hostname.length
    const stats: ArchiveStats = { conversations: 1, messages: 12 + (seed % 40) }

    setRecords((current) => [
      { id: `url-${Date.now()}`, name: parsed.hostname + parsed.pathname, at: Date.now(), stats },
      ...current,
    ])
    setToast(`已读取网址中的聊天正文，共 ${stats.messages} 条对话线索。`)
    return null
  }

  /* ---------- 对话 ---------- */

  const sendMessage = useCallback(
    (text: string) => {
      const userMessage = { id: `u-${Date.now()}`, role: 'user' as const, text }
      const existing = conversations.find((item) => item.id === activeConversationId)
      const targetId = existing?.id ?? `c-${Date.now()}`
      const history = [...(existing?.messages ?? []), userMessage]

      setConversations((current) => {
        if (current.some((item) => item.id === targetId)) {
          return current.map((item) =>
            item.id === targetId ? { ...item, messages: [...item.messages, userMessage] } : item,
          )
        }
        return [
          {
            id: targetId,
            title: titleFromMessage(text),
            createdAt: Date.now(),
            messages: [userMessage],
          },
          ...current,
        ]
      })
      setActiveConversationId(targetId)
      setThinking(true)

      void (async () => {
        try {
          const { reply } = await requestAgentChat({
            messages: history.map((message) => ({
              role: message.role,
              content: message.text,
            })),
            profile: model
              ? {
                  headline: model.headline,
                  sourceLabel: model.sourceLabel,
                  thesis: model.thesis,
                }
              : null,
          })
          setConversations((current) =>
            current.map((item) =>
              item.id === targetId
                ? {
                    ...item,
                    messages: [
                      ...item.messages,
                      {
                        id: `a-${Date.now()}`,
                        role: 'agent' as const,
                        text: reply,
                        animate: true,
                      },
                    ],
                  }
                : item,
            ),
          )
        } catch (error) {
          const message =
            error instanceof ProfileApiError
              ? error.message
              : '智能体暂时无法回复，请稍后重试。'
          setConversations((current) =>
            current.map((item) =>
              item.id === targetId
                ? {
                    ...item,
                    messages: [
                      ...item.messages,
                      {
                        id: `a-${Date.now()}`,
                        role: 'agent' as const,
                        text: message,
                        animate: true,
                      },
                    ],
                  }
                : item,
            ),
          )
        } finally {
          setThinking(false)
        }
      })()
    },
    [activeConversationId, conversations, model],
  )

  // 打字机动画播完后清掉标记，避免切换标签页时整段文字重播。
  useEffect(() => {
    if (!messages.some((message) => message.animate)) return
    const timer = window.setTimeout(() => {
      setConversations((current) =>
        current.map((item) => ({
          ...item,
          messages: item.messages.map((message) =>
            message.animate ? { ...message, animate: false } : message,
          ),
        })),
      )
    }, 2400)
    return () => window.clearTimeout(timer)
  }, [messages])

  function askAgentAbout(job: Job) {
    setTab('chat')
    setActiveConversationId(null)
    sendMessage(
      `请结合我的画像，进一步分析${job.company}的${job.role}为什么适合我，以及我应该向团队确认什么。`,
    )
  }

  /* ---------- 渲染 ---------- */

  return (
    <main className="mobile-app">
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />

      <header className="brand-head">
        <div>
          <b>Workgraph</b>
          <span>让真实的你，遇见适合的工作</span>
        </div>
        {account ? (
          <button className="sign-in-pill signed" onClick={() => setTab('profile')}>
            {account.provider === 'guest' ? '体验模式' : account.email.split('@')[0]} · 已保存
          </button>
        ) : (
          <button className="sign-in-pill" onClick={requireLogin}>
            登录
          </button>
        )}
      </header>

      {tab === 'upload' && (
        <UploadPage
          signedIn={Boolean(account)}
          totals={totals}
          pickedCount={pickedFiles.length}
          hasModel={Boolean(model)}
          onRequireLogin={requireLogin}
          onPickFiles={addFiles}
          onOpenPreview={() => setShowPreview(true)}
          onImportUrl={importUrl}
          onOpenReport={() => setShowReport(true)}
        />
      )}

      {tab === 'chat' && (
        <ChatPage
          messages={messages}
          thinking={thinking}
          totals={totals}
          hasModel={Boolean(model)}
          onSend={sendMessage}
          onNewConversation={() => setActiveConversationId(null)}
          onOpenHistory={() => setShowHistory(true)}
          onGoImport={() => setTab('upload')}
        />
      )}

      {tab === 'jobs' && (
        <JobsPage
          totals={totals}
          hasModel={Boolean(model)}
          savedIds={savedJobs}
          onAskAgent={askAgentAbout}
          onToggleSave={(job) =>
            setSavedJobs((current) =>
              current.includes(job.id)
                ? current.filter((id) => id !== job.id)
                : [...current, job.id],
            )
          }
        />
      )}

      {tab === 'profile' && (
        <ProfilePage
          account={account}
          profile={profile}
          records={records}
          totals={totals}
          hasModel={Boolean(model)}
          onRequireLogin={requireLogin}
          onLogout={() => {
            setAccount(null)
            setToast('已退出登录，本设备仍保留数据。')
          }}
          onClearProfile={() => setShowClear(true)}
          onOpenReport={() => setShowReport(true)}
          onGoImport={() => setTab('upload')}
          onGoChat={() => setTab('chat')}
        />
      )}

      <BottomTabs active={tab} onChange={setTab} />

      {showLogin && (
        <LoginModal
          onClose={() => setShowLogin(false)}
          onLogin={(next) => {
            setAccount(next)
            setShowLogin(false)
            setToast(next.provider === 'guest' ? '已进入体验模式。' : `已登录：${next.email}`)
          }}
        />
      )}

      {showPreview && (
        <FilePreviewModal
          files={pickedFiles}
          onClose={() => setShowPreview(false)}
          onAdd={addFiles}
          onRemove={(id) => {
            discardLocalRun()
            setPickedFiles((current) => current.filter((file) => file.id !== id))
          }}
          onConfirm={confirmAnalyze}
        />
      )}

      {activeJob && (
        <AnalyzingModal
          job={activeJob}
          fileCount={pickedFiles.filter((file) => file.status === 'ready').length}
          cancelling={cancelling}
          onCancel={cancelAnalysis}
        />
      )}

      {showReport && model && (
        <ReportModal
          model={model}
          onClose={() => setShowReport(false)}
          onVerifyUnknown={() => {
            setShowReport(false)
            setTab('chat')
            setActiveConversationId(null)
            sendMessage('请基于刚才的 Candidate Model，从最重要的 Unknown 开始问我一个验证问题。')
          }}
          onSave={() => {
            setShowReport(false)
            setTab('profile')
            setToast('Candidate Model 已保存到你的画像。')
          }}
        />
      )}

      {showClear && (
        <ConfirmClearModal
          onClose={() => setShowClear(false)}
          onConfirm={() => {
            void confirmClearProfile()
          }}
        />
      )}

      {showHistory && (
        <HistoryDrawer
          conversations={conversations}
          activeId={activeConversationId}
          onPick={(id) => {
            setActiveConversationId(id)
            setShowHistory(false)
          }}
          onClose={() => setShowHistory(false)}
        />
      )}

      {toast && <div className="toast">{toast}</div>}
    </main>
  )
}
