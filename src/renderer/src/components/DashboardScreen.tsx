import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

type Dashboard = {
  todaySales: { total: number; count: number }
  cashDigitalSplit: { cash: number; digital: number }
  bestCategory: { name: string; total: number } | null
  lowStock: Array<{ id: string; name: string; stock: number; threshold: number }>
}

export function DashboardScreen() {
  const { t } = useTranslation()
  const [data, setData] = useState<Dashboard | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const d = await window.pos.getDashboard()
      setData(d)
      setLoading(false)
    }
    void load()
    const interval = setInterval(load, 60000) // poll every 60s
    return () => clearInterval(interval)
  }, [])

  if (loading || !data) {
    return <div className="panel"><p>Loading...</p></div>
  }

  const cashPct = data.cashDigitalSplit.cash + data.cashDigitalSplit.digital > 0
    ? (data.cashDigitalSplit.cash / (data.cashDigitalSplit.cash + data.cashDigitalSplit.digital)) * 100
    : 0
  const digitalPct = 100 - cashPct

  return (
    <div className="panel">
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-label">{t('reports.todaySales')}</div>
          <div className="stat-value">Rs {data.todaySales.total.toFixed(2)}</div>
          <div className="stat-sub">
            {data.todaySales.count} {t('reports.count')}
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">{t('reports.cashDigital')}</div>
          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', background: 'var(--bg)' }}>
              <div style={{ width: `${cashPct}%`, background: 'var(--success)' }} />
              <div style={{ width: `${digitalPct}%`, background: 'var(--primary)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6, color: 'var(--text-muted)' }}>
              <span>Cash: Rs {data.cashDigitalSplit.cash.toFixed(2)}</span>
              <span>Digital: Rs {data.cashDigitalSplit.digital.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">{t('reports.bestCategory')}</div>
          {data.bestCategory ? (
            <>
              <div className="stat-value" style={{ fontSize: 22 }}>{data.bestCategory.name}</div>
              <div className="stat-sub">Rs {data.bestCategory.total.toFixed(2)}</div>
            </>
          ) : (
            <div className="stat-sub">{t('reports.noSales')}</div>
          )}
        </div>

        <div className="stat-card">
          <div className="stat-label">{t('reports.lowStock')}</div>
          {data.lowStock.length === 0 ? (
            <div className="stat-sub">{t('reports.noLowStock')}</div>
          ) : (
            <div style={{ marginTop: 8, maxHeight: 120, overflowY: 'auto' }}>
              {data.lowStock.map((p) => (
                <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '2px 0' }}>
                  <span>{p.name}</span>
                  <span style={{ color: 'var(--danger)' }}>{p.stock}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
