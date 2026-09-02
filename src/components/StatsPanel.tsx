import type { AchievementBadge, ProfileStats } from '../types/app'

type StatsPanelProps = {
  profile: ProfileStats | null
  badges: AchievementBadge[]
  unlockedAchievementIds: Set<string>
}

export default function StatsPanel({ profile, badges, unlockedAchievementIds }: StatsPanelProps) {
  const totalBadges = badges.length
  const unlockedCount = badges.filter((badge) => unlockedAchievementIds.has(badge.id)).length

  return (
    <div className="space-y-3">
      {!profile ? (
        <p className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-3 text-sm text-slate-200">
          登入後可查看個人統計與成就。
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <StatCard label="累積公里" value={`${profile.totalDistanceKm.toFixed(2)} km`} />
          <StatCard label="累積時間" value={`${profile.totalWalkTimeMins} 分鐘`} />
          <StatCard label="預估卡路里" value={`${Math.round(profile.totalCaloriesBurned)} kcal`} />
          <StatCard label="連續天數" value={`${profile.currentStreak} 天`} />
          <StatCard label="完成次數" value={`${profile.completedWalks} 次`} />
        </div>
      )}

      <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="m-0 text-sm font-semibold text-slate-100">徽章成就</p>
          <p className="m-0 text-xs text-slate-300">
            {unlockedCount} / {totalBadges}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          {badges.map((badge) => {
            const unlocked = unlockedAchievementIds.has(badge.id)
            return (
              <div
                key={badge.id}
                className={`rounded-xl border px-2 py-2 ${
                  unlocked
                    ? 'border-emerald-400/60 bg-emerald-500/10'
                    : 'border-slate-600 bg-slate-900/30'
                }`}
              >
                <p className="m-0 text-base">{badge.iconEmoji}</p>
                <p className="m-0 text-xs font-semibold text-slate-100">{badge.title}</p>
                <p className="m-0 mt-1 text-[11px] text-slate-300">{badge.description}</p>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-3">
      <p className="m-0 text-xs text-slate-300">{label}</p>
      <p className="m-0 mt-1 text-sm font-bold text-slate-100">{value}</p>
    </div>
  )
}
