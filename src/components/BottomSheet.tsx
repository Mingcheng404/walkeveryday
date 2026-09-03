import { useState, type ReactNode } from 'react'

type BottomSheetProps = {
  children: ReactNode
}

export default function BottomSheet({ children }: BottomSheetProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <section
      className={`mx-auto w-full max-w-xl rounded-t-3xl border border-slate-700/80 bg-slate-900/95 shadow-2xl backdrop-blur transition-all duration-300 ${
        expanded ? 'max-h-[70vh] overflow-y-auto p-4' : 'max-h-[40vh] overflow-y-auto p-3'
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="mx-auto mb-2 block h-1.5 w-12 rounded-full bg-slate-600 active:bg-slate-500"
        aria-label={expanded ? '收起面板' : '展開面板'}
      />
      {children}
    </section>
  )
}
