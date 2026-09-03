import type { Database, Json } from './database.types'
import type {
  AchievementBadge,
  HabitSettings,
  LatLng,
  ProfileStats,
  RouteCheckpoint,
  RouteRecord,
  WalkHistoryRecord,
  WalkStatus,
  WeeklyTrend,
} from '../types/app'

type RoutesRow = Database['public']['Tables']['routes']['Row']
type WalkHistoryRow = Database['public']['Tables']['walk_history']['Row']
type ProfileRow = Database['public']['Tables']['profiles']['Row']
type AchievementRow = Database['public']['Tables']['achievements']['Row']
type HabitRow = Database['public']['Tables']['habit_settings']['Row']

const CHECKPOINT_UNLOCK_RADIUS_KM = 0.06
const CALORIES_PER_KM = 55

export function buildLatestHistoryMap(records: WalkHistoryRecord[]): Record<string, WalkHistoryRecord | undefined> {
  const out: Record<string, WalkHistoryRecord | undefined> = {}
  for (const r of records) if (!out[r.routeId ?? '']) out[r.routeId ?? ''] = r
  return out
}

export function applyHistoryProgress(
  route: RouteRecord,
  covered: LatLng[],
): { walkedUntilIndex: number; checkpoints: RouteCheckpoint[] } {
  let walkedUntilIndex = 0
  for (const p of covered) {
    walkedUntilIndex = Math.max(walkedUntilIndex, nearestIndex(route.pathCoordinates, p))
  }
  const checkpoints = route.checkpoints.map((c) => ({
    ...c,
    unlocked: covered.some((p) => haversine(c.coordinate, p) <= CHECKPOINT_UNLOCK_RADIUS_KM),
  }))
  return { walkedUntilIndex, checkpoints }
}

// Use Asia/Hong Kong local date key to avoid UTC timezone streak bugs
export function hkDateKey(iso: string): string {
  const d = new Date(iso)
  // Hong Kong is UTC+8
  const hk = new Date(d.getTime() + 8 * 3600 * 1000)
  return `${hk.getUTCFullYear()}-${String(hk.getUTCMonth() + 1).padStart(2, '0')}-${String(hk.getUTCDate()).padStart(2, '0')}`
}

export function calculateCurrentStreak(completedDates: string[], vacationMode = false): number {
  if (vacationMode || completedDates.length === 0) return 0
  const daySet = new Set(completedDates.map(hkDateKey))
  const today = new Date()
  let streak = 0
  while (true) {
    const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()))
    d.setUTCDate(d.getUTCDate() - streak)
    const key = hkDateKey(d.toISOString())
    if (!daySet.has(key)) break
    streak += 1
    if (streak > 365) break
  }
  return streak
}

export function buildWeeklyTrend(history: WalkHistoryRecord[]): WeeklyTrend[] {
  const days: WeeklyTrend[] = []
  const now = new Date()
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(now)
    d.setDate(d.getDate() - i)
    const key = hkDateKey(d.toISOString())
    const dayLabel = ['日', '一', '二', '三', '四', '五', '六'][d.getDay()]
    const dayWalks = history.filter((h) => h.status === 'completed' && h.completedAt && hkDateKey(h.completedAt) === key)
    const distanceKm = dayWalks.reduce((sum, h) => {
      if (h.coveredCoordinates.length < 2) return sum
      return sum + polylineDistance(h.coveredCoordinates)
    }, 0)
    days.push({ label: dayLabel, distanceKm, walks: dayWalks.length })
  }
  return days
}

export function buildPublicRouteUrl(routeId: string): string {
  const basePath = import.meta.env.VITE_BASE_PATH ?? '/'
  const norm = basePath.endsWith('/') ? basePath : `${basePath}/`
  return `${window.location.origin}${norm}?publicRoute=${encodeURIComponent(routeId)}`
}

