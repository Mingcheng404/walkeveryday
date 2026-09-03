import { DISTRICT_NAME_ZH } from '../lib/districts'
import type { RouteRecord, WalkHistoryRecord } from '../types/app'

type HistoryListProps = {
  routes: RouteRecord[]
  latestHistoryByRouteId: Record<string, WalkHistoryRecord | undefined>
  loading: boolean
  onOpenRoute: (route: RouteRecord) => void
  onTogglePublic: (routeId: string, nextPublicState: boolean) => void
  onOpenShare: (route: RouteRecord) => void
  onDeleteRoute: (routeId: string) => void
}

export default function HistoryList({
  routes,
  latestHistoryByRouteId,
  loading,
  onOpenRoute,
  onTogglePublic,
  onOpenShare,
  onDeleteRoute,
}: HistoryListProps) {
  if (loading) return <p className="py-6 text-center text-sm text-slate-300">正在載入歷史路線...</p>

  if (routes.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-slate-300">
        你尚未產生任何路線。先到「探索」生成第一條路線吧。
      </p>
    )
  }

  return (
    <div className="max-h-[47vh] space-y-3 overflow-y-auto pr-1">
      {routes.map((route) => {
        const districtLabel = DISTRICT_NAME_ZH[route.district] ?? route.district
        const createdAt = new Date(route.createdAt).toLocaleString('zh-HK')
        const latestHistory = latestHistoryByRouteId[route.id]
        const statusLabel =
          latestHistory?.status === 'completed' ? '已完成'
            : latestHistory?.status === 'in_progress' ? '行走中'
            : latestHistory?.status === 'paused' ? '可繼續'
            : '未開始'
        const sourceLabel = route.routeSource === 'recorded' ? '📡 自記' : '🎲 隨機'

        return (
          <article key={route.id} className="rounded-2xl border border-slate-700/80 bg-slate-800/60 p-3">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div>
                <h3 className="m-0 text-base font-semibold text-slate-100">
                  {route.routeName ?? districtLabel}
                </h3>
                <p className="m-0 mt-0.5 text-xs text-slate-400">{sourceLabel} · {districtLabel}</p>
              </div>
              <span className="rounded-md bg-slate-700 px-2 py-0.5 text-xs text-slate-200">{statusLabel}</span>
            </div>
            <p className="m-0 text-sm text-slate-300">
              {route.estimatedTimeMins} 分鐘 · 約 {route.totalDistanceKm.toFixed(2)} km
            </p>
            <p className="m-0 mt-1 text-xs text-slate-400">{createdAt}</p>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onOpenRoute(route)}
                className="rounded-xl border border-blue-400/60 bg-blue-500/15 px-3 py-2 text-sm font-semibold text-blue-200"
              >
                開啟 / 繼續
              </button>
              <button
                type="button"
                onClick={() => onTogglePublic(route.id, !route.isPublic)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                  route.isPublic
                    ? 'border border-emerald-400/70 bg-emerald-500/15 text-emerald-200'
                    : 'border border-slate-500 text-slate-200'
                }`}
              >
                {route.isPublic ? '已公開' : '設為公開'}
              </button>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onOpenShare(route)}
                disabled={!route.isPublic}
                className="rounded-xl border border-amber-400/50 bg-amber-500/10 px-3 py-2 text-sm font-semibold text-amber-200 disabled:cursor-not-allowed disabled:opacity-40"
              >
                生成分享卡
              </button>
              <button
                type="button"
                onClick={() => onDeleteRoute(route.id)}
                className="rounded-xl border border-rose-400/50 bg-rose-500/10 px-3 py-2 text-sm font-semibold text-rose-200"
              >
                刪除路線
              </button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
