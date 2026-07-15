import { CheckCircle2, XCircle, Info } from 'lucide-react'
import type { Toast } from '../hooks/useToasts'

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info
} as const

export function ToastContainer({
  toasts,
  onDismiss
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2">
      {toasts.map((t) => {
        const Icon = ICONS[t.kind] ?? Info
        return (
          <div
            key={t.id}
            onClick={() => onDismiss(t.id)}
            role="alert"
            className={`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg max-w-[360px] text-sm font-medium cursor-pointer animate-in fade-in slide-in-from-right-2 ${
              t.kind === 'success'
                ? 'bg-emerald-500 text-white'
                : t.kind === 'error'
                  ? 'bg-red-500 text-white'
                  : 'bg-slate-800 text-slate-100 border border-slate-700'
            }`}
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span>{t.message}</span>
          </div>
        )
      })}
    </div>
  )
}
