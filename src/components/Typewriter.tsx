import { useEffect, useState } from 'react'

interface Props {
  text: string
  /** 整段文字的播放时长上限（毫秒），长文本会自动加快每帧步进。 */
  duration?: number
}

export function Typewriter({ text, duration = 1600 }: Props) {
  const [shown, setShown] = useState(0)
  const [source, setSource] = useState(text)

  if (source !== text) {
    setSource(text)
    setShown(0)
  }

  useEffect(() => {
    if (!text) return

    const frames = 60
    const step = Math.max(1, Math.ceil(text.length / frames))
    const timer = window.setInterval(() => {
      setShown((current) => {
        const next = Math.min(text.length, current + step)
        if (next >= text.length) window.clearInterval(timer)
        return next
      })
    }, duration / frames)

    return () => window.clearInterval(timer)
  }, [text, duration])

  return <>{text.slice(0, shown)}</>
}
