import type { Json } from './lib/database.types'
import { haversineKm, nearestCoordinateIndex, polylineDistanceKm } from './lib/geo'
import { generateRandomRoute } from './lib/route-generator'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import {
  applyHistoryProgress, buildLatestHistoryMap, calculateCurrentStreak,
  CALORIES_PER_KM, CHECKPOINT_UNLOCK_RADIUS_KM,
  habitRowToSettings, profileRowToProfileStats, rowToAchievementBadge,
  rowToRouteRecord, rowToWalkHistoryRecord,
} from './lib/app-helpers'
import type { LatLng, RouteRecord, WalkHistoryRecord, WalkStatus, HabitSettings } from './types/app'
import type { useAppLogic } from './App.logic'
import type { Handlers } from './App'

type S = ReturnType<typeof useAppLogic>
const GEO_SYNC_INTERVAL_MS = 10000

export function createHandlers(s: S): Handlers {
  function requestAuth(title: string) { s.setAuthTitle(title); s.setAuthOpen(true) }

  async function handleInstallPwa() {
    if (!s.installPromptEvent) return
    await s.installPromptEvent.prompt()
    await s.installPromptEvent.userChoice
    s.setInstallPromptEvent(null)
  }

  function activateRoute(route: RouteRecord | null, walkHistory?: WalkHistoryRecord) {
    if (!route) {
      s.setCurrentRoute(null); s.currentRouteRef.current = null; s.activeRoutePathRef.current = []
      s.coveredCoordinatesRef.current = []; s.walkedUntilIndexRef.current = 0
      s.setWalkedUntilIndex(0); s.setCurrentPosition(null); s.activeWalkHistoryIdRef.current = null
      return
    }
    const progress = applyHistoryProgress(route, walkHistory?.coveredCoordinates ?? [])
    const updated = { ...route, checkpoints: progress.checkpoints }
    s.setCurrentRoute(updated); s.currentRouteRef.current = updated
    s.activeRoutePathRef.current = updated.pathCoordinates
    s.coveredCoordinatesRef.current = walkHistory?.coveredCoordinates ?? []
    s.walkedUntilIndexRef.current = progress.walkedUntilIndex
    s.setWalkedUntilIndex(progress.walkedUntilIndex)
    s.setCurrentPosition((walkHistory?.coveredCoordinates ?? []).at(-1) ?? null)
    s.activeWalkHistoryIdRef.current = walkHistory ? walkHistory.id : null
  }

  async function loadUserData(userId: string, email?: string) {
    if (!isSupabaseConfigured) return
    s.setLoadingDashboard(true); s.setLoadingRoutes(true)
    try {
      const [rR, hR, pR, aR, uaR, hsR] = await Promise.allSettled([
        supabase.from('routes').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('walk_history').select('*').eq('user_id', userId).order('started_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
        supabase.from('achievements').select('*').order('threshold_distance_km', { ascending: true }),
        supabase.from('user_achievements').select('achievement_id').eq('user_id', userId),
        supabase.from('habit_settings').select('*').eq('user_id', userId).maybeSingle(),
      ])
      if (rR.status === 'fulfilled' && rR.value.data) s.setRoutes(rR.value.data.map(rowToRouteRecord).filter((x): x is RouteRecord => x !== null))
      else s.setRoutes([])
      let wh: WalkHistoryRecord[] = []
      if (hR.status === 'fulfilled' && hR.value.data) {
        wh = hR.value.data.map(rowToWalkHistoryRecord)
        s.setAllWalkHistory(wh); s.setLatestHistoryByRouteId(buildLatestHistoryMap(wh))
      } else { s.setAllWalkHistory([]); s.setLatestHistoryByRouteId({}) }
      let pRow = pR.status === 'fulfilled' ? pR.value.data : null
      if (!pRow) {
        const base = email?.split('@')[0]?.trim() || `walker_${userId.slice(0, 8)}`
        const { data } = await supabase.from('profiles').upsert({ id: userId, username: base.slice(0, 30) }, { onConflict: 'id' }).select('*').single()
        if (data) pRow = data
      }
      const totalCal = wh.reduce((sum, i) => sum + i.caloriesBurned, 0)
      const completed = wh.filter((i) => i.status === 'completed').length
      if (pRow) s.setProfile(profileRowToProfileStats(pRow, totalCal, completed))
      if (aR.status === 'fulfilled' && aR.value.data) s.setAchievements(aR.value.data.map(rowToAchievementBadge))
      else s.setAchievements([])
      if (uaR.status === 'fulfilled' && uaR.value.data) s.setUnlockedAchievementIds(uaR.value.data.map((i) => i.achievement_id))
      else s.setUnlockedAchievementIds([])
      if (hsR.status === 'fulfilled' && hsR.value.data) s.setHabitSettings(habitRowToSettings(hsR.value.data))
      else s.setHabitSettings({ weeklyTargetDays: 7, dailyTargetKm: 2, vacationMode: false, reminderEnabled: false, reminderHour: 20 })
    } catch (e) {
      s.setStatusMessage(e instanceof Error ? e.message : '載入 Dashboard 失敗。')
    } finally { s.setLoadingDashboard(false); s.setLoadingRoutes(false) }
  }

  async function handleGenerateRoute() {
    if (!isSupabaseConfigured) { s.setStatusMessage('請先設定 Supabase 環境變數。'); return }
    const mins = Number.parseInt(s.estimatedTimeMins, 10)
    if (!Number.isFinite(mins) || mins < 10 || mins > 180) { s.setStatusMessage('請輸入 10 至 180 分鐘之間的步行時間。'); return }
    s.setIsGenerating(true); s.setStatusMessage('正在取得你的 GPS 位置...')

    // Step 1: Get user's GPS location
    let userLocation: LatLng | null = null
    if ('geolocation' in navigator) {
      try {
        userLocation = await new Promise<LatLng>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            (pos) => resolve([pos.coords.latitude, pos.coords.longitude]),
            (e) => reject(e),
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 },
          )
        })
        s.setCurrentPosition(userLocation)
      } catch {
        // GPS failed - continue without user location (random start)
      }
    }

    s.setStatusMessage(userLocation ? '正在從你的位置生成路線...' : '無法取得定位，正在生成隨機路線...')
    try {
      const gen = await generateRandomRoute({
        regionId: s.selectedRegionId,
        estimatedTimeMins: mins,
        boundaries: s.boundaries,
        userLocation,
      })
      // Build a temporary route record for display (works without login)
      const tempRoute: RouteRecord = {
        id: `temp_${Date.now()}`,
        district: gen.district,
        routeName: null,
        estimatedTimeMins: gen.estimatedTimeMins,
        pathCoordinates: gen.pathCoordinates,
        checkpoints: gen.checkpoints,
        isPublic: false,
        routeSource: 'generated',
        totalDistanceKm: gen.totalDistanceKm,
        createdAt: new Date().toISOString(),
      }
      // If logged in, try to save to DB (but don't fail if DB has issues)
      if (s.session) {
        try {
          const { data, error } = await supabase.from('routes').insert({
            user_id: s.session.user.id, district: gen.district, estimated_time_mins: gen.estimatedTimeMins,
            path_coordinates: gen.pathCoordinates as unknown as Json, checkpoints: gen.checkpoints as unknown as Json,
            is_public: false, total_distance_km: gen.totalDistanceKm,
          }).select('*').single()
          if (!error && data) {
            const saved = rowToRouteRecord(data)
            if (saved) { activateRoute(saved, undefined); s.setActiveTab('explore') }
            s.setStatusMessage(`已生成並儲存路線，含 ${gen.checkpoints.length} 個打卡點。`)
            await loadUserData(s.session.user.id, s.session.user.email ?? undefined)
            return
          }
          if (error) {
            // DB constraint error - show route anyway with helpful message
            activateRoute(tempRoute, undefined); s.setActiveTab('explore')
            s.setStatusMessage(`路線已生成（DB 儲存失敗：${error.message}。請到 Supabase 執行 schema.sql）`)
            return
          }
        } catch {
          // Network error - still show the route
          activateRoute(tempRoute, undefined); s.setActiveTab('explore')
          s.setStatusMessage('路線已生成（網路問題，稍後可儲存）')
          return
        }
      }
      // Guest mode or DB save failed - just show the route
      activateRoute(tempRoute, undefined); s.setActiveTab('explore')
      s.setStatusMessage(s.session ? '路線已生成（資料庫儲存失敗，請先更新 schema.sql）' : `已生成路線（登入後可儲存），含 ${gen.checkpoints.length} 個打卡點。`)
    } catch (e) {
      s.setStatusMessage(e instanceof Error ? e.message : '路線生成失敗。')
    } finally { s.setIsGenerating(false) }
  }

  async function handleStartTracking() {
    if (!s.currentRoute) { s.setStatusMessage('請先生成或選擇一條路線。'); return }
    if (!('geolocation' in navigator)) { s.setLocationError('此瀏覽器不支援定位。'); return }
    if (s.isTracking) return
    s.setLocationError('')
    s.setStatusMessage('正在請求定位權限...')

    // Request notification permission if available
    if ('Notification' in window && Notification.permission === 'default') void Notification.requestPermission()

    // Create walk history record if logged in
    if (s.session && isSupabaseConfigured) {
      const existing = s.latestHistoryByRouteId[s.currentRoute.id]
      if (existing && existing.status !== 'completed') {
        s.activeWalkHistoryIdRef.current = existing.id
        s.coveredCoordinatesRef.current = existing.coveredCoordinates
        await supabase.from('walk_history').update({ status: 'in_progress', completed_at: null }).eq('id', existing.id)
      } else {
        try {
          const { data, error } = await supabase.from('walk_history').insert({
            user_id: s.session.user.id, route_id: s.currentRoute.id, status: 'in_progress',
            covered_coordinates: s.coveredCoordinatesRef.current as unknown as Json, calories_burned: 0,
            started_at: new Date().toISOString(),
          }).select('id').single()
          if (!error && data) s.activeWalkHistoryIdRef.current = data.id
        } catch {
          // DB insert failed - still allow tracking without saving
        }
      }
    }

    s.lastSyncAtRef.current = 0
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        const np: LatLng = [pos.coords.latitude, pos.coords.longitude]
        s.setCurrentPosition(np)
        s.coveredCoordinatesRef.current = [...s.coveredCoordinatesRef.current, np]
        const ni = nearestCoordinateIndex(s.activeRoutePathRef.current, np)
        s.setWalkedUntilIndex((p) => { const nx = Math.max(p, ni); s.walkedUntilIndexRef.current = nx; return nx })
        updateCheckpointUnlock(np)
        const now = Date.now()
        if (now - s.lastSyncAtRef.current > GEO_SYNC_INTERVAL_MS) {
          s.lastSyncAtRef.current = now
          if (s.activeWalkHistoryIdRef.current) void syncWalkHistory('in_progress')
        }
        const rl = s.activeRoutePathRef.current.length
        if (rl > 0 && ni >= Math.max(1, rl - 3)) void stopTracking('completed')
      },
      (e) => {
        const msgs: Record<number, string> = {
          1: '定位權限被拒絕，請在瀏覽器設定中允許定位。',
          2: '無法取得位置資訊，請確認 GPS 已開啟。',
          3: '定位逾時，請重試。',
        }
        s.setLocationError(msgs[e.code] ?? e.message)
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    )
    s.watchIdRef.current = wid; s.setIsTracking(true)
    s.setStatusMessage(s.session ? 'GPS 追蹤已啟動，靠近打卡點會自動解鎖。' : 'GPS 追蹤已啟動（登入後可儲存進度）。')
  }

  function updateCheckpointUnlock(np: LatLng) {
    s.setCurrentRoute((prev) => {
      if (!prev || prev.checkpoints.length === 0) return prev
      let changed = false
      const cps = prev.checkpoints.map((c) => {
        if (c.unlocked) return c
        const near = haversineKm(c.coordinate, np) <= CHECKPOINT_UNLOCK_RADIUS_KM
        if (!near) return c
        changed = true
        return { ...c, unlocked: true }
      })
      if (!changed) return prev
      const updated = { ...prev, checkpoints: cps }
      s.currentRouteRef.current = updated
      s.setStatusMessage('已解鎖新打卡點！')
      return updated
    })
  }

  async function stopTracking(status: WalkStatus) {
    if (s.watchIdRef.current !== null) { navigator.geolocation.clearWatch(s.watchIdRef.current); s.watchIdRef.current = null }
    s.setIsTracking(false)
    await syncWalkHistory(status)
    if (status === 'completed' && s.session?.user.id) {
      const route = s.currentRouteRef.current
      if (route) await updateProfileAfterCompletion(s.session.user.id, route)
      s.activeWalkHistoryIdRef.current = null
      s.setStatusMessage('恭喜，已完成本次路線！')
    } else if (status === 'paused') {
      s.setStatusMessage('已暫停 GPS 追蹤，可稍後繼續。')
    }
    if (s.session?.user.id) await loadUserData(s.session.user.id, s.session.user.email ?? undefined)
  }

  async function syncWalkHistory(status: WalkStatus) {
    const hid = s.activeWalkHistoryIdRef.current
    const route = s.currentRouteRef.current
    if (!hid || !route || !isSupabaseConfigured) return
    const walkedSlice = route.pathCoordinates.slice(0, Math.min(route.pathCoordinates.length, s.walkedUntilIndexRef.current + 1))
    const walkedDist = walkedSlice.length > 1 ? polylineDistanceKm(walkedSlice) : 0
    const cal = Number((walkedDist * CALORIES_PER_KM).toFixed(1))
    const payload: { status: string; covered_coordinates: Json; calories_burned: number; completed_at?: string } = {
      status, covered_coordinates: s.coveredCoordinatesRef.current as unknown as Json, calories_burned: cal,
    }
    if (status === 'completed') payload.completed_at = new Date().toISOString()
    const { error } = await supabase.from('walk_history').update(payload).eq('id', hid)
    if (error) s.setStatusMessage(`同步行走紀錄失敗：${error.message}`)
  }

  async function updateProfileAfterCompletion(userId: string, route: RouteRecord) {
    if (!isSupabaseConfigured) return
    const dist = route.totalDistanceKm
    const cal = Number((dist * CALORIES_PER_KM).toFixed(1))
    const cur = s.profile ?? { username: 'walker', totalDistanceKm: 0, totalWalkTimeMins: 0, currentStreak: 0, totalCaloriesBurned: 0, completedWalks: 0 }
    const { data: completedRows, error: ce } = await supabase.from('walk_history').select('completed_at').eq('user_id', userId).eq('status', 'completed').not('completed_at', 'is', null).order('completed_at', { ascending: false })
    if (ce) { s.setStatusMessage(`更新統計時讀取紀錄失敗：${ce.message}`); return }
    const streak = calculateCurrentStreak(completedRows.map((r) => r.completed_at).filter((v): v is string => Boolean(v)), s.habitSettings?.vacationMode ?? false)
    const cnt = completedRows.length
    const { error: pe } = await supabase.from('profiles').update({ total_distance_km: Number((cur.totalDistanceKm + dist).toFixed(2)), total_walk_time_mins: cur.totalWalkTimeMins + route.estimatedTimeMins, current_streak: streak }).eq('id', userId)
    if (pe) { s.setStatusMessage(`更新個人統計失敗：${pe.message}`); return }
    await unlockAchievements({ userId, totalDistanceKm: cur.totalDistanceKm + dist, completedWalkCount: cnt, currentStreak: streak })
    s.setProfile({ ...cur, totalDistanceKm: Number((cur.totalDistanceKm + dist).toFixed(2)), totalWalkTimeMins: cur.totalWalkTimeMins + route.estimatedTimeMins, currentStreak: streak, totalCaloriesBurned: cur.totalCaloriesBurned + cal, completedWalks: cnt })
  }

  async function unlockAchievements(a: { userId: string; totalDistanceKm: number; completedWalkCount: number; currentStreak: number }) {
    const { data: all, error: ae } = await supabase.from('achievements').select('*')
    if (ae) return
    const { data: unlocked, error: ue } = await supabase.from('user_achievements').select('achievement_id').eq('user_id', a.userId)
    if (ue) return
    const us = new Set(unlocked.map((r) => r.achievement_id))
    const toUnlock = all.filter((ach) => !us.has(ach.id) && Number(ach.threshold_distance_km) <= a.totalDistanceKm && Number(ach.threshold_walks) <= a.completedWalkCount && Number(ach.threshold_streak) <= a.currentStreak)
    if (toUnlock.length === 0) return
    const { error } = await supabase.from('user_achievements').insert(toUnlock.map((ach) => ({ user_id: a.userId, achievement_id: ach.id })))
    if (error) return
    s.setStatusMessage(`🎉 解鎖新成就：${toUnlock.map((i) => i.title).join('、')}`)
  }

  async function handleStartRecording() {
    if (!('geolocation' in navigator)) { s.setLocationError('此瀏覽器不支援定位。'); return }
    s.setLocationError('')
    s.setRecordingTrack([]); s.setRecordingDistanceKm(0); s.setRecordingDurationSec(0)
    s.setIsRecording(true); s.setStatusMessage('開始記錄路線...')
    const wid = navigator.geolocation.watchPosition(
      (pos) => {
        const np: LatLng = [pos.coords.latitude, pos.coords.longitude]
        s.setRecordingTrack((prev) => {
          const next = [...prev, np]
          const dist = next.length > 1 ? polylineDistanceKm(next) : 0
          s.setRecordingDistanceKm(Number(dist.toFixed(3)))
          return next
        })
      },
      (e) => {
        const msgs: Record<number, string> = {
          1: '定位權限被拒絕，請在瀏覽器設定中允許定位。',
          2: '無法取得位置資訊，請確認 GPS 已開啟。',
          3: '定位逾時，請重試。',
        }
        s.setLocationError(msgs[e.code] ?? e.message)
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 5000 },
    )
    s.recordWatchIdRef.current = wid
    s.recordTimerRef.current = setInterval(() => s.setRecordingDurationSec((p) => p + 1), 1000)
  }

  function handleStopRecording() {
    if (s.recordWatchIdRef.current !== null) { navigator.geolocation.clearWatch(s.recordWatchIdRef.current); s.recordWatchIdRef.current = null }
    if (s.recordTimerRef.current !== null) { clearInterval(s.recordTimerRef.current); s.recordTimerRef.current = null }
    s.setIsRecording(false)
    s.setStatusMessage('已停止記錄，請命名並儲存。')
  }

  async function handleSaveRecording(routeName: string, isPublic: boolean) {
    if (!isSupabaseConfigured) { s.setStatusMessage('請先設定 Supabase 環境變數。'); return }
    if (!s.session) { requestAuth('登入後可儲存自記路線。'); return }
    const track = s.recordingTrack
    if (track.length < 2) { s.setStatusMessage('軌跡太短，無法儲存。'); return }
    const dist = polylineDistanceKm(track)
    const mins = Math.max(1, Math.round(s.recordingDurationSec / 60))
    const { data, error } = await supabase.from('routes').insert({
      user_id: s.session.user.id, district: 'Custom', route_name: routeName,
      estimated_time_mins: mins, path_coordinates: track as unknown as Json,
      checkpoints: [] as unknown as Json, is_public: isPublic, route_source: 'recorded',
      total_distance_km: Number(dist.toFixed(2)),
    }).select('*').single()
    if (error) { s.setStatusMessage(`儲存路線失敗：${error.message}`); return }
    const saved = rowToRouteRecord(data)
    if (saved) { activateRoute(saved, undefined); s.setActiveTab('explore') }
    s.setRecordingTrack([]); s.setRecordingDistanceKm(0); s.setRecordingDurationSec(0)
    s.setStatusMessage(`已儲存自記路線「${routeName}」！`)
    await loadUserData(s.session.user.id, s.session.user.email ?? undefined)
  }

  async function handleOpenRoute(route: RouteRecord) {
    if (s.isTracking) await stopTracking('paused')
    const h = s.latestHistoryByRouteId[route.id]
    activateRoute(route, h && h.status !== 'completed' ? h : undefined)
    s.setActiveTab('explore')
    s.setStatusMessage('已載入路線，按下「開始 GPS 追蹤」即可行走。')
  }

  async function handleTogglePublic(routeId: string, next: boolean) {
    if (!s.session) return
    const { error } = await supabase.from('routes').update({ is_public: next }).eq('id', routeId).eq('user_id', s.session.user.id)
    if (error) { s.setStatusMessage(`更新公開狀態失敗：${error.message}`); return }
    s.setRoutes((p) => p.map((r) => r.id === routeId ? { ...r, isPublic: next } : r))
    s.setCurrentRoute((p) => p && p.id === routeId ? { ...p, isPublic: next } : p)
    s.setStatusMessage(next ? '路線已設為公開，可生成分享卡。' : '路線已取消公開。')
  }

  async function handleDeleteRoute(routeId: string) {
    if (!s.session) return
    const { error } = await supabase.from('routes').delete().eq('id', routeId).eq('user_id', s.session.user.id)
    if (error) { s.setStatusMessage(`刪除路線失敗：${error.message}`); return }
    s.setRoutes((p) => p.filter((r) => r.id !== routeId))
    if (s.currentRoute?.id === routeId) activateRoute(null, undefined)
    s.setStatusMessage('已刪除路線。')
  }

  async function handleSaveUsername(username: string) {
    if (!s.session?.user.id) return
    const { error } = await supabase.from('profiles').update({ username }).eq('id', s.session.user.id)
    if (error) { s.setStatusMessage(`更新名稱失敗：${error.message}`); return }
    s.setProfile((p) => p ? { ...p, username } : p)
  }

  async function handleSaveHabit(settings: HabitSettings) {
    if (!s.session?.user.id) return
    const { error } = await supabase.from('habit_settings').upsert({
      user_id: s.session.user.id, weekly_target_days: settings.weeklyTargetDays,
      daily_target_km: settings.dailyTargetKm, vacation_mode: settings.vacationMode,
      reminder_enabled: settings.reminderEnabled, reminder_hour: settings.reminderHour,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    if (error) { s.setStatusMessage(`儲存習慣設定失敗：${error.message}`); return }
    s.setHabitSettings(settings)
    if (settings.reminderEnabled && 'Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }
  }

  async function handleSignOut() {
    if (s.isTracking) await stopTracking('paused')
    await supabase.auth.signOut()
    s.setSession(null)
    s.setRoutes([]); s.setLatestHistoryByRouteId({}); s.setAllWalkHistory([])
    s.setProfile(null); s.setUnlockedAchievementIds([]); s.setHabitSettings(null)
    activateRoute(null, undefined)
    s.setStatusMessage('你已登出帳戶。')
  }

  return {
    requestAuth, handleInstallPwa, loadUserData, activateRoute,
    handleGenerateRoute, handleStartTracking, stopTracking,
    handleStartRecording, handleStopRecording, handleSaveRecording,
    handleOpenRoute, handleTogglePublic, handleDeleteRoute,
    handleSaveUsername, handleSaveHabit, handleSignOut,
  }
}
