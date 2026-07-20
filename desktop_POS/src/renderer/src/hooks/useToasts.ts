import { useState, useCallback } from 'react'

export type ToastKind = 'success' | 'error' | 'warning' | 'info'
export type Toast = { id: number; kind: ToastKind; message: string }

let nextId = 1

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])

  const show = useCallback((kind: ToastKind, message: string, durationMs = 3500) => {
    const id = nextId++
    setToasts((t) => [...t, { id, kind, message }])
    setTimeout(() => dismiss(id), durationMs)
  }, [dismiss])

  return {
    toasts,
    show,
    dismiss,
    success: (m: string) => show('success', m),
    error: (m: string) => show('error', m, 5000),
    warning: (m: string) => show('warning', m, 5000),
    info: (m: string) => show('info', m)
  }
}
