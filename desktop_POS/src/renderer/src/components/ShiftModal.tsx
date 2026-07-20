import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from './ui/dialog'
import { Input } from './ui/input'
import { Button } from './ui/button'
import { Label } from './ui/label'
import type { useToasts } from '../hooks/useToasts'

type Toasts = ReturnType<typeof useToasts>

export function ShiftModal({
  mode,
  tillId,
  shiftId,
  openingCash,
  expectedCash,
  onClose,
  onDone,
  toasts
}: {
  mode: 'open' | 'close'
  tillId?: string
  shiftId?: string
  openingCash?: number
  expectedCash?: number
  onClose: () => void
  onDone: () => void | Promise<void>
  toasts: Toasts
}) {
  const { t } = useTranslation()
  const [cash, setCash] = useState('')
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (mode === 'close' && typeof openingCash === 'number') {
      setCash(String(openingCash))
    }
  }, [mode, openingCash])

  const handleSubmit = async () => {
    const n = parseFloat(cash)
    if (isNaN(n) || n < 0) {
      toasts.error('Enter a valid amount')
      return
    }
    setSubmitting(true)
    try {
      if (mode === 'open') {
        await window.pos.openShift(tillId ?? 'till-1', n)
        toasts.success(t('shift.opened'))
      } else if (shiftId) {
        await window.pos.closeShift(shiftId, n)
        const variance = expectedCash !== undefined ? n - expectedCash : 0
        toasts.success(t('shift.closed', { variance: variance.toFixed(2) }))
      }
      await onDone()
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-400" />
            {mode === 'open' ? t('shift.open') : t('shift.close')}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {mode === 'open'
              ? 'Enter the opening cash float for this till.'
              : 'Count the cash in the drawer and enter the total.'}
          </DialogDescription>
        </DialogHeader>

        {mode === 'close' && expectedCash !== undefined && (
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">{t('shift.expectedCash')}</span>
              <span className="font-mono font-semibold text-teal-400">Rs {expectedCash.toFixed(2)}</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-slate-500">{t('shift.variance')}</span>
              <span className="font-mono font-semibold text-slate-300">
                {cash ? `Rs ${(parseFloat(cash) - expectedCash).toFixed(2)}` : '—'}
              </span>
            </div>
          </div>
        )}

        <div className="space-y-2">
          <Label>{mode === 'open' ? t('shift.openingCash') : t('shift.countedCash')}</Label>
          <Input
            type="number" step="0.01" value={cash}
            onChange={(e) => setCash(e.target.value)} autoFocus
            className="bg-slate-950 border-slate-700 text-lg font-mono"
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-700">{t('common.cancel')}</Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-teal-500 text-teal-950 hover:bg-teal-400"
          >
            {submitting ? t('common.loading') : mode === 'open' ? t('shift.confirmOpen') : t('shift.confirmClose')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
