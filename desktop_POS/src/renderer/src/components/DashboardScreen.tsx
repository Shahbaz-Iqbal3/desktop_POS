import { useEffect, useState, useCallback, type ComponentType } from 'react'
import { useTranslation } from 'react-i18next'
import {
  BarChart3, TrendingUp, TrendingDown, Wallet, DollarSign, Package, PackageX,
  AlertTriangle, Download, RefreshCw, FileBarChart
} from 'lucide-react'
import type { useToasts } from '../hooks/useToasts'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Toasts = ReturnType<typeof useToasts>
type Range = 'today' | '7d' | '30d'

type DashData = {
  todaySales: { total: number; count: number }
  cashDigitalSplit: { cash: number; digital: number }
  cashInTill: number
  openingCash: number
  bestCategory: { name: string; total: number } | null
  lowStock: Array<{ id: string; name: string; stock: number; threshold: number }>
  hourlyTrend: Array<{ hour: string; total: number }>
  topProducts: Array<{ name: string; qty: number; total: number }>
}

const fmt = (n: number) => `Rs ${Number(n ?? 0).toFixed(2)}`

const ACCENTS: Record<string, { text: string; bg: string; ring: string }> = {
  teal: { text: 'text-teal-400', bg: 'bg-teal-500/10', ring: 'ring-teal-500/20' },
  emerald: { text: 'text-emerald-400', bg: 'bg-emerald-500/10', ring: 'ring-emerald-500/20' },
  cyan: { text: 'text-cyan-400', bg: 'bg-cyan-500/10', ring: 'ring-cyan-500/20' },
  amber: { text: 'text-amber-400', bg: 'bg-amber-500/10', ring: 'ring-amber-500/20' },
}

function SectionHeading({ icon: Icon, title, badge }: { icon: ComponentType<{ className?: string }>; title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h3 className="text-sm font-semibold flex items-center gap-2 text-slate-200">
        <Icon className="w-4 h-4 text-teal-400" /> {title}
      </h3>
      {badge && <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700">{badge}</Badge>}
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, accent, trend }: {
  icon: ComponentType<{ className?: string }>
  label: string
  value: string
  sub: string
  accent: keyof typeof ACCENTS
  trend?: number | null
}) {
  const a = ACCENTS[accent]
  return (
    <Card className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 hover:border-slate-700 hover:bg-slate-900/80 transition-all duration-150">
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${a.bg} ring-1 ${a.ring}`}>
          <Icon className={`w-4 h-4 ${a.text}`} />
        </div>
        {typeof trend === 'number' && trend !== 0 && (
          <span className={`flex items-center gap-0.5 text-[11px] font-medium ${trend > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {trend > 0 ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(trend)}%
          </span>
        )}
      </div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-xl font-bold tabular-nums truncate text-slate-100">{value}</div>
      <div className="text-[11px] text-slate-500 mt-1">{sub}</div>
    </Card>
  )
}

