import { useState } from 'react'
import { Modal } from './Modal'
import type { Account } from '../types'

interface Props {
  onClose: () => void
  onLogin: (account: Account) => void
}

export function LoginModal({ onClose, onLogin }: Props) {
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const value = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      setError('请填写一个有效的邮箱地址。')
      return
    }
    onLogin({ email: value, provider: 'email' })
  }

  return (
    <Modal onClose={onClose} label="登录 Workgraph">
      <small className="eyebrow">登录 WORKGRAPH</small>
      <h2>先登录，再建立画像</h2>
      <p className="lead">输入邮箱即可登录，不需要打开邮件验证。</p>

      <form className="login-form" onSubmit={submit}>
        <label htmlFor="login-email">邮箱地址</label>
        <input
          id="login-email"
          type="email"
          value={email}
          placeholder="you@example.com"
          autoComplete="email"
          onChange={(event) => {
            setEmail(event.target.value)
            setError('')
          }}
        />
        {error && <p className="form-error">{error}</p>}
        <button type="submit">直接登录</button>
      </form>

      <div className="login-divider">
        <span>或</span>
      </div>

      <button
        className="alt-login"
        onClick={() => onLogin({ email: 'chatgpt-user@workgraph.app', provider: 'chatgpt' })}
      >
        使用 ChatGPT 登录
      </button>
      <button
        className="guest-login"
        onClick={() => onLogin({ email: '体验模式', provider: 'guest' })}
      >
        直接进入体验
      </button>

      <p className="login-note">
        邮箱登录可跨设备恢复画像与对话；体验模式只在本设备保存数据，清除浏览器数据后无法恢复。
      </p>
    </Modal>
  )
}
