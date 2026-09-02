import { useState } from 'react'
import type { ProfileStats } from '../types/app'

type ProfilePanelProps = {
  profile: ProfileStats | null
  isLoggedIn: boolean
  onSaveUsername: (username: string) => Promise<void>
  onOpenAuth: () => void
  onSignOut: () => Promise<void>
}

export default function ProfilePanel({
  profile,
  isLoggedIn,
  onSaveUsername,
  onOpenAuth,
  onSignOut,
}: ProfilePanelProps) {
  const [username, setUsername] = useState(profile?.username ?? '')
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState('')

  if (!isLoggedIn) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-3 text-sm text-slate-200">
          登入後可管理個人資料與同步進度。
        </p>
        <button
          type="button"
          onClick={onOpenAuth}
          className="w-full rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white"
        >
          登入 / 註冊
        </button>
      </div>
    )
  }

  async function handleSave(): Promise<void> {
    if (!username.trim()) {
      setMessage('用戶名稱不可留空。')
      return
    }
    setIsSaving(true)
    setMessage('')
    await onSaveUsername(username.trim())
    setIsSaving(false)
    setMessage('已更新用戶名稱。')
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-3">
        <p className="m-0 text-xs text-slate-300">你的名稱</p>
        <input
          type="text"
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900/60 px-3 py-3 text-sm text-slate-100"
        />
        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isSaving}
          className="mt-2 w-full rounded-xl border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-50"
        >
          {isSaving ? '儲存中...' : '儲存名稱'}
        </button>
      </div>

      {message && (
        <p className="rounded-xl border border-emerald-500/50 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {message}
        </p>
      )}

      <button
        type="button"
        onClick={() => void onSignOut()}
        className="w-full rounded-xl border border-rose-400/60 px-3 py-3 text-sm font-semibold text-rose-200"
      >
        登出
      </button>
    </div>
  )
}
