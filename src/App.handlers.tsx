import { useEffect } from 'react'
import { fetchDistrictBoundaries } from './lib/districts'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { rowToRouteRecord } from './lib/app-helpers'
import type { useAppLogic } from './App.logic'
import type { Handlers } from './App'

type S = ReturnType<typeof useAppLogic>

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function useBootstrapEffects(s: S, h: Handlers) {
  useEffect(() => {
    const c = new AbortController()
    void fetchDistrictBoundaries(c.signal).then(s.setBoundaries).catch((e) => {
      if (!c.signal.aborted) s.setBoundariesError(e instanceof Error ? e.message : '地圖區域資料載入失敗，路線生成仍可用備援邊界。')
    })
    return () => c.abort()
  }, [])

  useEffect(() => {
    const on = () => s.setIsOnline(true), off = () => s.setIsOnline(false)
    window.addEventListener('online', on); window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => { const ie = e as BeforeInstallPromptEvent; ie.preventDefault(); s.setInstallPromptEvent(ie) }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  useEffect(() => () => {
    if (s.watchIdRef.current !== null) navigator.geolocation.clearWatch(s.watchIdRef.current)
    if (s.recordWatchIdRef.current !== null) navigator.geolocation.clearWatch(s.recordWatchIdRef.current)
    if (s.recordTimerRef.current !== null) clearInterval(s.recordTimerRef.current)
  }, [])

  useEffect(() => {
    s.currentRouteRef.current = s.currentRoute
    s.activeRoutePathRef.current = s.currentRoute?.pathCoordinates ?? []
  }, [s.currentRoute])

  useEffect(() => {
    if (!s.isTracking || !('Notification' in window)) return
    const onVis = () => {
      if (document.hidden && Notification.permission === 'granted')
        new Notification('WalkEveryDay 追蹤中', { body: '已在背景運行，請保持定位與電量充足。' })
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [s.isTracking])

  useEffect(() => {
    if (!isSupabaseConfigured) return
    void supabase.auth.getSession().then(({ data }) => {
      s.setSession(data.session)
      if (data.session?.user.id) void h.loadUserData(data.session.user.id, data.session.user.email ?? undefined)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, next) => {
      s.setSession(next)
      if (next?.user.id) void h.loadUserData(next.user.id, next.user.email ?? undefined)
      if (!next) {
        s.setRoutes([]); s.setLatestHistoryByRouteId({}); s.setAllWalkHistory([])
        s.setProfile(null); s.setUnlockedAchievementIds([]); s.setHabitSettings(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!s.habitSettings?.reminderEnabled || !s.session) return
    const check = () => {
      const hkHour = (new Date().getUTCHours() + 8) % 24
      if (hkHour === s.habitSettings!.reminderHour && 'Notification' in window && Notification.permission === 'granted')
        new Notification('WalkEveryDay 提醒', { body: '今天還沒散步，出門走走吧！' })
    }
    const iv = setInterval(check, 60000)
    return () => clearInterval(iv)
  }, [s.habitSettings, s.session])

  useEffect(() => {
    if (!isSupabaseConfigured || s.hasLoadedPublicRouteRef.current) return
    const id = new URLSearchParams(window.location.search).get('publicRoute')
    if (!id) { s.hasLoadedPublicRouteRef.current = true; return }
    s.hasLoadedPublicRouteRef.current = true
    void (async () => {
      const { data, error } = await supabase.from('routes').select('*').eq('id', id).eq('is_public', true).single()
      if (error) { s.setStatusMessage('公開路線不存在或無法讀取。'); return }
      const r = rowToRouteRecord(data)
      if (!r) { s.setStatusMessage('公開路線資料格式不正確。'); return }
      h.activateRoute(r, undefined); s.setActiveTab('explore'); s.setStatusMessage('已載入公開路線。')
    })()
  }, [])
}
