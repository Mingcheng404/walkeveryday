import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import AuthModal from './components/AuthModal'
import BottomNav, { type AppTab } from './components/BottomNav'
import BottomSheet from './components/BottomSheet'
import HistoryList from './components/HistoryList'
import MapView from './components/MapView'
import ProfilePanel from './components/ProfilePanel'
import ShareRouteCard from './components/ShareRouteCard'
import StatsPanel from './components/StatsPanel'
import type { Database, Json } from './lib/database.types'
import {
  ACTIVE_REGIONS,
  DISTRICT_NAME_ZH,
  fetchDistrictBoundaries,
  getRegionDisplayName,
  type ActiveRegionId,
  type DistrictFeatureCollection,
} from './lib/districts'
import { haversineKm, nearestCoordinateIndex, polylineDistanceKm } from './lib/geo'
import { generateRandomRoute } from './lib/route-generator'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import type {
  AchievementBadge,
  LatLng,
  ProfileStats,
  RouteCheckpoint,
  RouteRecord,
  WalkHistoryRecord,
  WalkStatus,
} from './types/app'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

type RoutesRow = Database['public']['Tables']['routes']['Row']
type WalkHistoryRow = Database['public']['Tables']['walk_history']['Row']
type ProfileRow = Database['public']['Tables']['profiles']['Row']
type AchievementRow = Database['public']['Tables']['achievements']['Row']

const CHECKPOINT_UNLOCK_RADIUS_KM = 0.06
const GEO_SYNC_INTERVAL_MS = 10000
const CALORIES_PER_KM = 55

