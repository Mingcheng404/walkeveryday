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
  const [otp, setOtp] = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [noticeMessage, setNoticeMessage] = useState('')

  const modalTitle = useMemo(() => title ?? (mode === 'signin' ? '登入 WalkEveryDay' : '建立帳戶'), [mode, title])

  if (!isOpen) return null

  const submitDisabled =
    isSubmitting ||
    !email.trim() ||
    (mode === 'signin' && !password.trim()) ||
    (mode === 'signup' && !otpSent && !email.trim()) ||
    (mode === 'signup' && otpSent && (!otp.trim() || !password.trim() || !username.trim()))

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
      } else if (!otpSent) {
        // Step 1: send OTP confirmation email
        const { error } = await supabase.auth.signInWithOtp({
          email: email.trim(),
          options: { shouldCreateUser: false },
        })
        if (error) throw error
        setOtpSent(true)
        setNoticeMessage('已寄送驗證碼到你的 Email，請輸入收到的 6 位數驗證碼、密碼與名稱完成註冊。')
      } else {
        // Step 2: verify OTP then set password + username
        const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
          email: email.trim(),
          token: otp.trim(),
          type: 'signup',
        })
        if (verifyError) throw verifyError

        // Set password and username metadata
        if (verifyData.user) {
          const { error: updateError } = await supabase.auth.updateUser({
            password,
            data: { username: username.trim() },
          })
          if (updateError) throw updateError
        }

        setNoticeMessage('帳號建立成功！')
        onSuccess()
        onClose()
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
          <label className="block space-y-2">
            <span className="text-sm text-slate-200">Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={otpSent}
              className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-base text-slate-100 outline-none focus:border-blue-400 disabled:opacity-60"
              placeholder="you@example.com"
            />
          </label>

          {mode === 'signup' && otpSent && (
            <>
              <label className="block space-y-2">
                <span className="text-sm text-slate-200">Email 驗證碼</span>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={otp}
                  onChange={(e) => setOtp(e.target.value)}
                  className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-base tracking-widest text-slate-100 outline-none focus:border-blue-400"
                  placeholder="123456"
                />
              </label>
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
              <label className="block space-y-2">
                <span className="text-sm text-slate-200">設定密碼</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-xl border border-slate-600 bg-slate-800 px-4 py-3 text-base text-slate-100 outline-none focus:border-blue-400"
                  placeholder="至少 6 碼"
                />
              </label>
            </>
          )}

          {mode === 'signin' && (
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
          )}

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
            {isSubmitting
              ? '處理中...'
              : mode === 'signup' && !otpSent
                ? '寄送驗證碼'
                : mode === 'signup' && otpSent
                  ? '完成註冊'
                  : '登入'}
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
              setOtpSent(false)
              setOtp('')
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
  if (m.includes('email not confirmed')) return '此帳號尚未驗證 Email，請先到信箱點擊驗證連結。'
  if (m.includes('invalid login credentials')) return '帳號或密碼錯誤，請重新輸入。'
  if (m.includes('password should be at least')) return '密碼長度不足，請使用至少 6 碼。'
  if (m.includes('user already registered')) return '此 Email 已註冊，可直接登入或重設密碼。'
  if (m.includes('rate limit') || m.includes('over_email_send_rate_limit')) return '驗證信寄送太頻繁，請稍後再試。'
  if (m.includes('email_address_invalid')) return 'Email 格式無效，請改用可接收郵件的真實地址。'
  if (m.includes('token') && m.includes('invalid')) return '驗證碼無效或已過期，請重新寄送。'
  if (m.includes('row-level security') || m.includes('permission denied')) return '資料庫權限設定尚未完成，請先執行 schema.sql。'
  return rawMessage || (mode === 'signup' ? '註冊失敗，請稍後再試。' : '登入失敗，請稍後再試。')
}
