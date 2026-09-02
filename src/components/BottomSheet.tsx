import type { ReactNode } from 'react'

type BottomSheetProps = {
  children: ReactNode
}

export default function BottomSheet({ children }: BottomSheetProps) {
  return (
    <section className="mx-auto w-full max-w-xl rounded-3xl border border-slate-700/80 bg-slate-900/95 p-4 shadow-2xl backdrop-blur md:p-5">
      {children}
    </section>
  )
}
