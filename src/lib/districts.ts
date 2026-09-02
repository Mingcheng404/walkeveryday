import type { Feature, FeatureCollection, MultiPolygon, Polygon } from 'geojson'
import type { LngLat } from '../types/app'

const DISTRICT_BOUNDARY_URL =
  'https://www.had.gov.hk/psi/hong-kong-administrative-boundaries/hksar_18_district_boundary.json'

const ACTIVE_DISTRICT_NAMES = ['Tuen Mun', 'Yuen Long'] as const

export const DISTRICT_NAME_ZH: Record<string, string> = {
  'Central & Western': '中西區',
  Eastern: '東區',
  Islands: '離島區',
  'Kowloon City': '九龍城區',
  'Kwai Tsing': '葵青區',
  'Kwun Tong': '觀塘區',
  North: '北區',
  'Sai Kung': '西貢區',
  'Sha Tin': '沙田區',
  'Sham Shui Po': '深水埗區',
  Southern: '南區',
  'Tai Po': '大埔區',
  'Tsuen Wan': '荃灣區',
  'Tuen Mun': '屯門區',
  'Wan Chai': '灣仔區',
  'Wong Tai Sin': '黃大仙區',
  'Yau Tsim Mong': '油尖旺區',
  'Yuen Long': '元朗區',
  'Tin Shui Wai': '天水圍',
}

export const TIN_SHUI_WAI_POLYGON: LngLat[] = [
  [113.9824, 22.4489],
  [114.026, 22.4489],
  [114.0317, 22.4708],
  [114.0162, 22.4862],
  [113.9871, 22.4763],
  [113.9824, 22.4489],
]

type DistrictProperties = {
  District?: string
  地區?: string
  地區號碼?: string
}

export type DistrictFeature = Feature<Polygon | MultiPolygon, DistrictProperties>
export type DistrictFeatureCollection = FeatureCollection<Polygon | MultiPolygon, DistrictProperties>

export type ActiveRegionId = 'TUEN_MUN' | 'YUEN_LONG' | 'TIN_SHUI_WAI'

type ActiveRegion = {
  id: ActiveRegionId
  label: string
  districtName: string
}

export const ACTIVE_REGIONS: ActiveRegion[] = [
  { id: 'TUEN_MUN', label: '屯門', districtName: 'Tuen Mun' },
  { id: 'YUEN_LONG', label: '元朗', districtName: 'Yuen Long' },
  { id: 'TIN_SHUI_WAI', label: '天水圍', districtName: 'Tin Shui Wai' },
]

const regionToDistrictName: Record<ActiveRegionId, string> = {
  TUEN_MUN: 'Tuen Mun',
  YUEN_LONG: 'Yuen Long',
  TIN_SHUI_WAI: 'Tin Shui Wai',
}

export async function fetchDistrictBoundaries(
  signal?: AbortSignal,
): Promise<DistrictFeatureCollection> {
  const response = await fetch(DISTRICT_BOUNDARY_URL, { signal })
  if (!response.ok) {
    throw new Error('無法載入香港區界資料。')
  }

  const json = (await response.json()) as DistrictFeatureCollection
  if (json.type !== 'FeatureCollection' || !Array.isArray(json.features)) {
    throw new Error('區界資料格式不正確。')
  }

  return json
}

export function isActiveDistrictName(districtName: string): boolean {
  return ACTIVE_DISTRICT_NAMES.some((name) => name === districtName)
}

export function getRegionDistrictName(regionId: ActiveRegionId): string {
  return regionToDistrictName[regionId]
}

export function getRegionDisplayName(regionId: ActiveRegionId): string {
  const districtName = getRegionDistrictName(regionId)
  return DISTRICT_NAME_ZH[districtName] ?? districtName
}

export function getRegionPolygons(
  regionId: ActiveRegionId,
  collection: DistrictFeatureCollection,
): LngLat[][][] {
  if (regionId === 'TIN_SHUI_WAI') {
    return [[TIN_SHUI_WAI_POLYGON]]
  }

  const districtName = getRegionDistrictName(regionId)
  const feature = collection.features.find(
    (item) => normalizeDistrictName(item.properties?.District) === districtName,
  )

  if (!feature) {
    throw new Error(`找不到 ${districtName} 的邊界資料。`)
  }

  if (feature.geometry.type === 'Polygon') {
    return [feature.geometry.coordinates as LngLat[][]]
  }

  return feature.geometry.coordinates as LngLat[][][]
}

export function normalizeDistrictName(name: string | undefined): string {
  return (name ?? '').trim()
}
