import { useState } from 'react'
import type { LatLng } from '../types/app'

type RecordPanelProps = {
  isRecording: boolean
  recordingTrack: LatLng[]
  recordingDistanceKm: number
  recordingDurationSec: number
  onStartRecording: () => void
  onStopRecording: () => void
  onSaveRecording: (routeName: string, isPublic: boolean) => void
  onCancelSave: () => void
  statusMessage: string
  locationError: string
}

export default function RecordPanel({
  isRecording,
  recordingTrack,
  recordingDistanceKm,
  recordingDurationSec,
  onStartRecording,
  onStopRecording,
  onSaveRecording,
  onCancelSave,
  statusMessage,
  locationError,
}: RecordPanelProps) {
  const [routeName, setRouteName] = useState('')
  const [isPublic, setIsPublic] = useState(true)
  const [showSaveForm, setShowSaveForm] = useState(false)

  const mins = Math.floor(recordingDurationSec / 60)
  const secs = recordingDurationSec % 60
  const timeLabel = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`

  function handleStop() {
    onStopRecording()
    setShowSaveForm(true)
  }

  function handleSave() {
    onSaveRecording(routeName.trim() || `自記路線 ${new Date().toLocaleDateString('zh-HK')}`, isPublic)
    setRouteName('')
    setShowSaveForm(false)
  }

  function handleCancel() {
    onCancelSave()
    setShowSaveForm(false)
    setRouteName('')
  }

  return (
    <div className="space-y-3">
      <p className="m-0 rounded-lg border border-sky-400/30 bg-sky-500/10 px-3 py-2 text-sm text-sky-200">
        📡 自記路線：按下「開始記錄」後，系統會用 GPS 即時記錄你的行走軌跡。結束後可命名並分享。
      </p>

      {locationError && (
        <p className="m-0 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          定位錯誤：{locationError}
        </p>
      )}

      {isRecording && (
        <div className="rounded-2xl border border-amber-400/50 bg-amber-500/10 p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="m-0 text-sm font-bold text-amber-200">🔴 記錄中</p>
              <p className="m-0 mt-1 text-xs text-amber-100">
                時間 {timeLabel} · 距離 {recordingDistanceKm.toFixed(2)} km · 點數 {recordingTrack.length}
              </p>
            </div>
            <button
              type="button"
              onClick={handleStop}
              className="rounded-xl bg-rose-500 px-4 py-2 text-sm font-bold text-white"
            >
              停止並儲存
            </button>
          </div>
        </div>
      )}

      {!isRecording && !showSaveForm && (
        <button
          type="button"
          onClick={onStartRecording}
          className="w-full rounded-2xl bg-amber-500 px-4 py-3 text-base font-bold text-white"
        >
          開始記錄路線
        </button>
      )}

      {showSaveForm && (
        <div className="rounded-2xl border border-slate-700 bg-slate-800/70 p-3 space-y-3">
          <p className="m-0 text-sm font-semibold text-slate-100">儲存自記路線</p>
          <p className="m-0 text-xs text-slate-300">
            距離 {recordingDistanceKm.toFixed(2)} km · 時間 {timeLabel}
          </p>
          <label className="block space-y-1">
            <span className="text-xs text-slate-300">路線名稱</span>
            <input
              type="text"
              value={routeName}
              onChange={(e) => setRouteName(e.target.value)}
              className="w-full rounded-xl border border-slate-600 bg-slate-900/60 px-3 py-3 text-sm text-slate-100"
              placeholder="例如：屯門河畔散步"
            />
          </label>
          <label className="flex items-center justify-between">
            <span className="text-xs text-slate-300">設為公開（可分享）</span>
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} />
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleSave}
              className="rounded-xl bg-blue-500 px-3 py-2 text-sm font-semibold text-white"
            >
              儲存路線
            </button>
            <button
              type="button"
              onClick={handleCancel}
              className="rounded-xl border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100"
            >
              取消（丟棄）
            </button>
          </div>
        </div>
      )}

      <p className="m-0 rounded-xl border border-slate-700 bg-slate-800/70 px-3 py-2 text-sm text-slate-200">
        {statusMessage}
      </p>
    </div>
  )
}
