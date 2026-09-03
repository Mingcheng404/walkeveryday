import { useState } from 'react'
import type { HabitSettings, ProfileStats } from '../types/app'

type ProfilePanelProps = {
  profile: ProfileStats | null
  isLoggedIn: boolean
  habitSettings: HabitSettings | null
  onSaveUsername: (username: string) => Promise<void>
  onSaveHabit: (settings: HabitSettings) => Promise<void>
  onOpenAuth: () => void
  onSignOut: () => Promise<void>
}

export default function ProfilePanel({
  profile,
  isLoggedIn,
  habitSettings,
  onSaveUsername,
  onSaveHabit,
  onOpenAuth,
  onSignOut,
}: ProfilePanelProps) {
  const [username, setUsername] = useState(profile?.username ?? '')
  const [isSavingName, setIsSavingName] = useState(false)
  const [nameMessage, setNameMessage] = useState('')

  const [weeklyTarget, setWeeklyTarget] = useState(habitSettings?.weeklyTargetDays ?? 7)
  const [dailyKm, setDailyKm] = useState(habitSettings?.dailyTargetKm ?? 2)
  const [vacation, setVacation] = useState(habitSettings?.vacationMode ?? false)
  const [reminder, setReminder] = useState(habitSettings?.reminderEnabled ?? false)
  const [reminderHour, setReminderHour] = useState(habitSettings?.reminderHour ?? 20)
  const [isSavingHabit, setIsSavingHabit] = useState(false)
  const [habitMessage, setHabitMessage] = useState('')

  if (!isLoggedIn) {
    return (
      <div className="space-y-3">
        <p className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-3 text-sm text-slate-200">
          登入後可管理個人資料、習慣目標與同步進度。
        </p>
        <button type="button" onClick={onOpenAuth} className="w-full rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white">
          登入 / 註冊
        </button>
      </div>
    )
  }

  async function handleSaveName() {
    if (!username.trim()) {
      setNameMessage('用戶名稱不可留空。')
      return
    }
    setIsSavingName(true)
    setNameMessage('')
    await onSaveUsername(username.trim())
    setIsSavingName(false)
    setNameMessage('已更新用戶名稱。')
  }

  async function handleSaveHabit() {
    setIsSavingHabit(true)
    setHabitMessage('')
    await onSaveHabit({
      weeklyTargetDays: weeklyTarget,
      dailyTargetKm: dailyKm,
      vacationMode: vacation,
      reminderEnabled: reminder,
      reminderHour,
    })
    setIsSavingHabit(false)
    setHabitMessage('已儲存習慣設定。')
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-3">
        <p className="m-0 text-xs text-slate-300">你的名稱</p>
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-900/60 px-3 py-3 text-sm text-slate-100"
        />
        <button
          type="button"
          onClick={() => void handleSaveName()}
          disabled={isSavingName}
          className="mt-2 w-full rounded-xl border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 disabled:opacity-50"
        >
          {isSavingName ? '儲存中...' : '儲存名稱'}
        </button>
        {nameMessage && (
          <p className="m-0 mt-2 text-xs text-emerald-300">{nameMessage}</p>
        )}
      </div>

      <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-3">
        <p className="m-0 mb-2 text-sm font-semibold text-slate-100">習慣目標設定</p>

        <label className="block space-y-1">
          <span className="text-xs text-slate-300">每週目標天數 ({weeklyTarget})</span>
          <input
            type="range"
            min={1}
            max={7}
            value={weeklyTarget}
            onChange={(e) => setWeeklyTarget(Number(e.target.value))}
            className="w-full"
          />
        </label>

        <label className="mt-2 block space-y-1">
          <span className="text-xs text-slate-300">每日目標公里 ({dailyKm} km)</span>
          <input
            type="range"
            min={0.5}
            max={10}
            step={0.5}
            value={dailyKm}
            onChange={(e) => setDailyKm(Number(e.target.value))}
            className="w-full"
          />
        </label>

        <label className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-300">休假模式（暫停 streak 計算）</span>
          <input type="checkbox" checked={vacation} onChange={(e) => setVacation(e.target.checked)} />
        </label>

        <label className="mt-2 flex items-center justify-between">
          <span className="text-xs text-slate-300">每日提醒通知</span>
          <input type="checkbox" checked={reminder} onChange={(e) => setReminder(e.target.checked)} />
        </label>

        {reminder && (
          <label className="mt-2 block space-y-1">
            <span className="text-xs text-slate-300">提醒時間 ({String(reminderHour).padStart(2, '0')}:00)</span>
            <input
              type="range"
              min={6}
              max={23}
              value={reminderHour}
              onChange={(e) => setReminderHour(Number(e.target.value))}
              className="w-full"
            />
          </label>
        )}

        <button
          type="button"
          onClick={() => void handleSaveHabit()}
          disabled={isSavingHabit}
          className="mt-3 w-full rounded-xl bg-blue-500 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {isSavingHabit ? '儲存中...' : '儲存習慣設定'}
        </button>
        {habitMessage && <p className="m-0 mt-2 text-xs text-emerald-300">{habitMessage}</p>}
      </div>

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
