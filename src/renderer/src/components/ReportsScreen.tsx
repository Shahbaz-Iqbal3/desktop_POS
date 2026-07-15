import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FileBarChart, Download, Package, Wallet } from 'lucide-react'
import type { useToasts } from '../hooks/useToasts'
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

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
    <div className="h-full overflow-y-auto pos-scroll p-4">
      <Card className="bg-slate-900/60 border border-slate-800 rounded-lg text-slate-200">
        <CardHeader className="px-5 pt-5 pb-0">
          <CardTitle className="flex items-center gap-2 text-lg font-semibold text-slate-100">
            <FileBarChart className="w-5 h-5 text-teal-400" />
            Reports
          </CardTitle>
          <CardDescription className="text-slate-500">
            Select a date range and export business reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="px-5 py-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-md">
            <div className="space-y-1.5">
              <Label htmlFor="from" className="text-xs text-slate-400">From</Label>
              <Input
                id="from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className="bg-slate-950 border-slate-700 text-slate-200"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="to" className="text-xs text-slate-400">To</Label>
              <Input
                id="to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className="bg-slate-950 border-slate-700 text-slate-200"
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              onClick={() => handleExport('sales')}
              className="bg-teal-500 text-teal-950 hover:bg-teal-400 font-medium"
            >
              <Download className="w-4 h-4" /> {t('reports.exportSales')}
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('stock')}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            >
              <Package className="w-4 h-4" /> Export Stock
            </Button>
            <Button
              variant="outline"
              onClick={() => handleExport('cash')}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-slate-100"
            >
              <Wallet className="w-4 h-4" /> Export Cash
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
