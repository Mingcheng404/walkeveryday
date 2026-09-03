type AppTab = 'explore' | 'record' | 'history' | 'stats' | 'profile'

type BottomNavProps = {
  activeTab: AppTab
  onChange: (tab: AppTab) => void
}

const tabs: Array<{ id: AppTab; label: string; emoji: string }> = [
  { id: 'explore', label: '探索', emoji: '🧭' },
  { id: 'record', label: '自記', emoji: '📡' },
  { id: 'history', label: '路線', emoji: '🗂️' },
  { id: 'stats', label: '統計', emoji: '📊' },
  { id: 'profile', label: '我的', emoji: '👤' },
]

export default function BottomNav({ activeTab, onChange }: BottomNavProps) {
  return (
    <nav className="pointer-events-auto fixed inset-x-0 bottom-0 z-[990] border-t border-slate-700 bg-slate-900/95 backdrop-blur">
      <div
        className="mx-auto flex w-full max-w-xl items-center justify-between px-1 pt-1.5"
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
      >
        {tabs.map((tab) => {
          const active = activeTab === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-lg px-1 py-1.5 text-[10px] font-medium ${
                active ? 'bg-blue-500/20 text-blue-200' : 'text-slate-300'
              }`}
            >
              <span aria-hidden>{tab.emoji}</span>
              <span>{tab.label}</span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

export type { AppTab }
