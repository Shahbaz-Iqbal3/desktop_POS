import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { useToasts } from '../hooks/useToasts'

type Toasts = ReturnType<typeof useToasts>

export function ReportsScreen({ toasts }: { toasts: Toasts }) {
  const { t } = useTranslation()
  const today = new Date().toISOString().slice(0, 10)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)

  const handleExport = async (type: 'sales' | 'stock' | 'cash') => {
    const result = await window.pos.exportReport({ type, from: `${from}T00:00:00`, to: `${to}T23:59:59` })
    if (result.ok) toasts.success(`Exported: ${result.path}`)
    else if (result.error !== 'Export cancelled') toasts.error(result.error ?? 'Export failed')
  }

  return (
    <div className="panel">
      <div className="panel-section">
        <h3>📊 Reports</h3>
        <div className="form-row">
          <label>From</label>
          <input
            className="form-input"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label>To</label>
          <input
            className="form-input"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label></label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-primary" onClick={() => handleExport('sales')}>
              {t('reports.exportSales')}
            </button>
            <button className="btn" onClick={() => handleExport('stock')}>
              Export Stock
            </button>
            <button className="btn" onClick={() => handleExport('cash')}>
              Export Cash
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
