import { useEffect, type ReactNode } from 'react'

interface Props {
  onClose: () => void
  children: ReactNode
  wide?: boolean
  /** 分析进行中等场景不允许点击遮罩关闭。 */
  dismissible?: boolean
  label: string
}

export function Modal({ onClose, children, wide, dismissible = true, label }: Props) {
  useEffect(() => {
    if (!dismissible) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [dismissible, onClose])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previous
    }
  }, [])

  return (
    <div
      className="overlay"
      onClick={dismissible ? onClose : undefined}
      role="dialog"
      aria-modal="true"
      aria-label={label}
    >
      <div
        className={wide ? 'modal-card wide' : 'modal-card'}
        onClick={(event) => event.stopPropagation()}
      >
        {dismissible && (
          <button className="modal-close" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        )}
        {children}
      </div>
    </div>
  )
}