export default function App() {
  const [session, setSession] = useState<Session | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authTitle, setAuthTitle] = useState('登入 WalkEveryDay')

  const [boundaries, setBoundaries] = useState<DistrictFeatureCollection | null>(null)
  const [boundariesError, setBoundariesError] = useState('')
  const [selectedRegionId, setSelectedRegionId] = useState<ActiveRegionId>('TUEN_MUN')
  const [estimatedTimeMins, setEstimatedTimeMins] = useState('30')
  const [isGenerating, setIsGenerating] = useState(false)

  const [activeTab, setActiveTab] = useState<AppTab>('explore')
  const [routes, setRoutes] = useState<RouteRecord[]>([])
  const [latestHistoryByRouteId, setLatestHistoryByRouteId] = useState<
    Record<string, WalkHistoryRecord | undefined>
  >({})
  const [loadingRoutes, setLoadingRoutes] = useState(false)
  const [loadingDashboard, setLoadingDashboard] = useState(false)

  const [profile, setProfile] = useState<ProfileStats | null>(null)
  const [achievements, setAchievements] = useState<AchievementBadge[]>([])
  const [unlockedAchievementIds, setUnlockedAchievementIds] = useState<string[]>([])

  const [currentRoute, setCurrentRoute] = useState<RouteRecord | null>(null)
  const [shareRoute, setShareRoute] = useState<RouteRecord | null>(null)
  const [statusMessage, setStatusMessage] = useState('選擇區域與步行時間，即可產生探索路線。')
  const [locationError, setLocationError] = useState('')
  const [isTracking, setIsTracking] = useState(false)
  const [walkedUntilIndex, setWalkedUntilIndex] = useState(0)
  const [currentPosition, setCurrentPosition] = useState<LatLng | null>(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)

  const watchIdRef = useRef<number | null>(null)
  const activeRoutePathRef = useRef<LatLng[]>([])
  const currentRouteRef = useRef<RouteRecord | null>(null)
  const coveredCoordinatesRef = useRef<LatLng[]>([])
  const activeWalkHistoryIdRef = useRef<string | null>(null)
  const walkedUntilIndexRef = useRef(0)
  const lastSyncAtRef = useRef(0)
  const hasLoadedPublicRouteRef = useRef(false)

  const selectedRegionName = useMemo(() => getRegionDisplayName(selectedRegionId), [selectedRegionId])
  const currentRouteName = useMemo(() => {
    if (!currentRoute) {
      return selectedRegionName
    }
    return DISTRICT_NAME_ZH[currentRoute.district] ?? currentRoute.district
  }, [currentRoute, selectedRegionName])

  const unlockedAchievementIdSet = useMemo(
    () => new Set(unlockedAchievementIds),
    [unlockedAchievementIds],
  )

  const currentRouteUnlockedCheckpointCount = useMemo(() => {
    if (!currentRoute) {
      return 0
    }
    return currentRoute.checkpoints.filter((checkpoint) => checkpoint.unlocked).length
  }, [currentRoute])

  const progressPercentage = useMemo(() => {
    if (!currentRoute || currentRoute.pathCoordinates.length < 2) {
      return 0
    }
    const progress = walkedUntilIndex / (currentRoute.pathCoordinates.length - 1)
    return Math.max(0, Math.min(100, Math.round(progress * 100)))
  }, [currentRoute, walkedUntilIndex])

  useEffect(() => {
    const controller = new AbortController()

    void fetchDistrictBoundaries(controller.signal)
      .then((collection) => setBoundaries(collection))
      .catch((error) => {
        if (controller.signal.aborted) {
          return
        }
        const message = error instanceof Error ? error.message : '地圖區域資料載入失敗。'
        setBoundariesError(message)
      })

    return () => {
      controller.abort()
    }
  }, [])

  useEffect(() => {
    const onOnline = () => setIsOnline(true)
    const onOffline = () => setIsOnline(false)
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  useEffect(() => {
    const handler = (event: Event) => {
      const installEvent = event as BeforeInstallPromptEvent
      installEvent.preventDefault()
      setInstallPromptEvent(installEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
      }
    }
  }, [])

  useEffect(() => {
    currentRouteRef.current = currentRoute
    activeRoutePathRef.current = currentRoute?.pathCoordinates ?? []
  }, [currentRoute])

  useEffect(() => {
    if (!isTracking || !('Notification' in window)) {
      return
    }

    const onVisibilityChange = () => {
      if (document.hidden && Notification.permission === 'granted') {
        new Notification('WalkEveryDay 追蹤中', {
          body: '已在背景運行，請保持定位與電量充足。',
        })
      }
    }

    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [isTracking])

  useEffect(() => {
    if (!isSupabaseConfigured || hasLoadedPublicRouteRef.current) {
      return
    }
    const publicRouteId = new URLSearchParams(window.location.search).get('publicRoute')
    if (!publicRouteId) {
      hasLoadedPublicRouteRef.current = true
      return
    }

    hasLoadedPublicRouteRef.current = true
    void loadPublicRoute(publicRouteId)
  }, [])

  const loadUserData = useCallback(async (userId: string, email?: string): Promise<void> => {
    if (!isSupabaseConfigured) {
      return
    }

    setLoadingDashboard(true)
    setLoadingRoutes(true)
    try {
      const [routesResult, historyResult, profileResult, achievementsResult, userAchievementsResult] =
        await Promise.all([
          supabase
            .from('routes')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false }),
          supabase
            .from('walk_history')
            .select('*')
            .eq('user_id', userId)
            .order('started_at', { ascending: false }),
          supabase.from('profiles').select('*').eq('id', userId).maybeSingle(),
          supabase.from('achievements').select('*').order('threshold_distance_km', { ascending: true }),
          supabase.from('user_achievements').select('achievement_id').eq('user_id', userId),
        ])

      if (routesResult.error) {
        throw routesResult.error
      }
      if (historyResult.error) {
        throw historyResult.error
      }
      if (profileResult.error) {
        throw profileResult.error
      }
      if (achievementsResult.error) {
        throw achievementsResult.error
      }
      if (userAchievementsResult.error) {
        throw userAchievementsResult.error
      }

      const parsedRoutes = routesResult.data
        .map((row) => rowToRouteRecord(row))
        .filter((item): item is RouteRecord => item !== null)
      setRoutes(parsedRoutes)

      const walkHistory = historyResult.data.map((row) => rowToWalkHistoryRecord(row))
      setLatestHistoryByRouteId(buildLatestHistoryMap(walkHistory))

      const totalCaloriesBurned = walkHistory.reduce((sum, item) => sum + item.caloriesBurned, 0)
      const completedWalks = walkHistory.filter((item) => item.status === 'completed').length

      let profileRow = profileResult.data
      if (!profileRow) {
        const baseName = email?.split('@')[0]?.trim() || `walker_${userId.slice(0, 8)}`
        const fallbackUsername = baseName.slice(0, 30)
        const { data: createdProfile, error: createProfileError } = await supabase
          .from('profiles')
          .upsert(
            {
              id: userId,
              username: fallbackUsername,
            },
            { onConflict: 'id' },
          )
          .select('*')
          .single()

        if (createProfileError) {
          throw createProfileError
        }
        profileRow = createdProfile
      }

      const parsedProfile = profileRowToProfileStats(profileRow, totalCaloriesBurned, completedWalks)
      setProfile(parsedProfile)

      const parsedAchievements = achievementsResult.data.map((row) => rowToAchievementBadge(row))
      setAchievements(parsedAchievements)
      setUnlockedAchievementIds(userAchievementsResult.data.map((item) => item.achievement_id))
    } catch (error) {
      const message = error instanceof Error ? error.message : '載入 Dashboard 失敗。'
      setStatusMessage(message)
    } finally {
      setLoadingDashboard(false)
      setLoadingRoutes(false)
    }
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      return
    }

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session)
      if (data.session?.user.id) {
        void loadUserData(data.session.user.id, data.session.user.email ?? undefined)
      }
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      if (nextSession?.user.id) {
        void loadUserData(nextSession.user.id, nextSession.user.email ?? undefined)
      }
      if (!nextSession) {
        setRoutes([])
        setLatestHistoryByRouteId({})
        setProfile(null)
        setUnlockedAchievementIds([])
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [loadUserData])

  async function loadPublicRoute(publicRouteId: string): Promise<void> {
    const { data, error } = await supabase
      .from('routes')
      .select('*')
      .eq('id', publicRouteId)
      .eq('is_public', true)
      .single()

    if (error) {
      setStatusMessage('公開路線不存在或無法讀取。')
      return
    }

    const route = rowToRouteRecord(data)
    if (!route) {
      setStatusMessage('公開路線資料格式不正確。')
      return
    }

    activateRoute(route, undefined)
    setActiveTab('explore')
    setStatusMessage('已載入公開路線，你可直接開始探索。')
  }

  async function handleGenerateRoute(): Promise<void> {
    if (!session) {
      requestAuth('請先登入，再生成個人路線。')
      return
    }
    if (!isSupabaseConfigured) {
      setStatusMessage('請先設定 Supabase 環境變數。')
      return
    }
    if (!boundaries) {
      setStatusMessage('區域邊界尚未載入完成，請稍候。')
      return
    }

    const mins = Number.parseInt(estimatedTimeMins, 10)
    if (!Number.isFinite(mins) || mins < 10 || mins > 180) {
      setStatusMessage('請輸入 10 至 180 分鐘之間的步行時間。')
      return
    }

    setIsGenerating(true)
    setStatusMessage('正在生成隨機路線與打卡點...')

    try {
      const generatedRoute = await generateRandomRoute({
        regionId: selectedRegionId,
        estimatedTimeMins: mins,
        boundaries,
      })

      const { data, error } = await supabase
        .from('routes')
        .insert({
          user_id: session.user.id,
          district: generatedRoute.district,
          estimated_time_mins: generatedRoute.estimatedTimeMins,
          path_coordinates: generatedRoute.pathCoordinates as unknown as Json,
          checkpoints: generatedRoute.checkpoints as unknown as Json,
          is_public: false,
          total_distance_km: generatedRoute.totalDistanceKm,
        })
        .select('*')
        .single()

      if (error) {
        throw error
      }

      const nextRoute = rowToRouteRecord(data)
      if (!nextRoute) {
        throw new Error('路線資料格式異常。')
      }

      activateRoute(nextRoute, undefined)
      setActiveTab('explore')
      setStatusMessage(
        `已生成 ${selectedRegionName} 路線，含 ${nextRoute.checkpoints.length} 個打卡點。`,
      )

      await loadUserData(session.user.id, session.user.email ?? undefined)
    } catch (error) {
      const message = error instanceof Error ? error.message : '路線生成失敗。'
      setStatusMessage(message)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleStartTracking(): Promise<void> {
    if (!session) {
      requestAuth('請先登入，才能啟用 GPS 追蹤。')
      return
    }
    if (!isSupabaseConfigured) {
      setStatusMessage('請先設定 Supabase 環境變數。')
      return
    }
    if (!currentRoute) {
      setStatusMessage('請先生成或選擇一條路線。')
      return
    }
    if (!('geolocation' in navigator)) {
      setLocationError('此瀏覽器不支援定位。')
      return
    }
    if (isTracking) {
      return
    }

    if ('Notification' in window && Notification.permission === 'default') {
      void Notification.requestPermission()
    }

    const existingHistory = latestHistoryByRouteId[currentRoute.id]
    setLocationError('')

    if (existingHistory && existingHistory.status !== 'completed') {
      activeWalkHistoryIdRef.current = existingHistory.id
      coveredCoordinatesRef.current = existingHistory.coveredCoordinates
      await supabase
        .from('walk_history')
        .update({ status: 'in_progress', completed_at: null })
        .eq('id', existingHistory.id)
    } else {
      const { data, error } = await supabase
        .from('walk_history')
        .insert({
          user_id: session.user.id,
          route_id: currentRoute.id,
          status: 'in_progress',
          covered_coordinates: coveredCoordinatesRef.current as unknown as Json,
          calories_burned: 0,
          started_at: new Date().toISOString(),
        })
        .select('id')
        .single()

      if (error) {
        setStatusMessage(`建立行走紀錄失敗：${error.message}`)
        return
      }

      activeWalkHistoryIdRef.current = data.id
    }

    lastSyncAtRef.current = 0

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        const nextPosition: LatLng = [position.coords.latitude, position.coords.longitude]
        setCurrentPosition(nextPosition)

        coveredCoordinatesRef.current = [...coveredCoordinatesRef.current, nextPosition]
        const nearestIndex = nearestCoordinateIndex(activeRoutePathRef.current, nextPosition)
        setWalkedUntilIndex((previous) => {
          const nextIndex = Math.max(previous, nearestIndex)
          walkedUntilIndexRef.current = nextIndex
          return nextIndex
        })

        updateCheckpointUnlockState(nextPosition)

        const now = Date.now()
        if (now - lastSyncAtRef.current > GEO_SYNC_INTERVAL_MS) {
          lastSyncAtRef.current = now
          void syncWalkHistory('in_progress')
        }

        const routeLength = activeRoutePathRef.current.length
        if (routeLength > 0 && nearestIndex >= Math.max(1, routeLength - 3)) {
          void stopTracking('completed')
        }
      },
      (geoError) => {
        setLocationError(geoError.message)
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 3000,
      },
    )

    watchIdRef.current = watchId
    setIsTracking(true)
    setStatusMessage('GPS 追蹤已啟動，靠近打卡點會自動解鎖。')
  }

  function updateCheckpointUnlockState(nextPosition: LatLng): void {
    setCurrentRoute((previous) => {
      if (!previous || previous.checkpoints.length === 0) {
        return previous
      }

      let changed = false
      const checkpoints = previous.checkpoints.map((checkpoint) => {
        if (checkpoint.unlocked) {
          return checkpoint
        }
        const nearEnough = haversineKm(checkpoint.coordinate, nextPosition) <= CHECKPOINT_UNLOCK_RADIUS_KM
        if (!nearEnough) {
          return checkpoint
        }
        changed = true
        return { ...checkpoint, unlocked: true }
      })

      if (!changed) {
        return previous
      }

      const updated = { ...previous, checkpoints }
      currentRouteRef.current = updated
      setStatusMessage('已解鎖新打卡點！')
      return updated
    })
  }

  async function stopTracking(status: WalkStatus): Promise<void> {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }

    setIsTracking(false)
    await syncWalkHistory(status)

    if (status === 'completed' && session?.user.id) {
      const route = currentRouteRef.current
      if (route) {
        await updateProfileAfterCompletion(session.user.id, route)
      }
      activeWalkHistoryIdRef.current = null
      setStatusMessage('恭喜，已完成本次路線！')
    } else if (status === 'paused') {
      setStatusMessage('已暫停 GPS 追蹤，可稍後繼續。')
    }

    if (session?.user.id) {
      await loadUserData(session.user.id, session.user.email ?? undefined)
    }
  }

  async function syncWalkHistory(status: WalkStatus): Promise<void> {
    const historyId = activeWalkHistoryIdRef.current
    const activeRoute = currentRouteRef.current
    if (!historyId || !activeRoute || !isSupabaseConfigured) {
      return
    }

    const walkedSlice = activeRoute.pathCoordinates.slice(
      0,
      Math.min(activeRoute.pathCoordinates.length, walkedUntilIndexRef.current + 1),
    )
    const walkedDistanceKm = walkedSlice.length > 1 ? polylineDistanceKm(walkedSlice) : 0
    const caloriesBurned = Number((walkedDistanceKm * CALORIES_PER_KM).toFixed(1))

    const payload: Database['public']['Tables']['walk_history']['Update'] = {
      status,
      covered_coordinates: coveredCoordinatesRef.current as unknown as Json,
      calories_burned: caloriesBurned,
    }

    if (status === 'completed') {
      payload.completed_at = new Date().toISOString()
    }

    const { error } = await supabase.from('walk_history').update(payload).eq('id', historyId)
    if (error) {
      setStatusMessage(`同步行走紀錄失敗：${error.message}`)
    }
  }

  async function updateProfileAfterCompletion(userId: string, route: RouteRecord): Promise<void> {
    if (!isSupabaseConfigured) {
      return
    }

    const completedRouteDistance = route.totalDistanceKm
    const completedRouteCalories = Number((completedRouteDistance * CALORIES_PER_KM).toFixed(1))
    const currentStats = profile ?? {
      username: session?.user.email?.split('@')[0] ?? 'walker',
      totalDistanceKm: 0,
      totalWalkTimeMins: 0,
      currentStreak: 0,
      totalCaloriesBurned: 0,
      completedWalks: 0,
    }

    const { data: completedRows, error: completedRowsError } = await supabase
      .from('walk_history')
      .select('completed_at')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .not('completed_at', 'is', null)
      .order('completed_at', { ascending: false })

    if (completedRowsError) {
      setStatusMessage(`更新統計時讀取紀錄失敗：${completedRowsError.message}`)
      return
    }

    const streak = calculateCurrentStreak(
      completedRows.map((row) => row.completed_at).filter((value): value is string => Boolean(value)),
    )
    const completedWalkCount = completedRows.length

    const { error: profileUpdateError } = await supabase
      .from('profiles')
      .update({
        total_distance_km: Number((currentStats.totalDistanceKm + completedRouteDistance).toFixed(2)),
        total_walk_time_mins: currentStats.totalWalkTimeMins + route.estimatedTimeMins,
        current_streak: streak,
      })
      .eq('id', userId)

    if (profileUpdateError) {
      setStatusMessage(`更新個人統計失敗：${profileUpdateError.message}`)
      return
    }

    await unlockEligibleAchievements({
      userId,
      totalDistanceKm: currentStats.totalDistanceKm + completedRouteDistance,
      completedWalkCount,
      currentStreak: streak,
    })

    setProfile({
      ...currentStats,
      totalDistanceKm: Number((currentStats.totalDistanceKm + completedRouteDistance).toFixed(2)),
      totalWalkTimeMins: currentStats.totalWalkTimeMins + route.estimatedTimeMins,
      currentStreak: streak,
      totalCaloriesBurned: currentStats.totalCaloriesBurned + completedRouteCalories,
      completedWalks: completedWalkCount,
    })
  }

  async function unlockEligibleAchievements(args: {
    userId: string
    totalDistanceKm: number
    completedWalkCount: number
    currentStreak: number
  }): Promise<void> {
    const { data: allAchievements, error: allAchievementsError } = await supabase
      .from('achievements')
      .select('*')
    if (allAchievementsError) {
      return
    }

    const { data: unlockedRows, error: unlockedRowsError } = await supabase
      .from('user_achievements')
      .select('achievement_id')
      .eq('user_id', args.userId)
    if (unlockedRowsError) {
      return
    }

    const unlockedSet = new Set(unlockedRows.map((row) => row.achievement_id))
    const toUnlock = allAchievements.filter((achievement) => {
      if (unlockedSet.has(achievement.id)) {
        return false
      }
      return (
        Number(achievement.threshold_distance_km) <= args.totalDistanceKm &&
        Number(achievement.threshold_walks) <= args.completedWalkCount &&
        Number(achievement.threshold_streak) <= args.currentStreak
      )
    })

    if (toUnlock.length === 0) {
      return
    }

    const { error } = await supabase.from('user_achievements').insert(
      toUnlock.map((achievement) => ({
        user_id: args.userId,
        achievement_id: achievement.id,
      })),
    )

    if (error) {
      return
    }

    const unlockedTitles = toUnlock.map((item) => item.title).join('、')
    setStatusMessage(`🎉 解鎖新成就：${unlockedTitles}`)
  }

  async function handleTogglePublic(routeId: string, nextPublicState: boolean): Promise<void> {
    if (!session) {
      requestAuth('登入後可公開路線並分享。')
      return
    }

    const { error } = await supabase
      .from('routes')
      .update({ is_public: nextPublicState })
      .eq('id', routeId)
      .eq('user_id', session.user.id)

    if (error) {
      setStatusMessage(`更新公開狀態失敗：${error.message}`)
      return
    }

    setRoutes((previous) =>
      previous.map((route) => (route.id === routeId ? { ...route, isPublic: nextPublicState } : route)),
    )
    setCurrentRoute((previous) =>
      previous && previous.id === routeId ? { ...previous, isPublic: nextPublicState } : previous,
    )

    setStatusMessage(nextPublicState ? '路線已設為公開，可生成分享卡。' : '路線已取消公開。')
  }

  async function handleOpenRoute(route: RouteRecord): Promise<void> {
    if (isTracking) {
      await stopTracking('paused')
    }
    const history = latestHistoryByRouteId[route.id]
    activateRoute(route, history && history.status !== 'completed' ? history : undefined)
    setActiveTab('explore')
    setStatusMessage('已載入路線，按下「開始 GPS 追蹤」即可行走。')
  }

  async function handleSaveUsername(username: string): Promise<void> {
    if (!session?.user.id) {
      return
    }
    const { error } = await supabase.from('profiles').update({ username }).eq('id', session.user.id)
    if (error) {
      setStatusMessage(`更新名稱失敗：${error.message}`)
      return
    }

    setProfile((previous) => {
      if (!previous) {
        return previous
      }
      return { ...previous, username }
    })
  }

  async function handleSignOut(): Promise<void> {
    if (isTracking) {
      await stopTracking('paused')
    }

    await supabase.auth.signOut()
    setSession(null)
    setRoutes([])
    setLatestHistoryByRouteId({})
    setProfile(null)
    activateRoute(null, undefined)
    setStatusMessage('你已登出帳戶。')
  }

  function activateRoute(route: RouteRecord | null, walkHistory?: WalkHistoryRecord): void {
    if (!route) {
      setCurrentRoute(null)
      currentRouteRef.current = null
      activeRoutePathRef.current = []
      coveredCoordinatesRef.current = []
      walkedUntilIndexRef.current = 0
      setWalkedUntilIndex(0)
      setCurrentPosition(null)
      activeWalkHistoryIdRef.current = null
      return
    }

    const progress = applyHistoryProgress(route, walkHistory?.coveredCoordinates ?? [])
    const updatedRoute = { ...route, checkpoints: progress.checkpoints }
    setCurrentRoute(updatedRoute)
    currentRouteRef.current = updatedRoute
    activeRoutePathRef.current = updatedRoute.pathCoordinates
    coveredCoordinatesRef.current = walkHistory?.coveredCoordinates ?? []
    walkedUntilIndexRef.current = progress.walkedUntilIndex
    setWalkedUntilIndex(progress.walkedUntilIndex)
    setCurrentPosition((walkHistory?.coveredCoordinates ?? []).at(-1) ?? null)
    activeWalkHistoryIdRef.current = walkHistory ? walkHistory.id : null
  }

  function requestAuth(title: string): void {
    setAuthTitle(title)
    setAuthOpen(true)
  }

  async function handleInstallPwa(): Promise<void> {
    if (!installPromptEvent) {
      return
    }
    await installPromptEvent.prompt()
    await installPromptEvent.userChoice
    setInstallPromptEvent(null)
  }

  const shareUrl = shareRoute ? buildPublicRouteUrl(shareRoute.id) : ''

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-950">
      <MapView
        boundaries={boundaries}
        selectedRegionId={selectedRegionId}
        onSelectRegion={setSelectedRegionId}
        routePath={currentRoute?.pathCoordinates ?? []}
        walkedUntilIndex={walkedUntilIndex}
        currentPosition={currentPosition}
        checkpoints={currentRoute?.checkpoints ?? []}
      />

      <header className="pointer-events-none absolute left-0 right-0 top-0 z-[900] p-3">
        <div className="pointer-events-auto mx-auto flex max-w-xl items-center justify-between rounded-2xl border border-slate-700/80 bg-slate-900/90 px-4 py-3 shadow-xl backdrop-blur">
          <div>
            <p className="m-0 text-base font-bold text-slate-100">WalkEveryDay</p>
            <p className="m-0 text-xs text-slate-300">
              {isOnline ? '🟢 Online' : '🟠 Offline'} · 香港散步探索 PWA
            </p>
          </div>

          <div className="flex items-center gap-2">
            {installPromptEvent && (
              <button
                type="button"
                onClick={() => void handleInstallPwa()}
                className="rounded-lg border border-emerald-400/70 px-3 py-2 text-xs font-semibold text-emerald-200"
              >
                安裝 App
              </button>
            )}

            {!session && (
              <button
                type="button"
                onClick={() => requestAuth('登入後可儲存路線、統計與成就')}
                className="rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white"
              >
                登入
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="pointer-events-none absolute inset-x-0 bottom-[76px] z-[900] p-3">
        <div className="pointer-events-auto">
          <BottomSheet>
            {activeTab === 'explore' && (
              <div className="space-y-3">
                {!isSupabaseConfigured && (
                  <p className="m-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
                    尚未設定 Supabase 金鑰，請先建立 `.env`。
                  </p>
                )}
                {boundariesError && (
                  <p className="m-0 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                    {boundariesError}
                  </p>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-xs text-slate-300">開放區域</span>
                    <select
                      value={selectedRegionId}
                      onChange={(event) => setSelectedRegionId(event.target.value as ActiveRegionId)}
                      className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-base text-slate-100"
                    >
                      {ACTIVE_REGIONS.map((region) => (
                        <option key={region.id} value={region.id}>
                          {region.label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-1">
                    <span className="text-xs text-slate-300">預計行走時間 (分鐘)</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={10}
                      max={180}
                      step={5}
                      value={estimatedTimeMins}
                      onChange={(event) => setEstimatedTimeMins(event.target.value)}
                      className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-base text-slate-100"
                    />
                  </label>
                </div>

                <button
                  type="button"
                  onClick={() => void handleGenerateRoute()}
                  disabled={isGenerating}
                  className="w-full rounded-2xl bg-blue-500 px-4 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isGenerating ? '生成中...' : '生成隨機散步路線'}
                </button>

                {currentRoute && (
                  <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-3">
                    <p className="m-0 text-sm font-semibold text-slate-100">目前路線：{currentRouteName}</p>
                    <p className="m-0 mt-1 text-sm text-slate-300">
                      預估 {currentRoute.estimatedTimeMins} 分鐘 · 約 {currentRoute.totalDistanceKm.toFixed(2)} km
                    </p>
                    <p className="m-0 mt-1 text-xs text-amber-200">
                      打卡進度：{currentRouteUnlockedCheckpointCount}/{currentRoute.checkpoints.length}
                    </p>
                    <p className="m-0 mt-1 text-xs text-slate-300">路線完成度：{progressPercentage}%</p>
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void handleStartTracking()}
                        disabled={isTracking}
                        className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        開始 GPS 追蹤
                      </button>
                      <button
                        type="button"
                        onClick={() => void stopTracking('paused')}
                        disabled={!isTracking}
                        className="rounded-xl border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        暫停追蹤
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
                  <div className="rounded-lg bg-slate-800 px-2 py-1">
                    <span className="inline-block h-2 w-5 rounded bg-blue-500" /> 未行走路段
                  </div>
                  <div className="rounded-lg bg-slate-800 px-2 py-1">
                    <span className="inline-block h-2 w-5 rounded bg-slate-500" /> 已行走路段
                  </div>
                </div>

                {locationError && (
                  <p className="m-0 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
                    定位錯誤：{locationError}
                  </p>
                )}

                <p className="m-0 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-slate-200">
                  {statusMessage}
                </p>
              </div>
            )}

            {activeTab === 'history' && (
              <>
                {!session ? (
                  <button
                    type="button"
                    onClick={() => requestAuth('登入後可查看路線歷史與續行紀錄')}
                    className="w-full rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white"
                  >
                    登入查看歷史
                  </button>
                ) : (
                  <HistoryList
                    routes={routes}
                    latestHistoryByRouteId={latestHistoryByRouteId}
                    loading={loadingRoutes}
                    onOpenRoute={(route) => {
                      void handleOpenRoute(route)
                    }}
                    onTogglePublic={(routeId, nextPublicState) => {
                      void handleTogglePublic(routeId, nextPublicState)
                    }}
                    onOpenShare={(route) => {
                      if (!route.isPublic) {
                        setStatusMessage('請先將路線設為公開。')
                        return
                      }
                      setShareRoute(route)
                    }}
                  />
                )}
              </>
            )}

            {activeTab === 'stats' && (
              <StatsPanel
                profile={profile}
                badges={achievements}
                unlockedAchievementIds={unlockedAchievementIdSet}
              />
            )}

            {activeTab === 'profile' && (
              <ProfilePanel
                key={profile?.username ?? 'profile-panel'}
                profile={profile}
                isLoggedIn={Boolean(session)}
                onSaveUsername={handleSaveUsername}
                onOpenAuth={() => requestAuth('登入後可管理個人資料')}
                onSignOut={handleSignOut}
              />
            )}

            {loadingDashboard && activeTab !== 'explore' && (
              <p className="mt-2 text-center text-xs text-slate-400">同步資料中...</p>
            )}
          </BottomSheet>
        </div>
      </div>

      <BottomNav
        activeTab={activeTab}
        onChange={(tab) => {
          if ((tab === 'history' || tab === 'stats' || tab === 'profile') && !session) {
            requestAuth('登入後可使用完整功能')
          }
          setActiveTab(tab)
        }}
      />

      <AuthModal
        isOpen={authOpen}
        title={authTitle}
        onClose={() => setAuthOpen(false)}
        onSuccess={() => {
          setStatusMessage('登入成功，歡迎回來。')
        }}
      />

      <ShareRouteCard
        route={shareRoute}
        unlockedCheckpointCount={
          shareRoute
            ? (shareRoute.id === currentRoute?.id
                ? currentRouteUnlockedCheckpointCount
                : shareRoute.checkpoints.filter((checkpoint) => checkpoint.unlocked).length)
            : 0
        }
        shareUrl={shareUrl}
        onClose={() => setShareRoute(null)}
      />
    </div>
  )
}

function buildLatestHistoryMap(records: WalkHistoryRecord[]): Record<string, WalkHistoryRecord | undefined> {
  const output: Record<string, WalkHistoryRecord | undefined> = {}
  for (const record of records) {
    if (!output[record.routeId]) {
      output[record.routeId] = record
    }
  }
  return output
}

function applyHistoryProgress(
  route: RouteRecord,
  coveredCoordinates: LatLng[],
): { walkedUntilIndex: number; checkpoints: RouteCheckpoint[] } {
  let walkedUntilIndex = 0
  for (const point of coveredCoordinates) {
    walkedUntilIndex = Math.max(walkedUntilIndex, nearestCoordinateIndex(route.pathCoordinates, point))
  }

  const checkpoints = route.checkpoints.map((checkpoint) => {
    const unlocked = coveredCoordinates.some(
      (point) => haversineKm(checkpoint.coordinate, point) <= CHECKPOINT_UNLOCK_RADIUS_KM,
    )
    return { ...checkpoint, unlocked }
  })

  return { walkedUntilIndex, checkpoints }
}

function calculateCurrentStreak(completedDates: string[]): number {
  if (completedDates.length === 0) {
    return 0
  }

  const completedDaySet = new Set(
    completedDates.map((item) => {
      const date = new Date(item)
      return `${date.getUTCFullYear()}-${date.getUTCMonth() + 1}-${date.getUTCDate()}`
    }),
  )

  const today = new Date()
  let streak = 0

  while (true) {
    const checkDate = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    checkDate.setUTCDate(checkDate.getUTCDate() - streak)
    const key = `${checkDate.getUTCFullYear()}-${checkDate.getUTCMonth() + 1}-${checkDate.getUTCDate()}`
    if (!completedDaySet.has(key)) {
      break
    }
    streak += 1
  }

  return streak
}

function buildPublicRouteUrl(routeId: string): string {
  const basePath = import.meta.env.VITE_BASE_PATH ?? '/'
  const normalizedBasePath = basePath.endsWith('/') ? basePath : `${basePath}/`
  return `${window.location.origin}${normalizedBasePath}?publicRoute=${encodeURIComponent(routeId)}`
}

function rowToRouteRecord(row: RoutesRow): RouteRecord | null {
  const coordinates = parseCoordinates(row.path_coordinates)
  if (coordinates.length < 2) {
    return null
  }

  return {
    id: row.id,
    district: row.district,
    estimatedTimeMins: row.estimated_time_mins,
    pathCoordinates: coordinates,
    checkpoints: parseCheckpoints(row.checkpoints),
    isPublic: row.is_public,
    totalDistanceKm: Number(row.total_distance_km),
    createdAt: row.created_at,
  }
}

function rowToWalkHistoryRecord(row: WalkHistoryRow): WalkHistoryRecord {
  return {
    id: row.id,
    routeId: row.route_id,
    status: (row.status as WalkStatus) ?? 'in_progress',
    coveredCoordinates: parseCoordinates(row.covered_coordinates),
    caloriesBurned: Number(row.calories_burned ?? 0),
    startedAt: row.started_at,
    completedAt: row.completed_at,
  }
}

function profileRowToProfileStats(
  row: ProfileRow,
  totalCaloriesBurned: number,
  completedWalks: number,
): ProfileStats {
  return {
    username: row.username ?? 'walker',
    totalDistanceKm: Number(row.total_distance_km ?? 0),
    totalWalkTimeMins: Number(row.total_walk_time_mins ?? 0),
    currentStreak: Number(row.current_streak ?? 0),
    totalCaloriesBurned,
    completedWalks,
  }
}

function rowToAchievementBadge(row: AchievementRow): AchievementBadge {
  return {
    id: row.id,
    code: row.code,
    title: row.title,
    description: row.description,
    iconEmoji: row.icon_emoji,
    thresholdDistanceKm: Number(row.threshold_distance_km),
    thresholdWalks: Number(row.threshold_walks),
    thresholdStreak: Number(row.threshold_streak),
  }
}

function parseCoordinates(value: Json): LatLng[] {
  if (!Array.isArray(value)) {
    return []
  }

  const output: LatLng[] = []
  for (const item of value) {
    if (Array.isArray(item) && item.length >= 2) {
      const lat = Number(item[0])
      const lng = Number(item[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        output.push([lat, lng])
      }
      continue
    }

    if (typeof item === 'object' && item !== null) {
      const lat = Number((item as { lat?: unknown }).lat)
      const lng = Number((item as { lng?: unknown }).lng)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        output.push([lat, lng])
      }
    }
  }

  return output
}

function parseCheckpoints(value: Json): RouteCheckpoint[] {
  if (!Array.isArray(value)) {
    return []
  }

  const output: RouteCheckpoint[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) {
      continue
    }

    const data = item as {
      id?: unknown
      label?: unknown
      unlocked?: unknown
      coordinate?: unknown
      lat?: unknown
      lng?: unknown
    }

    let coordinate: LatLng | null = null
    if (Array.isArray(data.coordinate) && data.coordinate.length >= 2) {
      const lat = Number(data.coordinate[0])
      const lng = Number(data.coordinate[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        coordinate = [lat, lng]
      }
    } else {
      const lat = Number(data.lat)
      const lng = Number(data.lng)
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        coordinate = [lat, lng]
      }
    }

    if (!coordinate) {
      continue
    }

    output.push({
      id: String(data.id ?? `cp_${output.length + 1}`),
      label: String(data.label ?? `POI 打卡點 ${output.length + 1}`),
      coordinate,
      unlocked: Boolean(data.unlocked),
    })
  }

  return output
}
