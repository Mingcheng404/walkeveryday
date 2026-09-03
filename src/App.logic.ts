import { useMemo, useRef, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { DISTRICT_NAME_ZH, getRegionDisplayName, type ActiveRegionId, type DistrictFeatureCollection } from './lib/districts'
import { buildWeeklyTrend } from './lib/app-helpers'
import type {
  AchievementBadge, HabitSettings, LatLng, ProfileStats, RouteRecord,
  WalkHistoryRecord,
} from './types/app'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

export function useAppLogic() {
  const [session, setSession] = useState<Session | null>(null)
  const [authOpen, setAuthOpen] = useState(false)
  const [authTitle, setAuthTitle] = useState('登入 WalkEveryDay')
  const [boundaries, setBoundaries] = useState<DistrictFeatureCollection | null>(null)
  const [boundariesError, setBoundariesError] = useState('')
  const [selectedRegionId, setSelectedRegionId] = useState<ActiveRegionId>('TUEN_MUN')
  const [estimatedTimeMins, setEstimatedTimeMins] = useState('30')
  const [isGenerating, setIsGenerating] = useState(false)
  const [activeTab, setActiveTab] = useState<'explore' | 'record' | 'history' | 'stats' | 'profile'>('explore')
  const [routes, setRoutes] = useState<RouteRecord[]>([])
  const [latestHistoryByRouteId, setLatestHistoryByRouteId] = useState<Record<string, WalkHistoryRecord | undefined>>({})
  const [allWalkHistory, setAllWalkHistory] = useState<WalkHistoryRecord[]>([])
  const [loadingRoutes, setLoadingRoutes] = useState(false)
  const [loadingDashboard, setLoadingDashboard] = useState(false)
  const [profile, setProfile] = useState<ProfileStats | null>(null)
  const [achievements, setAchievements] = useState<AchievementBadge[]>([])
  const [unlockedAchievementIds, setUnlockedAchievementIds] = useState<string[]>([])
  const [habitSettings, setHabitSettings] = useState<HabitSettings | null>(null)
  const [currentRoute, setCurrentRoute] = useState<RouteRecord | null>(null)
  const [shareRoute, setShareRoute] = useState<RouteRecord | null>(null)
  const [statusMessage, setStatusMessage] = useState('選擇區域與步行時間，即可產生探索路線。')
  const [locationError, setLocationError] = useState('')
  const [isTracking, setIsTracking] = useState(false)
  const [walkedUntilIndex, setWalkedUntilIndex] = useState(0)
  const [currentPosition, setCurrentPosition] = useState<LatLng | null>(null)
  const [isOnline, setIsOnline] = useState(() => navigator.onLine)
  const [installPromptEvent, setInstallPromptEvent] = useState<BeforeInstallPromptEvent | null>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [recordingTrack, setRecordingTrack] = useState<LatLng[]>([])
  const [recordingDistanceKm, setRecordingDistanceKm] = useState(0)
  const [recordingDurationSec, setRecordingDurationSec] = useState(0)

  const watchIdRef = useRef<number | null>(null)
  const recordWatchIdRef = useRef<number | null>(null)
  const recordTimerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const activeRoutePathRef = useRef<LatLng[]>([])
  const currentRouteRef = useRef<RouteRecord | null>(null)
  const coveredCoordinatesRef = useRef<LatLng[]>([])
  const activeWalkHistoryIdRef = useRef<string | null>(null)
  const walkedUntilIndexRef = useRef(0)
  const lastSyncAtRef = useRef(0)
  const hasLoadedPublicRouteRef = useRef(false)

  const selectedRegionName = useMemo(() => getRegionDisplayName(selectedRegionId), [selectedRegionId])
  const currentRouteName = useMemo(() => {
    if (!currentRoute) return selectedRegionName
    return currentRoute.routeName ?? DISTRICT_NAME_ZH[currentRoute.district] ?? currentRoute.district
  }, [currentRoute, selectedRegionName])
  const unlockedAchievementIdSet = useMemo(() => new Set(unlockedAchievementIds), [unlockedAchievementIds])
  const currentRouteUnlockedCheckpointCount = useMemo(() => currentRoute?.checkpoints.filter((c) => c.unlocked).length ?? 0, [currentRoute])
  const progressPercentage = useMemo(() => {
    if (!currentRoute || currentRoute.pathCoordinates.length < 2) return 0
    return Math.max(0, Math.min(100, Math.round((walkedUntilIndex / (currentRoute.pathCoordinates.length - 1)) * 100)))
  }, [currentRoute, walkedUntilIndex])
  const weeklyTrend = useMemo(() => buildWeeklyTrend(allWalkHistory), [allWalkHistory])

  return {
    session, setSession, authOpen, setAuthOpen, authTitle, setAuthTitle,
    boundaries, setBoundaries, boundariesError, setBoundariesError,
    selectedRegionId, setSelectedRegionId, estimatedTimeMins, setEstimatedTimeMins,
    isGenerating, setIsGenerating, activeTab, setActiveTab,
    routes, setRoutes, latestHistoryByRouteId, setLatestHistoryByRouteId,
    allWalkHistory, setAllWalkHistory, loadingRoutes, setLoadingRoutes,
    loadingDashboard, setLoadingDashboard,
    profile, setProfile, achievements, setAchievements,
    unlockedAchievementIds, setUnlockedAchievementIds, habitSettings, setHabitSettings,
    currentRoute, setCurrentRoute, shareRoute, setShareRoute,
    statusMessage, setStatusMessage, locationError, setLocationError,
    isTracking, setIsTracking, walkedUntilIndex, setWalkedUntilIndex,
    currentPosition, setCurrentPosition, isOnline, setIsOnline,
    installPromptEvent, setInstallPromptEvent,
    isRecording, setIsRecording, recordingTrack, setRecordingTrack,
    recordingDistanceKm, setRecordingDistanceKm, recordingDurationSec, setRecordingDurationSec,
    watchIdRef, recordWatchIdRef, recordTimerRef,
    activeRoutePathRef, currentRouteRef, coveredCoordinatesRef,
    activeWalkHistoryIdRef, walkedUntilIndexRef, lastSyncAtRef, hasLoadedPublicRouteRef,
    selectedRegionName, currentRouteName, unlockedAchievementIdSet,
    currentRouteUnlockedCheckpointCount, progressPercentage, weeklyTrend,
  }
}

export type LogicState = ReturnType<typeof useAppLogic>
