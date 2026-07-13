import type { Toast } from '../hooks/useToasts'

export function ToastContainer({
  toasts,
  onDismiss
}: {
  toasts: Toast[]
  onDismiss: (id: number) => void
}) {
  return (
    <div className="toast-container">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast ${t.kind}`}
          onClick={() => onDismiss(t.id)}
          role="alert"
        >
          {t.message}
        </div>
      ))}
    </div>
  )
}
