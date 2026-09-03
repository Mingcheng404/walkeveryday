import { useAppLogic } from './App.logic'
import { useBootstrapEffects } from './App.handlers'
import { createHandlers } from './App.createHandlers'
import type { RouteRecord, WalkHistoryRecord, WalkStatus, HabitSettings } from './types/app'
import AuthModal from './components/AuthModal'
import BottomNav from './components/BottomNav'
import BottomSheet from './components/BottomSheet'
import HistoryList from './components/HistoryList'
import MapView from './components/MapView'
import ProfilePanel from './components/ProfilePanel'
import RecordPanel from './components/RecordPanel'
import ShareRouteCard from './components/ShareRouteCard'
import StatsPanel from './components/StatsPanel'
import { ACTIVE_REGIONS, type ActiveRegionId } from './lib/districts'
import { isSupabaseConfigured } from './lib/supabase'
import { buildPublicRouteUrl } from './lib/app-helpers'

export interface Handlers {
  requestAuth: (title: string) => void
  handleInstallPwa: () => Promise<void>
  handleGenerateRoute: () => Promise<void>
  handleStartTracking: () => Promise<void>
  stopTracking: (status: WalkStatus) => Promise<void>
  handleStartRecording: () => Promise<void>
  handleStopRecording: () => void
  handleSaveRecording: (name: string, isPublic: boolean) => Promise<void>
  handleOpenRoute: (route: RouteRecord) => Promise<void>
  handleTogglePublic: (routeId: string, next: boolean) => Promise<void>
  handleDeleteRoute: (routeId: string) => Promise<void>
  handleSaveUsername: (username: string) => Promise<void>
  handleSaveHabit: (settings: HabitSettings) => Promise<void>
  handleSignOut: () => Promise<void>
  loadUserData: (userId: string, email?: string) => Promise<void>
  activateRoute: (route: RouteRecord | null, walkHistory?: WalkHistoryRecord) => void
}

export default function App() {
  const s = useAppLogic()
  // handlers injected via closure below
  const handlers = createHandlers(s)
  // bootstrap effects
  useBootstrapEffects(s, handlers)
  return <AppView s={s} h={handlers} />
}

function AppView({ s, h }: { s: ReturnType<typeof useAppLogic>; h: Handlers }) {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-slate-950">
      <MapView
        boundaries={s.boundaries}
        selectedRegionId={s.selectedRegionId}
        onSelectRegion={s.setSelectedRegionId}
        routePath={s.currentRoute?.pathCoordinates ?? []}
        walkedUntilIndex={s.walkedUntilIndex}
        currentPosition={s.currentPosition}
        checkpoints={s.currentRoute?.checkpoints ?? []}
        recordingTrack={s.recordingTrack}
        isRecording={s.isRecording}
      />
      <Header s={s} h={h} />
      <BottomSheetArea s={s} h={h} />
      <BottomNav
        activeTab={s.activeTab}
        onChange={(tab) => {
          if ((tab === 'history' || tab === 'stats' || tab === 'profile') && !s.session) {
            h.requestAuth('登入後可使用完整功能')
          }
          s.setActiveTab(tab)
        }}
      />
      <AuthModal isOpen={s.authOpen} title={s.authTitle} onClose={() => s.setAuthOpen(false)} onSuccess={() => s.setStatusMessage('登入成功，歡迎回來。')} />
      <ShareRouteCard
        route={s.shareRoute}
        unlockedCheckpointCount={s.shareRoute ? (s.shareRoute.id === s.currentRoute?.id ? s.currentRouteUnlockedCheckpointCount : s.shareRoute.checkpoints.filter((c) => c.unlocked).length) : 0}
        shareUrl={s.shareRoute ? buildPublicRouteUrl(s.shareRoute.id) : ''}
        onClose={() => s.setShareRoute(null)}
      />
    </div>
  )
}

function Header({ s, h }: { s: ReturnType<typeof useAppLogic>; h: Handlers }) {
  return (
    <header className="pointer-events-none absolute left-0 right-0 top-0 z-[900] p-3">
      <div className="pointer-events-auto mx-auto flex max-w-xl items-center justify-between rounded-2xl border border-slate-700/80 bg-slate-900/90 px-4 py-3 shadow-xl backdrop-blur">
        <div>
          <p className="m-0 text-base font-bold text-slate-100">WalkEveryDay</p>
          <p className="m-0 text-xs text-slate-300">{s.isOnline ? '🟢 Online' : '🟠 Offline'} · 香港散步探索 PWA</p>
        </div>
        <div className="flex items-center gap-2">
          {s.installPromptEvent && (
            <button type="button" onClick={() => void h.handleInstallPwa()} className="rounded-lg border border-emerald-400/70 px-3 py-2 text-xs font-semibold text-emerald-200">安裝 App</button>
          )}
          {!s.session && (
            <button type="button" onClick={() => h.requestAuth('登入後可儲存路線、統計與成就')} className="rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white">登入</button>
          )}
        </div>
      </div>
    </header>
  )
}

