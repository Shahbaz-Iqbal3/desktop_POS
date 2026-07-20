'use client'
import { toast as sonnerToast } from 'sonner'

export const toasts = {
  success: (m: string) => sonnerToast.success(m),
  error: (m: string) => sonnerToast.error(m),
  info: (m: string) => sonnerToast.info(m),
  warning: (m: string) => sonnerToast.warning(m)
}
