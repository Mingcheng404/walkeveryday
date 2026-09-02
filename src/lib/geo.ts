import type { LatLng, LngLat } from '../types/app'

const EARTH_RADIUS_KM = 6371

export const toLatLng = ([lng, lat]: LngLat): LatLng => [lat, lng]
export const toLngLat = ([lat, lng]: LatLng): LngLat => [lng, lat]

export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = degToRad(b[0] - a[0])
  const dLng = degToRad(b[1] - a[1])
  const lat1 = degToRad(a[0])
  const lat2 = degToRad(b[0])

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2)

  const c = 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
  return EARTH_RADIUS_KM * c
}

export function polylineDistanceKm(path: LatLng[]): number {
  if (path.length < 2) {
    return 0
  }

  let total = 0
  for (let i = 1; i < path.length; i += 1) {
    total += haversineKm(path[i - 1], path[i])
  }
  return total
}

export function nearestCoordinateIndex(path: LatLng[], current: LatLng): number {
  if (path.length === 0) {
    return 0
  }

  let bestIndex = 0
  let bestDistance = Number.POSITIVE_INFINITY
  for (let i = 0; i < path.length; i += 1) {
    const distance = haversineKm(path[i], current)
    if (distance < bestDistance) {
      bestDistance = distance
      bestIndex = i
    }
  }

  return bestIndex
}

export function destinationPoint(origin: LngLat, bearingDeg: number, distanceKm: number): LngLat {
  const [lng, lat] = origin
  const bearing = degToRad(bearingDeg)
  const angularDistance = distanceKm / EARTH_RADIUS_KM
  const latRad = degToRad(lat)
  const lngRad = degToRad(lng)

  const nextLat = Math.asin(
    Math.sin(latRad) * Math.cos(angularDistance) +
      Math.cos(latRad) * Math.sin(angularDistance) * Math.cos(bearing),
  )

  const nextLng =
    lngRad +
    Math.atan2(
      Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latRad),
      Math.cos(angularDistance) - Math.sin(latRad) * Math.sin(nextLat),
    )

  return [radToDeg(nextLng), radToDeg(nextLat)]
}

export function pointInMultiPolygon(point: LngLat, polygons: LngLat[][][]): boolean {
  return polygons.some((polygon) => pointInPolygonWithHoles(point, polygon))
}

export function randomPointInPolygons(polygons: LngLat[][][], maxAttempts = 2000): LngLat | null {
  const bounds = getMultiPolygonBoundingBox(polygons)
  if (!bounds) {
    return null
  }

  for (let i = 0; i < maxAttempts; i += 1) {
    const lng = randomBetween(bounds.minLng, bounds.maxLng)
    const lat = randomBetween(bounds.minLat, bounds.maxLat)
    const point: LngLat = [lng, lat]
    if (pointInMultiPolygon(point, polygons)) {
      return point
    }
  }

  return null
}

function pointInPolygonWithHoles(point: LngLat, rings: LngLat[][]): boolean {
  if (rings.length === 0) {
    return false
  }

  const [outerRing, ...holes] = rings
  if (!pointInRing(point, outerRing)) {
    return false
  }

  return !holes.some((hole) => pointInRing(point, hole))
}

function pointInRing(point: LngLat, ring: LngLat[]): boolean {
  const [x, y] = point
  let inside = false

  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi

    if (intersects) {
      inside = !inside
    }
  }

  return inside
}

function getMultiPolygonBoundingBox(polygons: LngLat[][][]): {
  minLng: number
  maxLng: number
  minLat: number
  maxLat: number
} | null {
  let minLng = Number.POSITIVE_INFINITY
  let maxLng = Number.NEGATIVE_INFINITY
  let minLat = Number.POSITIVE_INFINITY
  let maxLat = Number.NEGATIVE_INFINITY

  for (const polygon of polygons) {
    for (const ring of polygon) {
      for (const [lng, lat] of ring) {
        minLng = Math.min(minLng, lng)
        maxLng = Math.max(maxLng, lng)
        minLat = Math.min(minLat, lat)
        maxLat = Math.max(maxLat, lat)
      }
    }
  }

  if (!Number.isFinite(minLng)) {
    return null
  }

  return { minLng, maxLng, minLat, maxLat }
}

function degToRad(value: number): number {
  return (value * Math.PI) / 180
}

function radToDeg(value: number): number {
  return (value * 180) / Math.PI
}

function randomBetween(min: number, max: number): number {
  return Math.random() * (max - min) + min
}
