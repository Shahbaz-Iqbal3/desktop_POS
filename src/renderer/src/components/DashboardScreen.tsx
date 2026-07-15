import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { BarChart3, TrendingUp, Wallet, CreditCard, Tag, PackageX } from 'lucide-react'
import {
  Card, CardContent
} from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

type Dashboard = {
  todaySales: { total: number; count: number }
  cashDigitalSplit: { cash: number; digital: number }
  bestCategory: { name: string; total: number } | null
  lowStock: Array<{ id: string; name: string; stock: number; threshold: number }>
}

const fmt = (n: number) => `Rs ${n.toFixed(2)}`

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
    return (
      <div className="min-h-full flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-400 text-sm">{t('common.loading')}</p>
        </div>
      </div>
    )
  }

  const cashPct = data.cashDigitalSplit.cash + data.cashDigitalSplit.digital > 0
    ? (data.cashDigitalSplit.cash / (data.cashDigitalSplit.cash + data.cashDigitalSplit.digital)) * 100
    : 0
  const digitalPct = 100 - cashPct

  return (
    <div className="min-h-full bg-slate-950 text-slate-100 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <BarChart3 className="w-5 h-5 text-teal-400" />
        <h1 className="text-lg font-semibold">{t('app.dashboard')}</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Today sales */}
        <Card className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 gap-0 shadow-none">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="w-4 h-4 text-teal-400" />
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{t('reports.todaySales')}</div>
            </div>
            <div className="text-teal-400 font-bold text-2xl leading-none tabular-nums">{fmt(data.todaySales.total)}</div>
            <div className="text-slate-400 text-xs mt-2">
              {data.todaySales.count} {t('reports.count')}
            </div>
          </CardContent>
        </Card>

        {/* Cash / digital split */}
        <Card className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 gap-0 shadow-none">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 mb-3">
              <Wallet className="w-4 h-4 text-teal-400" />
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{t('reports.cashDigital')}</div>
            </div>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="flex items-center gap-1 text-slate-400"><Wallet className="w-3 h-3" /> Cash</span>
                  <span className="text-slate-300 tabular-nums">{fmt(data.cashDigitalSplit.cash)}</span>
                </div>
                <Progress value={cashPct} className="bg-slate-800 [&>div]:bg-teal-400" />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="flex items-center gap-1 text-slate-400"><CreditCard className="w-3 h-3" /> Digital</span>
                  <span className="text-slate-300 tabular-nums">{fmt(data.cashDigitalSplit.digital)}</span>
                </div>
                <Progress value={digitalPct} className="bg-slate-800 [&>div]:bg-emerald-400" />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Best category */}
        <Card className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 gap-0 shadow-none">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 mb-3">
              <Tag className="w-4 h-4 text-teal-400" />
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{t('reports.bestCategory')}</div>
            </div>
            {data.bestCategory ? (
              <>
                <div className="text-teal-400 font-bold text-xl leading-tight">{data.bestCategory.name}</div>
                <div className="text-slate-400 text-xs mt-2 tabular-nums">{fmt(data.bestCategory.total)}</div>
              </>
            ) : (
              <div className="text-slate-400 text-xs">{t('reports.noSales')}</div>
            )}
          </CardContent>
        </Card>

        {/* Low stock */}
        <Card className="bg-slate-900/60 border border-slate-800 rounded-lg p-4 gap-0 shadow-none">
          <CardContent className="p-0">
            <div className="flex items-center gap-2 mb-3">
              <PackageX className="w-4 h-4 text-amber-400" />
              <div className="text-[11px] uppercase tracking-wider text-slate-500">{t('reports.lowStock')}</div>
            </div>
            {data.lowStock.length === 0 ? (
              <div className="text-slate-400 text-xs">{t('reports.noLowStock')}</div>
            ) : (
              <ScrollArea className="h-[120px] pr-2">
                <div className="space-y-1.5">
                  {data.lowStock.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-2">
                      <span className="text-slate-300 text-xs truncate">{p.name}</span>
                      <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px] tabular-nums shrink-0">
                        {p.stock}
                      </Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