function TrendChart({ data }: { data: Array<{ hour: string; total: number }> }) {
  const W = 640, H = 220, padX = 16, padY = 24
  const max = Math.max(1, ...data.map((d) => d.total))
  const n = data.length
  const innerW = W - padX * 2
  const innerH = H - padY * 2
  const x = (i: number) => padX + (n <= 1 ? innerW / 2 : (i * innerW) / (n - 1))
  const y = (v: number) => padY + innerH - (v / max) * innerH
  const pts = data.map((d, i) => [x(i), y(d.total)] as const)
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)} ${(padY + innerH).toFixed(1)} L${x(0).toFixed(1)} ${(padY + innerH).toFixed(1)} Z`
  const step = Math.max(1, Math.ceil(n / 7))
  const peakIdx = data.reduce((best, d, i) => (d.total > data[best].total ? i : best), 0)
  const hasPeak = data.some((d) => d.total > 0)
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 220 }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="trendGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.35} />
          <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((g) => (
        <line key={g} x1={padX} x2={W - padX} y1={padY + innerH * g} y2={padY + innerH * g} stroke="#1e293b" strokeWidth={1} />
      ))}
      <path d={area} fill="url(#trendGrad)" />
      <path d={line} fill="none" stroke="#14b8a6" strokeWidth={2.25} strokeLinecap="round" strokeLinejoin="round" />
      {hasPeak && (
        <circle cx={x(peakIdx)} cy={y(data[peakIdx].total)} r={3.5} fill="#14b8a6" stroke="#0f172a" strokeWidth={2} />
      )}
      {data.map((d, i) => i % step === 0 && (
        <text key={i} x={x(i)} y={H - 6} fill="#64748b" fontSize={10} textAnchor="middle">{d.hour}</text>
      ))}
    </svg>
  )
}

function DonutChart({ data }: { data: Array<{ name: string; value: number; color: string }> }) {
  const size = 180, r = 64, cx = size / 2, cy = size / 2, sw = 20
  const circ = 2 * Math.PI * r
  const total = data.reduce((s, d) => s + d.value, 0)
  let offset = 0
  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1e293b" strokeWidth={sw} />
        {total > 0 && data.map((d, i) => {
          const dash = (d.value / total) * circ
          const seg = (
            <circle
              key={i}
              cx={cx} cy={cy} r={r} fill="none" stroke={d.color} strokeWidth={sw}
              strokeDasharray={`${dash} ${circ - dash}`}
              strokeDashoffset={-offset}
              strokeLinecap={data.length > 1 ? 'butt' : 'round'}
              transform={`rotate(-90 ${cx} ${cy})`}
            />
          )
          offset += dash
          return seg
        })}
        <text x={cx} y={cy - 2} textAnchor="middle" fill="#f1f5f9" fontSize={15} fontWeight={700}>{fmt(total)}</text>
        <text x={cx} y={cy + 14} textAnchor="middle" fill="#64748b" fontSize={10}>Total</text>
      </svg>
    </div>
  )
}

function EmptyChart({ label }: { label: string }) {
  return (
    <div className="h-[220px] flex flex-col items-center justify-center text-slate-600">
      <BarChart3 className="w-8 h-8 mb-1 opacity-40" />
      <p className="text-xs">{label}</p>
    </div>
  )
}

export function DashboardScreen({ toasts }: { toasts: Toasts }) {
  const { t } = useTranslation()
  const [data, setData] = useState<DashData | null>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<Range>('today')
  const [from, setFrom] = useState(new Date().toISOString().slice(0, 10))
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))

  const load = useCallback(async () => {
    const d = await window.pos.getDashboard(range)
    setData(d)
    setLoading(false)
  }, [range])

  useEffect(() => {
    void load()
    const iv = setInterval(load, 30000)
    return () => clearInterval(iv)
  }, [load])

  const handleExport = async (type: 'sales' | 'stock' | 'cash') => {
    const result = await window.pos.exportReport({ type, from: `${from}T00:00:00`, to: `${to}T23:59:59` })
    if (result.ok) toasts.success(`Exported: ${result.path}`)
    else if (result.error !== 'Export cancelled') toasts.error(result.error ?? 'Export failed')
  }

  if (loading || !data) {
    return (
      <div className="h-full flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  const rangeLabel = range === 'today' ? 'Today' : range === '7d' ? 'Last 7 days' : 'Last 30 days'
  const totalSplit = data.cashDigitalSplit.cash + data.cashDigitalSplit.digital
  const digitalPct = totalSplit > 0 ? (data.cashDigitalSplit.digital / totalSplit) * 100 : 0
  const pieData = [
    { name: 'Cash', value: data.cashDigitalSplit.cash, color: '#22c55e' },
    { name: 'Digital', value: data.cashDigitalSplit.digital, color: '#14b8a6' }
  ].filter((d) => d.value > 0)

  const trendHasData = data.hourlyTrend.some((h) => h.total > 0)
  const avgTicket = data.todaySales.count > 0 ? data.todaySales.total / data.todaySales.count : 0

  return (
    <div className="h-full overflow-y-auto pos-scroll bg-slate-950 text-slate-100">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur-sm border-b border-slate-800/80 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            {t('app.dashboard')}
            <span className="flex items-center gap-1 text-[10px] font-normal text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> live
            </span>
          </h1>
          <p className="text-xs text-slate-500">{rangeLabel} · auto-refreshes every 30s</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-0.5 bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            {(['today', '7d', '30d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                  range === r ? 'bg-teal-500 text-teal-950' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {r === 'today' ? 'Today' : r === '7d' ? '7 days' : '30 days'}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={load} className="border-slate-700 text-slate-300">
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* KPI cards — the primary summary, no separate strip duplicating them */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <KpiCard
            icon={DollarSign}
            label={range === 'today' ? t('reports.todaySales') : 'Total Sales'}
            value={fmt(data.todaySales.total)}
            sub={`${data.todaySales.count} ${t('reports.count')} · avg ${fmt(avgTicket)}`}
            accent="teal"
          />
          <KpiCard
            icon={Wallet}
            label="Cash in Till"
            value={fmt(data.cashInTill)}
            sub={`opening ${fmt(data.openingCash)}`}
            accent="emerald"
          />
          <KpiCard
            icon={DollarSign}
            label={t('billing.digital')}
            value={fmt(data.cashDigitalSplit.digital)}
            sub={totalSplit > 0 ? `${Math.round(digitalPct)}% of total` : 'No sales yet'}
            accent="cyan"
          />
          <KpiCard
            icon={TrendingUp}
            label={t('reports.bestCategory')}
            value={data.bestCategory?.name ?? '—'}
            sub={data.bestCategory ? fmt(data.bestCategory.total) : t('reports.noSales')}
            accent="amber"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          {/* Sales trend */}
          <Card className="lg:col-span-2 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <SectionHeading
              icon={BarChart3}
              title={range === 'today' ? 'Hourly Sales Trend' : 'Daily Sales Trend'}
              badge={range === 'today' ? '8:00 – 22:00' : `${data.hourlyTrend.length} days`}
            />
            {trendHasData ? <TrendChart data={data.hourlyTrend} /> : <EmptyChart label="No sales yet" />}
          </Card>

          {/* Cash vs Digital */}
          <Card className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <SectionHeading icon={Wallet} title="Cash vs Digital" />
            {pieData.length > 0 ? (
              <>
                <DonutChart data={pieData} />
                <div className="flex justify-center gap-4 mt-2">
                  {pieData.map((d) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                      <span className="text-slate-400">{d.name}</span>
                      <span className="font-medium tabular-nums">{fmt(d.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : <EmptyChart label="No sales yet" />}
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Top products */}
          <Card className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <SectionHeading icon={Package} title="Top Products" />
            {data.topProducts.length > 0 ? (
              <div className="space-y-1">
                {data.topProducts.map((p, i) => {
                  const pct = data.topProducts[0].total > 0 ? (p.total / data.topProducts[0].total) * 100 : 0
                  return (
                    <div key={i} className="relative flex items-center gap-3 py-2 px-2 -mx-2 rounded-lg hover:bg-slate-800/40 transition-colors overflow-hidden">
                      <div
                        className="absolute inset-y-0 left-0 bg-teal-500/[0.06] rounded-lg"
                        style={{ width: `${pct}%` }}
                      />
                      <div className={`relative w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-800 text-slate-400'
                      }`}>{i + 1}</div>
                      <div className="relative flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{p.name}</div>
                        <div className="text-[10px] text-slate-500">{p.qty} sold</div>
                      </div>
                      <div className="relative text-sm font-semibold text-teal-400 tabular-nums">{fmt(p.total)}</div>
                    </div>
                  )
                })}
              </div>
            ) : <EmptyChart label="No sales yet" />}
          </Card>

          {/* Low stock alerts */}
          <Card className="bg-slate-900/60 border border-slate-800 rounded-xl p-4">
            <SectionHeading icon={AlertTriangle} title={t('reports.lowStock')} badge={data.lowStock.length > 0 ? `${data.lowStock.length} items` : undefined} />
            {data.lowStock.length > 0 ? (
              <div className="space-y-2 max-h-48 overflow-y-auto pos-scroll">
                {data.lowStock.map((p) => {
                  const severity = p.stock === 0 ? 'critical' : p.stock <= p.threshold / 2 ? 'high' : 'low'
                  return (
                    <div key={p.id} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          severity === 'critical' ? 'bg-red-500' : severity === 'high' ? 'bg-amber-500' : 'bg-slate-500'
                        }`} />
                        <div className="min-w-0">
                          <div className="text-sm font-medium truncate">{p.name}</div>
                          <div className="text-[10px] text-slate-500">Threshold: {p.threshold}</div>
                        </div>
                      </div>
                      <Badge variant="outline" className={`text-[10px] shrink-0 ${
                        severity === 'critical'
                          ? 'bg-red-500/15 text-red-300 border-red-500/30'
                          : 'bg-amber-500/10 text-amber-300 border-amber-500/25'
                      }`}>{p.stock} left</Badge>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-center py-8 text-emerald-400">
                <PackageX className="w-8 h-8 mb-1" />
                <p className="text-xs text-slate-400">All products well stocked</p>
              </div>
            )}
          </Card>
        </div>

        {/* Reports / export */}
        <Card className="bg-slate-900/60 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 pt-5 pb-0">
            <h3 className="flex items-center gap-2 text-lg font-semibold text-slate-100">
              <FileBarChart className="w-5 h-5 text-teal-400" /> {t('app.reports')}
            </h3>
            <p className="text-slate-500 text-xs">Pick a date range, then export a report.</p>
          </div>
          <div className="px-5 py-5 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
              <div className="space-y-1.5">
                <Label htmlFor="from" className="text-xs text-slate-400">From</Label>
                <Input id="from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="bg-slate-950 border-slate-700 text-slate-200" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="to" className="text-xs text-slate-400">To</Label>
                <Input id="to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="bg-slate-950 border-slate-700 text-slate-200" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => handleExport('sales')}
                className="group flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left hover:border-teal-500/50 hover:bg-teal-500/5 transition-colors"
              >
                <span className="w-9 h-9 rounded-lg bg-teal-500/10 text-teal-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Download className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-200">{t('reports.exportSales')}</span>
                  <span className="block text-[10px] text-slate-500 truncate">Invoices & revenue</span>
                </span>
              </button>
              <button
                onClick={() => handleExport('stock')}
                className="group flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left hover:border-teal-500/50 hover:bg-teal-500/5 transition-colors"
              >
                <span className="w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Package className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-200">Export Stock</span>
                  <span className="block text-[10px] text-slate-500 truncate">Levels & thresholds</span>
                </span>
              </button>
              <button
                onClick={() => handleExport('cash')}
                className="group flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-left hover:border-teal-500/50 hover:bg-teal-500/5 transition-colors"
              >
                <span className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Wallet className="w-4 h-4" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-200">Export Cash</span>
                  <span className="block text-[10px] text-slate-500 truncate">Cash movements</span>
                </span>
              </button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}