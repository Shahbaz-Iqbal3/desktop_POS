import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { useToasts } from '../hooks/useToasts'

type Toasts = ReturnType<typeof useToasts>

export function ShiftModal({
  mode,
  shiftId,
  openingCash,
  expectedCash,
  onClose,
  onDone,
  toasts
}: {
  mode: 'open' | 'close'
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
        await window.pos.openShift('till-1', n)
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>{mode === 'open' ? t('shift.open') : t('shift.close')}</h2>

        {mode === 'close' && expectedCash !== undefined && (
          <div className="cart-total-row" style={{ marginBottom: 16, background: 'var(--bg)', padding: 12, borderRadius: 6 }}>
            <span className="label">{t('shift.expectedCash')}</span>
            <span className="value">Rs {expectedCash.toFixed(2)}</span>
          </div>
        )}

        <div className="form-row">
          <label>
            {mode === 'open' ? t('shift.openingCash') : t('shift.countedCash')}
          </label>
          <input
            className="form-input"
            type="number"
            step="0.01"
            value={cash}
            onChange={(e) => setCash(e.target.value)}
            autoFocus
          />
        </div>

        <div className="modal-actions">
          <button className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting ? t('common.loading') : mode === 'open' ? t('shift.confirmOpen') : t('shift.confirmClose')}
          </button>
        </div>
      </div>
    </div>
  )
}
