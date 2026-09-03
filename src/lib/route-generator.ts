import type { DistrictFeatureCollection, ActiveRegionId } from './districts'
import { getRegionDistrictName, getRegionPolygons, ACTIVE_REGIONS } from './districts'
import {
  destinationPoint,
  haversineKm,
  pointInMultiPolygon,
  polylineDistanceKm,
  randomPointInPolygons,
  toLatLng,
} from './geo'
import type { LatLng, LngLat, RouteCheckpoint } from '../types/app'

const AVERAGE_WALKING_SPEED_KMH = 4.5
const OSRM_PROFILES = ['foot', 'walking', 'driving'] as const

// Bounding box fallbacks per region (in case official GeoJSON fails to load)
const REGION_BBOX: Record<ActiveRegionId, { minLng: number; maxLng: number; minLat: number; maxLat: number }> = {
  TUEN_MUN: { minLng: 113.85, maxLng: 114.05, minLat: 22.33, maxLat: 22.45 },
  YUEN_LONG: { minLng: 113.95, maxLng: 114.15, minLat: 22.40, maxLat: 22.55 },
  TIN_SHUI_WAI: { minLng: 113.97, maxLng: 114.05, minLat: 22.44, maxLat: 22.50 },
}

type GeneratedRoute = {
  district: string
  estimatedTimeMins: number
  totalDistanceKm: number
  pathCoordinates: LatLng[]
  checkpoints: RouteCheckpoint[]
}

type OsrmRouteResponse = {
  code: string
  routes?: Array<{
    distance: number
    geometry: {
      coordinates: Array<[number, number]>
    }
  }>
}

export async function generateRandomRoute(params: {
  regionId: ActiveRegionId
  estimatedTimeMins: number
  boundaries: DistrictFeatureCollection | null
}): Promise<GeneratedRoute> {
  const targetDistanceKm = Math.max(0.8, (params.estimatedTimeMins / 60) * AVERAGE_WALKING_SPEED_KMH)

  let polygons: LngLat[][][] | null = null
  try {
    if (params.boundaries) {
      polygons = getRegionPolygons(params.regionId, params.boundaries)
    }
  } catch {
    polygons = null
  }

  const useBboxFallback = !polygons || polygons.length === 0
  const bbox = REGION_BBOX[params.regionId]

  let bestPath: LatLng[] = []
  let bestDistanceGap = Number.POSITIVE_INFINITY

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const loopWaypoints = useBboxFallback
      ? buildLoopWaypointsBbox(bbox, targetDistanceKm, params.estimatedTimeMins)
      : buildLoopWaypoints(polygons!, targetDistanceKm, params.estimatedTimeMins)
    const path = await getRoutePath(loopWaypoints)
    const distanceKm = polylineDistanceKm(path)
    const gap = Math.abs(distanceKm - targetDistanceKm)

    if (gap < bestDistanceGap) {
      bestDistanceGap = gap
      bestPath = path
    }

    if (distanceKm > targetDistanceKm * 0.75 && distanceKm < targetDistanceKm * 1.35) {
      const normalizedPath = dedupePath(path)
      return {
        district: getRegionDistrictName(params.regionId),
        estimatedTimeMins: params.estimatedTimeMins,
        totalDistanceKm: Number(distanceKm.toFixed(2)),
        pathCoordinates: normalizedPath,
        checkpoints: buildCheckpoints(normalizedPath, params.estimatedTimeMins),
      }
    }
  }

  if (bestPath.length < 2) {
    throw new Error('未能生成有效路線，請再試一次。')
  }

  const normalizedPath = dedupePath(bestPath)
  return {
    district: getRegionDistrictName(params.regionId),
    estimatedTimeMins: params.estimatedTimeMins,
    totalDistanceKm: Number(polylineDistanceKm(bestPath).toFixed(2)),
    pathCoordinates: normalizedPath,
    checkpoints: buildCheckpoints(normalizedPath, params.estimatedTimeMins),
  }
}

function buildLoopWaypoints(polygons: LngLat[][][], targetDistanceKm: number, minutes: number): LngLat[] {
  const start = randomPointInPolygons(polygons)
  if (!start) {
    throw new Error('找不到可用起點。')
  }
  return buildWaypointsFromStart(start, polygons, targetDistanceKm, minutes, (p) => pointInMultiPolygon(p, polygons))
}

function buildLoopWaypointsBbox(bbox: { minLng: number; maxLng: number; minLat: number; maxLat: number }, targetDistanceKm: number, minutes: number): LngLat[] {
  const start: LngLat = [
    bbox.minLng + Math.random() * (bbox.maxLng - bbox.minLng),
    bbox.minLat + Math.random() * (bbox.maxLat - bbox.minLat),
  ]
  const inBbox = (p: LngLat) =>
    p[0] >= bbox.minLng && p[0] <= bbox.maxLng && p[1] >= bbox.minLat && p[1] <= bbox.maxLat
  return buildWaypointsFromStart(start, null, targetDistanceKm, minutes, inBbox)
}