function BottomSheetArea({ s, h }: { s: ReturnType<typeof useAppLogic>; h: Handlers }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[76px] z-[900] p-3">
      <div className="pointer-events-auto">
        <BottomSheet>
          {s.activeTab === 'explore' && <ExploreTab s={s} h={h} />}
          {s.activeTab === 'record' && (
            <RecordPanel
              isRecording={s.isRecording}
              recordingTrack={s.recordingTrack}
              recordingDistanceKm={s.recordingDistanceKm}
              recordingDurationSec={s.recordingDurationSec}
              onStartRecording={h.handleStartRecording}
              onStopRecording={h.handleStopRecording}
              onSaveRecording={h.handleSaveRecording}
              onCancelSave={() => s.setStatusMessage('已取消儲存。')}
              statusMessage={s.statusMessage}
              locationError={s.locationError}
            />
          )}
          {s.activeTab === 'history' && (
            !s.session ? (
              <button type="button" onClick={() => h.requestAuth('登入後可查看路線歷史')} className="w-full rounded-xl bg-blue-500 px-4 py-3 text-sm font-semibold text-white">登入查看歷史</button>
            ) : (
              <HistoryList
                routes={s.routes}
                latestHistoryByRouteId={s.latestHistoryByRouteId}
                loading={s.loadingRoutes}
                onOpenRoute={(r) => void h.handleOpenRoute(r)}
                onTogglePublic={(id, p) => void h.handleTogglePublic(id, p)}
                onOpenShare={(r) => { if (!r.isPublic) { s.setStatusMessage('請先將路線設為公開。'); return } s.setShareRoute(r) }}
                onDeleteRoute={(id) => void h.handleDeleteRoute(id)}
              />
            )
          )}
          {s.activeTab === 'stats' && (
            <StatsPanel profile={s.profile} badges={s.achievements} unlockedAchievementIds={s.unlockedAchievementIdSet} weeklyTrend={s.weeklyTrend} habitWeeklyTarget={s.habitSettings?.weeklyTargetDays ?? 7} />
          )}
          {s.activeTab === 'profile' && (
            <ProfilePanel
              key={s.profile?.username ?? 'p'}
              profile={s.profile}
              isLoggedIn={Boolean(s.session)}
              habitSettings={s.habitSettings}
              onSaveUsername={h.handleSaveUsername}
              onSaveHabit={h.handleSaveHabit}
              onOpenAuth={() => h.requestAuth('登入後可管理個人資料')}
              onSignOut={h.handleSignOut}
            />
          )}
          {s.loadingDashboard && s.activeTab !== 'explore' && (
            <p className="mt-2 text-center text-xs text-slate-400">同步資料中...</p>
          )}
        </BottomSheet>
      </div>
    </div>
  )
}

function ExploreTab({ s, h }: { s: ReturnType<typeof useAppLogic>; h: Handlers }) {
  return (
    <div className="space-y-3">
      {!isSupabaseConfigured && (
        <p className="m-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">尚未設定 Supabase 金鑰，請先建立 `.env`。</p>
      )}
      {s.boundariesError && (
        <p className="m-0 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">{s.boundariesError}（路線生成仍可用備援邊界）</p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs text-slate-300">開放區域</span>
          <select value={s.selectedRegionId} onChange={(e) => s.setSelectedRegionId(e.target.value as ActiveRegionId)} className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-base text-slate-100">
            {ACTIVE_REGIONS.map((r) => (<option key={r.id} value={r.id}>{r.label}</option>))}
          </select>
        </label>
        <label className="space-y-1">
          <span className="text-xs text-slate-300">預計行走時間 (分鐘)</span>
          <input type="number" inputMode="numeric" min={10} max={180} step={5} value={s.estimatedTimeMins} onChange={(e) => s.setEstimatedTimeMins(e.target.value)} className="w-full rounded-xl border border-slate-600 bg-slate-800 px-3 py-3 text-base text-slate-100" />
        </label>
      </div>
      <button type="button" onClick={() => void h.handleGenerateRoute()} disabled={s.isGenerating} className="w-full rounded-2xl bg-blue-500 px-4 py-3 text-base font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
        {s.isGenerating ? '生成中...' : '生成隨機散步路線'}
      </button>
      {s.currentRoute && (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-3">
          <p className="m-0 text-sm font-semibold text-slate-100">目前路線：{s.currentRouteName}</p>
          <p className="m-0 mt-1 text-sm text-slate-300">預估 {s.currentRoute.estimatedTimeMins} 分鐘 · 約 {s.currentRoute.totalDistanceKm.toFixed(2)} km</p>
          <p className="m-0 mt-1 text-xs text-amber-200">打卡進度：{s.currentRouteUnlockedCheckpointCount}/{s.currentRoute.checkpoints.length}</p>
          <p className="m-0 mt-1 text-xs text-slate-300">路線完成度：{s.progressPercentage}%</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => void h.handleStartTracking()} disabled={s.isTracking} className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50">開始 GPS 追蹤</button>
            <button type="button" onClick={() => void h.stopTracking('paused')} disabled={!s.isTracking} className="rounded-xl border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 disabled:cursor-not-allowed disabled:opacity-40">暫停追蹤</button>
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 text-xs text-slate-300">
        <div className="rounded-lg bg-slate-800 px-2 py-1"><span className="inline-block h-2 w-5 rounded bg-blue-500" /> 未行走路段</div>
        <div className="rounded-lg bg-slate-800 px-2 py-1"><span className="inline-block h-2 w-5 rounded bg-slate-500" /> 已行走路段</div>
      </div>
      {s.locationError && (<p className="m-0 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">定位錯誤：{s.locationError}</p>)}
      <p className="m-0 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-slate-200">{s.statusMessage}</p>
    </div>
  )
}

// Handlers type is exported above
