import { DISTRICT_NAME_ZH } from '../lib/districts'
import type { RouteRecord } from '../types/app'

type ShareRouteCardProps = {
  route: RouteRecord | null
  unlockedCheckpointCount: number
  shareUrl: string
  onClose: () => void
}

export default function ShareRouteCard({
  route,
  unlockedCheckpointCount,
  shareUrl,
  onClose,
}: ShareRouteCardProps) {
  if (!route) {
    return null
  }

  const districtLabel = DISTRICT_NAME_ZH[route.district] ?? route.district
  const shareText = [
    `我在 WalkEveryDay 生成了 ${districtLabel} 散步路線！`,
    `時間：約 ${route.estimatedTimeMins} 分鐘`,
    `距離：約 ${route.totalDistanceKm.toFixed(2)} km`,
    `打卡點：${unlockedCheckpointCount}/${route.checkpoints.length}`,
    `路線連結：${shareUrl}`,
  ].join('\n')

  async function handleShareOrCopy(): Promise<void> {
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'WalkEveryDay 路線分享',
          text: shareText,
          url: shareUrl,
        })
        return
      } catch {
        // Fallback to clipboard copy if share action is canceled or unavailable.
      }
    }

    await navigator.clipboard.writeText(shareText)
  }

  return (
    <div className="fixed inset-0 z-[1100] bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="mx-auto mt-10 w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-4 shadow-2xl">
        <div className="rounded-2xl border border-sky-400/30 bg-gradient-to-br from-slate-800 to-slate-900 p-4">
          <p className="m-0 text-xs tracking-wide text-sky-300">WalkEveryDay 分享卡</p>
          <h3 className="m-0 mt-2 text-xl font-bold text-slate-100">{districtLabel}</h3>
          <p className="m-0 mt-1 text-sm text-slate-200">
            {route.estimatedTimeMins} 分鐘 · {route.totalDistanceKm.toFixed(2)} km
          </p>
          <p className="m-0 mt-2 text-sm text-slate-300">
            已解鎖打卡點 {unlockedCheckpointCount}/{route.checkpoints.length}
          </p>
          <p className="m-0 mt-3 break-all text-xs text-slate-400">{shareUrl}</p>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void handleShareOrCopy()}
            className="rounded-xl bg-blue-500 px-3 py-2 text-sm font-semibold text-white"
          >
            分享 / 複製
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  )
}
