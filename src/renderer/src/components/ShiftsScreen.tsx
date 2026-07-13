import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { useToasts } from '../hooks/useToasts'
import { ShiftModal } from './ShiftModal'

type Toasts = ReturnType<typeof useToasts>
type Shift = {
  id: string
  tillId: string
  openingCash: number
  closingCash: number | null
  expectedCash: number | null
  openedAt: string
  closedAt: string | null
}

export function ShiftsScreen({
  toasts,
  onShiftChanged
}: {
  toasts: Toasts
  onShiftChanged: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [openShift, setOpenShift] = useState<Shift | null>(null)
  const [modalMode, setModalMode] = useState<'open' | 'close' | null>(null)

  const refresh = async () => {
    const [list, open] = await Promise.all([
      window.pos.getShifts(),
      window.pos.getOpenShift('till-1')
    ])
    setShifts(list)
    setOpenShift(open)
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div className="panel">
      <div className="panel-section">
        <h3>📌 {t('app.shifts')}</h3>
        {openShift ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600 }}>
                {t('shift.open')}: {new Date(openShift.openedAt).toLocaleString()}
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                {t('shift.openingCash')}: Rs {openShift.openingCash.toFixed(2)}
              </div>
            </div>
            <button className="btn btn-primary" onClick={() => setModalMode('close')}>
              {t('shift.close')}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <p style={{ color: 'var(--text-muted)' }}>{t('shift.noOpen')}</p>
            <button className="btn btn-primary" onClick={() => setModalMode('open')}>
              {t('shift.open')}
            </button>
          </div>
        )}
      </div>

      <div className="panel-section">
        <h3>📋 History</h3>
        {shifts.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>No shifts recorded yet.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '8px' }}>Opened</th>
                  <th style={{ padding: '8px' }}>Closed</th>
                  <th style={{ padding: '8px' }}>Opening</th>
                  <th style={{ padding: '8px' }}>Expected</th>
                  <th style={{ padding: '8px' }}>Counted</th>
                  <th style={{ padding: '8px' }}>Variance</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s) => {
                  const variance = s.closingCash !== null && s.expectedCash !== null
                    ? s.closingCash - s.expectedCash
                    : null
                  return (
                    <tr key={s.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '8px' }}>{new Date(s.openedAt).toLocaleString()}</td>
                      <td style={{ padding: '8px' }}>
                        {s.closedAt ? new Date(s.closedAt).toLocaleString() : '—'}
                      </td>
                      <td style={{ padding: '8px' }}>Rs {s.openingCash.toFixed(2)}</td>
                      <td style={{ padding: '8px' }}>
                        {s.expectedCash !== null ? `Rs ${s.expectedCash.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '8px' }}>
                        {s.closingCash !== null ? `Rs ${s.closingCash.toFixed(2)}` : '—'}
                      </td>
                      <td style={{ padding: '8px', color: variance === null ? 'inherit' : variance < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        {variance === null ? '—' : `Rs ${variance.toFixed(2)}`}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalMode && (
        <ShiftModal
          mode={modalMode}
          shiftId={openShift?.id}
          openingCash={openShift?.openingCash}
          expectedCash={openShift?.expectedCash ?? undefined}
          onClose={() => setModalMode(null)}
          onDone={async () => {
            await refresh()
            await onShiftChanged()
            setModalMode(null)
          }}
          toasts={toasts}
        />
      )}
    </div>
  )
}
