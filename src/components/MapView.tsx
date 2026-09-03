import { useMemo } from 'react'
import { CircleMarker, GeoJSON, MapContainer, Marker, Polyline, TileLayer, Tooltip, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { StyleFunction } from 'leaflet'
import {
  DISTRICT_NAME_ZH,
  TIN_SHUI_WAI_POLYGON,
  isActiveDistrictName,
  normalizeDistrictName,
  type ActiveRegionId,
  type DistrictFeatureCollection,
} from '../lib/districts'
import type { LatLng, RouteCheckpoint } from '../types/app'

type MapViewProps = {
  boundaries: DistrictFeatureCollection | null
  selectedRegionId: ActiveRegionId
  onSelectRegion: (regionId: ActiveRegionId) => void
  routePath: LatLng[]
  walkedUntilIndex: number
  currentPosition: LatLng | null
  userHeading: number | null
  checkpoints: RouteCheckpoint[]
  recordingTrack: LatLng[]
  isRecording: boolean
}

const districtStyle: StyleFunction = (feature) => {
  const districtName = normalizeDistrictName(feature?.properties?.District as string | undefined)
  const isActive = isActiveDistrictName(districtName)
  if (isActive) {
    return { color: '#3B82F6', weight: 1.4, fillColor: '#38BDF8', fillOpacity: 0.25 }
  }
  return { color: '#4B5563', weight: 1, fillColor: '#111827', fillOpacity: 0.55 }
}

// Calculate bearing between two points (degrees from north)
function bearing(from: LatLng, to: LatLng): number {
  const dLng = ((to[1] - from[1]) * Math.PI) / 180
  const lat1 = (from[0] * Math.PI) / 180
  const lat2 = (to[0] * Math.PI) / 180
  const y = Math.sin(dLng) * Math.cos(lat2)
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng)
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360
}

// Create a directional arrow icon for route segments
function createDirectionArrow(heading: number, color: string): L.DivIcon {
  return L.divIcon({
    className: 'route-direction-arrow',
    html: `<div style="transform: rotate(${heading}deg); color: ${color}; font-size: 18px; font-weight: bold; text-shadow: 0 0 3px #000, 0 0 3px #000;">➤</div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  })
}

// Create a heading arrow icon for user's current position
function createHeadingArrow(heading: number): L.DivIcon {
  return L.divIcon({
    className: 'user-heading-arrow',
    html: `<div style="transform: rotate(${heading}deg); font-size: 28px; line-height: 1; filter: drop-shadow(0 0 4px rgba(34,197,94,0.8));">⬆️</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
  })
}

// Component to recenter map on current position
function Recenter({ position }: { position: LatLng | null }) {
  const map = useMap()
  useMemo(() => {
    if (position) {
      map.setView(position, Math.max(map.getZoom(), 15), { animate: true })
    }
  }, [position?.[0], position?.[1]])
  return null
}

