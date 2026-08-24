import type { TabKey } from '../types'

const tabs: { key: TabKey; icon: string; label: string; hint: string }[] = [
  { key: 'upload', icon: '⌁', label: '导入', hint: '建立画像' },
  { key: 'chat', icon: '✦', label: '对话', hint: '职业智能体' },
  { key: 'jobs', icon: '⌕', label: '岗位', hint: '每日 3 个' },
  { key: 'profile', icon: '●', label: '我的', hint: '个人画像' },
]

interface Props {
  active: TabKey
  onChange: (tab: TabKey) => void
}

export function BottomTabs({ active, onChange }: Props) {
  return (
    <nav className="bottom-tabs" aria-label="底部导航">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          className={tab.key === active ? 'active' : ''}
          onClick={() => onChange(tab.key)}
          aria-current={tab.key === active}
        >
          <span aria-hidden="true">{tab.icon}</span>
          <b>{tab.label}</b>
          <small>{tab.hint}</small>
        </button>
      ))}
    </nav>
  )
}
