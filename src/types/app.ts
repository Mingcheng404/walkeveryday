export type LatLng = [number, number]
export type LngLat = [number, number]

export type WalkStatus = 'in_progress' | 'paused' | 'completed'
export type RouteSource = 'generated' | 'recorded'

export interface RouteCheckpoint {
  id: string
  label: string
  coordinate: LatLng
  unlocked: boolean
}

export interface RouteRecord {
  id: string
  district: string
  routeName: string | null
  estimatedTimeMins: number
  pathCoordinates: LatLng[]
  checkpoints: RouteCheckpoint[]
  isPublic: boolean
  routeSource: RouteSource
  totalDistanceKm: number
  createdAt: string
}

export interface WalkHistoryRecord {
  id: string
  routeId: string | null
  status: WalkStatus
  coveredCoordinates: LatLng[]
  caloriesBurned: number
  startedAt: string
  completedAt: string | null
}

export interface ProfileStats {
  username: string
  totalDistanceKm: number
  totalWalkTimeMins: number
  currentStreak: number
  totalCaloriesBurned: number
  completedWalks: number
}

export interface AchievementBadge {
  id: string
  code: string
  title: string
  description: string
  iconEmoji: string
  thresholdDistanceKm: number
  thresholdWalks: number
  thresholdStreak: number
}

export interface HabitSettings {
  weeklyTargetDays: number
  dailyTargetKm: number
  vacationMode: boolean
  reminderEnabled: boolean
  reminderHour: number
}

export interface WeeklyTrend {
  label: string
  distanceKm: number
  walks: number
}