function buildWaypointsFromStart(
  start: LngLat,
  polygons: LngLat[][][] | null,
  targetDistanceKm: number,
  minutes: number,
  contains: (p: LngLat) => boolean,
): LngLat[] {
  const waypointCount = minutes <= 20 ? 2 : minutes <= 40 ? 3 : 4
  const radiusBase = Math.max(0.25, targetDistanceKm / (waypointCount + 1))
  const candidates: LngLat[] = [start]
  const randomStartBearing = Math.random() * 360

  for (let i = 0; i < waypointCount; i += 1) {
    const bearing = randomStartBearing + (360 / waypointCount) * i + randomBetween(-30, 30)
    const distance = radiusBase * randomBetween(0.85, 1.2)
    let candidate = destinationPoint(start, bearing, distance)
      if (!contains(candidate)) {
        if (polygons) {
          const fallback = randomPointInPolygons(polygons)
          if (fallback) candidate = fallback
        }
        // else: keep candidate even if outside bbox (better than no waypoint)
      }
    candidates.push(candidate)
  }
  candidates.push(start)
  return candidates
}

async function getRoutePath(waypoints: LngLat[]): Promise<LatLng[]> {
  try {
    const osrmPath = await requestOsrmPath(waypoints)
    if (osrmPath.length >= 2) return osrmPath
  } catch {
    // fallback below
  }
  return buildFallbackPath(waypoints)
}

async function requestOsrmPath(waypoints: LngLat[]): Promise<LatLng[]> {
  const coordinateString = waypoints.map(([lng, lat]) => `${lng},${lat}`).join(';')
  for (const profile of OSRM_PROFILES) {
    try {
      const endpoint = `https://router.project-osrm.org/route/v1/${profile}/${coordinateString}?overview=full&geometries=geojson&steps=false`
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 8000)
      const response = await fetch(endpoint, { signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) continue
      const payload = (await response.json()) as OsrmRouteResponse
      const route = payload.routes?.[0]
      if (payload.code === 'Ok' && route?.geometry?.coordinates?.length) {
        return route.geometry.coordinates.map(([lng, lat]) => toLatLng([lng, lat]))
      }
    } catch {
      continue
    }
  }
  throw new Error('OSRM 暫時不可用')
}

function buildFallbackPath(waypoints: LngLat[]): LatLng[] {
  const path: LatLng[] = []
  for (let i = 1; i < waypoints.length; i += 1) {
    const from = toLatLng(waypoints[i - 1])
    const to = toLatLng(waypoints[i])
    const segmentDistance = haversineKm(from, to)
    const steps = Math.max(2, Math.ceil(segmentDistance / 0.2))
    for (let step = 0; step < steps; step += 1) {
      const ratio = step / steps
      path.push([from[0] + (to[0] - from[0]) * ratio, from[1] + (to[1] - from[1]) * ratio])
    }
  }
  if (waypoints.length > 0) path.push(toLatLng(waypoints[waypoints.length - 1]))
  return path
}

function dedupePath(path: LatLng[]): LatLng[] {
  if (path.length < 2) return path
  const result: LatLng[] = [path[0]]
  for (let i = 1; i < path.length; i += 1) {
    const last = result[result.length - 1]
    const current = path[i]
    if (haversineKm(last, current) > 0.003) result.push(current)
  }
  return result
}

function buildCheckpoints(path: LatLng[], estimatedTimeMins: number): RouteCheckpoint[] {
  if (path.length < 6) return []
  const checkpointCount = estimatedTimeMins <= 30 ? 2 : 3
  const checkpoints: RouteCheckpoint[] = []
  const startOffset = Math.floor(path.length * 0.18)
  const endOffset = Math.floor(path.length * 0.85)
  const availableSpan = Math.max(1, endOffset - startOffset)
  for (let i = 0; i < checkpointCount; i += 1) {
    const ratio = (i + 1) / (checkpointCount + 1)
    const index = startOffset + Math.min(availableSpan - 1, Math.floor(availableSpan * ratio))
    const coordinate = path[Math.min(path.length - 1, Math.max(0, index))]
    checkpoints.push({
      id: `cp_${i + 1}_${Math.round(Math.random() * 1e6)}`,
      label: `POI 打卡點 ${i + 1}`,
      coordinate,
      unlocked: false,
    })
  }
  return checkpoints
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min
}

// Helper to get region label for UI
export function getRegionLabel(regionId: ActiveRegionId): string {
  return ACTIVE_REGIONS.find((r) => r.id === regionId)?.label ?? regionId
}
