import { type FormEvent, useMemo, useState } from 'react'
import { isSupabaseConfigured, supabase } from '../lib/supabase'

type AuthMode = 'signin' | 'signup'

type AuthModalProps = {
  isOpen: boolean
  title?: string
  onClose: () => void
  onSuccess: () => void
}

export default function AuthModal({ isOpen, title, onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<AuthMode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [username, setUsername] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState('')

  const modalTitle = useMemo(() => title ?? (mode === 'signin' ? '登入 WalkEveryDay' : '建立帳戶'), [mode, title])

  if (!isOpen) return null

  const submitDisabled =
    isSubmitting ||
    !email.trim() ||
    !password.trim() ||
    (mode === 'signup' && !username.trim())

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    setErrorMessage('')
    setNoticeMessage('')

    if (!isSupabaseConfigured) {
      setErrorMessage('請先設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_ANON_KEY。')
      return
    }

    setIsSubmitting(true)
    try {
      if (mode === 'signin') {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw error
        onSuccess()
        onClose()
      } else {
        // Standard signUp: Supabase creates user and sends confirmation email (link by default)
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: { username: username.trim() },
            emailRedirectTo: window.location.origin,
          },
        })
        if (error) throw error

        if (data.session) {
          // Email confirmation disabled — logged in immediately
          onSuccess()
          onClose()
        } else {
          // Email confirmation required — tell user to check email for link
          setNoticeMessage('註冊成功！請到信箱點擊確認連結，完成後即可登入。')
          setMode('signin')
        }
      }
    } catch (error) {
      const message = resolveErrorMessage(error, mode)
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[1000] bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="mx-auto mt-14 max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="m-0 text-lg font-semibold text-slate-100">{modalTitle}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-slate-300 hover:bg-slate-700/60"
          >
            關閉
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'signup' && (
            <label className="block space-y-2">
              <span className="text-sm text-slate-200">用戶名稱</span>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-base text-slate-100 outline-none focus:border-blue-400"
                placeholder="例如：walker_hk"
              />
            </label>
          )}

          <label className="block space-y-2">
            <span className="text-sm text-slate-200">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-base text-slate-100 outline-none focus:border-blue-400"
              placeholder="you@example.com"
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-slate-200">密碼</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-base text-slate-100 outline-none focus:border-blue-400"
              placeholder="至少 6 碼"
            />
          </label>

          {errorMessage && (
            <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-300">
              {errorMessage}
            </p>
          )}
          {noticeMessage && (
            <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
              {noticeMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={submitDisabled}
            className="w-full rounded-xl bg-blue-500 px-4 py-3 text-base font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isSubmitting ? '處理中...' : mode === 'signin' ? '登入' : '註冊'}
          </button>
        </form>

        <div className="mt-4 text-center text-sm text-slate-300">
          {mode === 'signin' ? '未有帳戶？' : '已有帳戶？'}
          <button
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin')
              setErrorMessage('')
              setNoticeMessage('')
            }}
            className="ml-2 text-blue-300 underline underline-offset-2"
          >
            {mode === 'signin' ? '立即註冊' : '立即登入'}
          </button>
        </div>
      </div>
    </div>
  )
}

function resolveErrorMessage(error: unknown, mode: AuthMode): string {
  if (error instanceof Error && error.message) return normalizeAuthMessage(error.message, mode)
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message
    if (typeof message === 'string' && message.trim()) return normalizeAuthMessage(message, mode)
  }
  return mode === 'signup' ? '註冊失敗，請稍後再試。' : '登入失敗，請稍後再試。'
}

function normalizeAuthMessage(rawMessage: string, mode: AuthMode): string {
  const m = rawMessage.toLowerCase()
  if (m.includes('email not confirmed')) return '此帳號尚未驗證 Email，請先到信箱點擊確認連結。'
  if (m.includes('invalid login credentials')) return '帳號或密碼錯誤，請重新輸入。'
  if (m.includes('password should be at least')) return '密碼長度不足，請使用至少 6 碼。'
  if (m.includes('user already registered')) return '此 Email 已註冊，可直接登入。'
  if (m.includes('rate limit') || m.includes('over_email_send_rate_limit')) return '驗證信寄送太頻繁，請稍後再試。'
  if (m.includes('email_address_invalid')) return 'Email 格式無效，請改用可接收郵件的真實地址。'
  if (m.includes('row-level security') || m.includes('permission denied')) return '資料庫權限設定尚未完成，請先執行 schema.sql。'
  return rawMessage || (mode === 'signup' ? '註冊失敗，請稍後再試。' : '登入失敗，請稍後再試。')
}
