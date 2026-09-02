export type LatLng = [number, number]
export type LngLat = [number, number]

export type WalkStatus = 'in_progress' | 'paused' | 'completed'

export interface RouteCheckpoint {
  id: string
  label: string
  coordinate: LatLng
  unlocked: boolean
}

export interface RouteRecord {
  id: string
  district: string
  estimatedTimeMins: number
  pathCoordinates: LatLng[]
  checkpoints: RouteCheckpoint[]
  isPublic: boolean
  totalDistanceKm: number
  createdAt: string
}

export interface WalkHistoryRecord {
  id: string
  routeId: string
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