export function rowToRouteRecord(row: RoutesRow): RouteRecord | null {
  const coords = parseCoordinates(row.path_coordinates)
  if (coords.length < 2) return null
  return {
    id: row.id,
    district: row.district,
    routeName: row.route_name,
    estimatedTimeMins: row.estimated_time_mins,
    pathCoordinates: coords,
    checkpoints: parseCheckpoints(row.checkpoints),
    isPublic: row.is_public,
    routeSource: (row.route_source as 'generated' | 'recorded') ?? 'generated',
    totalDistanceKm: Number(row.total_distance_km),
    createdAt: row.created_at,
  }
}

export function rowToWalkHistoryRecord(row: WalkHistoryRow): WalkHistoryRecord {
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

export function profileRowToProfileStats(row: ProfileRow, totalCal: number, completedWalks: number): ProfileStats {
  return {
    username: row.username ?? 'walker',
    totalDistanceKm: Number(row.total_distance_km ?? 0),
    totalWalkTimeMins: Number(row.total_walk_time_mins ?? 0),
    currentStreak: Number(row.current_streak ?? 0),
    totalCaloriesBurned: totalCal,
    completedWalks,
  }
}

export function rowToAchievementBadge(row: AchievementRow): AchievementBadge {
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

export function habitRowToSettings(row: HabitRow): HabitSettings {
  return {
    weeklyTargetDays: row.weekly_target_days,
    dailyTargetKm: Number(row.daily_target_km),
    vacationMode: row.vacation_mode,
    reminderEnabled: row.reminder_enabled,
    reminderHour: row.reminder_hour,
  }
}

export function parseCoordinates(value: Json): LatLng[] {
  if (!Array.isArray(value)) return []
  const out: LatLng[] = []
  for (const item of value) {
    if (Array.isArray(item) && item.length >= 2) {
      const lat = Number(item[0])
      const lng = Number(item[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng])
      continue
    }
    if (typeof item === 'object' && item !== null) {
      const lat = Number((item as { lat?: unknown }).lat)
      const lng = Number((item as { lng?: unknown }).lng)
      if (Number.isFinite(lat) && Number.isFinite(lng)) out.push([lat, lng])
    }
  }
  return out
}

function parseCheckpoints(value: Json): RouteCheckpoint[] {
  if (!Array.isArray(value)) return []
  const out: RouteCheckpoint[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue
    const d = item as { id?: unknown; label?: unknown; unlocked?: unknown; coordinate?: unknown; lat?: unknown; lng?: unknown }
    let coord: LatLng | null = null
    if (Array.isArray(d.coordinate) && d.coordinate.length >= 2) {
      const lat = Number(d.coordinate[0])
      const lng = Number(d.coordinate[1])
      if (Number.isFinite(lat) && Number.isFinite(lng)) coord = [lat, lng]
    } else {
      const lat = Number(d.lat)
      const lng = Number(d.lng)
      if (Number.isFinite(lat) && Number.isFinite(lng)) coord = [lat, lng]
    }
    if (!coord) continue
    out.push({
      id: String(d.id ?? `cp_${out.length + 1}`),
      label: String(d.label ?? `POI 打卡點 ${out.length + 1}`),
      coordinate: coord,
      unlocked: Boolean(d.unlocked),
    })
  }
  return out
}

function haversine(a: LatLng, b: LatLng): number {
  const R = 6371
  const dLat = ((b[0] - a[0]) * Math.PI) / 180
  const dLng = ((b[1] - a[1]) * Math.PI) / 180
  const lat1 = (a[0] * Math.PI) / 180
  const lat2 = (b[0] * Math.PI) / 180
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

function polylineDistance(path: LatLng[]): number {
  let total = 0
  for (let i = 1; i < path.length; i += 1) total += haversine(path[i - 1], path[i])
  return total
}

function nearestIndex(path: LatLng[], current: LatLng): number {
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < path.length; i += 1) {
    const d = haversine(path[i], current)
    if (d < bestDist) { bestDist = d; best = i }
  }
  return best
}

export { CALORIES_PER_KM, CHECKPOINT_UNLOCK_RADIUS_KM }