export default function MapView({
  boundaries,
  selectedRegionId,
  onSelectRegion,
  routePath,
  walkedUntilIndex,
  currentPosition,
  userHeading,
  checkpoints,
  recordingTrack,
  isRecording,
}: MapViewProps) {
  const walkedPath = useMemo(() => {
    if (routePath.length < 2 || walkedUntilIndex <= 0) return [] as LatLng[]
    return routePath.slice(0, walkedUntilIndex + 1)
  }, [routePath, walkedUntilIndex])

  const remainingPath = useMemo(() => {
    if (routePath.length < 2) return [] as LatLng[]
    return routePath.slice(Math.max(0, walkedUntilIndex))
  }, [routePath, walkedUntilIndex])

  const startPoint = routePath[0] ?? null
  const endPoint = routePath.length > 1 ? routePath[routePath.length - 1] : null

  // Generate direction arrows along the remaining (blue) path
  const routeArrows = useMemo(() => {
    if (remainingPath.length < 3) return [] as Array<{ pos: LatLng; heading: number }>
    const arrows: Array<{ pos: LatLng; heading: number }> = []
    const interval = Math.max(3, Math.floor(remainingPath.length / 6))
    for (let i = 0; i < remainingPath.length - 1; i += interval) {
      const from = remainingPath[i]
      const to = remainingPath[Math.min(i + 1, remainingPath.length - 1)]
      arrows.push({ pos: from, heading: bearing(from, to) })
    }
    return arrows
  }, [remainingPath])

  const tinShuiWaiGeoJson = useMemo(
    () => ({
      type: 'Feature' as const,
      properties: { District: 'Tin Shui Wai' },
      geometry: { type: 'Polygon' as const, coordinates: [TIN_SHUI_WAI_POLYGON] },
    }),
    [],
  )

  return (
    <div className="h-full w-full">
      <MapContainer
        center={[22.356, 114.13]}
        zoom={10}
        minZoom={9}
        maxZoom={18}
        scrollWheelZoom
        className="h-full w-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <Recenter position={currentPosition} />

        {boundaries && (
          <GeoJSON
            data={boundaries}
            style={(feature) => {
              const style = districtStyle(feature)
              const districtName = normalizeDistrictName(feature?.properties?.District as string | undefined)
              if (
                (selectedRegionId === 'TUEN_MUN' && districtName === 'Tuen Mun') ||
                (selectedRegionId === 'YUEN_LONG' && districtName === 'Yuen Long')
              ) {
                return { ...style, fillColor: '#22C55E', fillOpacity: 0.35, color: '#16A34A', weight: 2 }
              }
              return style
            }}
            onEachFeature={(feature, layer) => {
              const districtName = normalizeDistrictName(feature.properties?.District)
              const tooltipLabel = DISTRICT_NAME_ZH[districtName] ?? districtName
              layer.bindTooltip(tooltipLabel, { sticky: true, opacity: 0.9 })
              if (districtName === 'Tuen Mun') layer.on('click', () => onSelectRegion('TUEN_MUN'))
              else if (districtName === 'Yuen Long') layer.on('click', () => onSelectRegion('YUEN_LONG'))
            }}
          />
        )}

        <GeoJSON
          data={tinShuiWaiGeoJson}
          style={() => ({
            color: selectedRegionId === 'TIN_SHUI_WAI' ? '#F59E0B' : '#FBBF24',
            fillColor: selectedRegionId === 'TIN_SHUI_WAI' ? '#F59E0B' : '#FDE68A',
            fillOpacity: selectedRegionId === 'TIN_SHUI_WAI' ? 0.4 : 0.3,
            weight: 2,
            dashArray: '4 3',
          })}
          onEachFeature={(_feature, layer) => {
            layer.bindTooltip('天水圍 (首期開放)', { sticky: true })
            layer.on('click', () => onSelectRegion('TIN_SHUI_WAI'))
          }}
        />

        {/* Remaining path (blue) */}
        {remainingPath.length > 1 && (
          <Polyline positions={remainingPath} pathOptions={{ color: '#3B82F6', weight: 5 }} />
        )}
        {/* Walked path (gray) */}
        {walkedPath.length > 1 && (
          <Polyline positions={walkedPath} pathOptions={{ color: '#6B7280', weight: 6 }} />
        )}

        {/* Direction arrows on remaining path (showing which way to walk) */}
        {routeArrows.map((arrow, i) => (
          <Marker
            key={`arrow_${i}`}
            position={arrow.pos}
            icon={createDirectionArrow(arrow.heading, '#3B82F6')}
            interactive={false}
          />
        ))}

        {/* Live recording track */}
        {isRecording && recordingTrack.length > 1 && (
          <Polyline positions={recordingTrack} pathOptions={{ color: '#F59E0B', weight: 5, dashArray: '6 4' }} />
        )}

        {startPoint && (
          <CircleMarker center={startPoint} radius={6} pathOptions={{ color: '#10B981', fillOpacity: 0.95 }}>
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>起點</Tooltip>
          </CircleMarker>
        )}
        {endPoint && (
          <CircleMarker center={endPoint} radius={6} pathOptions={{ color: '#FB7185', fillOpacity: 0.95 }}>
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>終點</Tooltip>
          </CircleMarker>
        )}

        {checkpoints.map((checkpoint) => (
          <CircleMarker
            key={checkpoint.id}
            center={checkpoint.coordinate}
            radius={7}
            pathOptions={{
              color: checkpoint.unlocked ? '#22C55E' : '#F59E0B',
              fillColor: checkpoint.unlocked ? '#22C55E' : '#FCD34D',
              fillOpacity: 0.95,
            }}
          >
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>
              {checkpoint.label} {checkpoint.unlocked ? '✅' : '📍'}
            </Tooltip>
          </CircleMarker>
        ))}

        {/* User position with heading arrow */}
        {currentPosition && userHeading !== null && (
          <Marker
            position={currentPosition}
            icon={createHeadingArrow(userHeading)}
            interactive={false}
          />
        )}
        {currentPosition && userHeading === null && (
          <CircleMarker center={currentPosition} radius={8} pathOptions={{ color: '#22C55E', fillOpacity: 0.95 }}>
            <Tooltip direction="top" offset={[0, -8]} opacity={1}>目前位置</Tooltip>
          </CircleMarker>
        )}
      </MapContainer>
    </div>
  )
}
