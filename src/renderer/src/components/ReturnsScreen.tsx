import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { RotateCcw, Search, Receipt, History, ArrowLeft, AlertTriangle } from 'lucide-react'
import type { useToasts } from '../hooks/useToasts'
import type { Sale, SaleItem } from '@shared/types'
import {
  Tabs, TabsList, TabsTrigger, TabsContent
} from '@/components/ui/tabs'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'

type Toasts = ReturnType<typeof useToasts>

type RefundQty = Record<number, number> // index in sale.items -> refund qty

export function ReturnsScreen({ toasts }: { toasts: Toasts }) {
  const { t } = useTranslation()
  const [view, setView] = useState<'sales' | 'history'>('sales')
  const [sales, setSales] = useState<Sale[]>([])
  const [returns, setReturns] = useState<import('@shared/types').SaleReturn[]>([])
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Sale | null>(null)
  const [refundQty, setRefundQty] = useState<RefundQty>({})
  const [submitting, setSubmitting] = useState(false)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [confirmOpen, setConfirmOpen] = useState(false)

  const refresh = async () => {
    const s = await window.pos.getSettings()
    setSettings(s)
    const [sl, rt] = await Promise.all([window.pos.getSales(200), window.pos.getReturns(100)])
    setSales(sl)
    setReturns(rt)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const filteredSales = useMemo(() => {
    if (!search.trim()) return sales
    const q = search.trim().toLowerCase()
    return sales.filter(
      (s) =>
        s.id.toLowerCase().includes(q) ||
        s.items.some((it) => it.name.toLowerCase().includes(q))
    )
  }, [sales, search])

  const openSale = (s: Sale) => {
    setSelected(s)
    const q: RefundQty = {}
    s.items.forEach((_, i) => (q[i] = 0))
    setRefundQty(q)
  }

  const refundedItems: SaleItem[] = useMemo(() => {
    if (!selected) return []
    return selected.items
      .map((it, i) => ({ ...it, quantity: refundQty[i] ?? 0 }))
      .filter((it) => it.quantity > 0)
  }, [selected, refundQty])

  const refundTotal = useMemo(
    () => Math.round(refundedItems.reduce((sum, it) => sum + it.lineTotal, 0) * 100) / 100,
    [refundedItems]
  )

  const confirmRefund = async () => {
    if (!selected || refundedItems.length === 0) {
      toasts.error(t('returns.nothingToRefund'))
      return
    }
    setSubmitting(true)
    try {
      const branchId = settings.currentBranchId || 'branch-default'
      const tillId = settings.currentTillId || 'till-1'
      const openShift = settings.tillReconciliationEnabled === 'true'
        ? await window.pos.getOpenShift(tillId)
        : null
      const ret = await window.pos.createReturn({
        saleId: selected.id,
        branchId,
        tillId,
        shiftId: openShift?.id ?? null,
        items: refundedItems,
        total: refundTotal,
        refundAmount: refundTotal,
        paymentMethod: selected.paymentMethod
      })
      const printResult = await window.pos.printRefund(ret)
      if (!printResult.ok) {
        toasts.error(`Print failed (refund saved): ${printResult.error}`)
      } else {
        toasts.success(t('returns.refundDone'))
      }
      setSelected(null)
      setConfirmOpen(false)
      await refresh()
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900/40 px-4 h-14 flex items-center gap-2 shrink-0">
        <RotateCcw className="w-5 h-5 text-teal-400" />
        <h2 className="text-base font-semibold">{t('returns.title')}</h2>
      </div>

      <Tabs
        value={view}
        onValueChange={(v) => setView(v as 'sales' | 'history')}
        className="flex-1 flex flex-col min-h-0"
      >
        <div className="px-4 pt-3 shrink-0">
          <TabsList className="bg-slate-900 border border-slate-800 p-1 w-full">
            <TabsTrigger
              value="sales"
              className="flex-1 data-[state=active]:bg-teal-500 data-[state=active]:text-teal-950 data-[state=active]:shadow-sm text-slate-400"
            >
              <Receipt className="w-4 h-4" /> {t('returns.sales')}
            </TabsTrigger>
            <TabsTrigger
              value="history"
              className="flex-1 data-[state=active]:bg-teal-500 data-[state=active]:text-teal-950 data-[state=active]:shadow-sm text-slate-400"
            >
              <History className="w-4 h-4" /> {t('returns.history')}
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="sales" className="flex-1 min-h-0 overflow-hidden">
          {!selected ? (
            <div className="h-full flex flex-col p-4 gap-3">
              <div className="relative shrink-0">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t('returns.search')}
                  className="pl-9 bg-slate-950 border-slate-700 text-sm h-9"
                />
              </div>

              {filteredSales.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-500">
                  <Receipt className="w-10 h-10 mb-2 opacity-40" />
                  <p className="text-sm">{t('returns.noSales')}</p>
                </div>
              ) : (
                <ScrollArea className="flex-1 pos-scroll">
                  <div className="bg-slate-900/60 border border-slate-800 rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent border-slate-800">
                          <TableHead className="text-slate-400 font-medium">{t('returns.originalSale')}</TableHead>
                          <TableHead className="text-slate-400 font-medium">{t('returns.saleTotal')}</TableHead>
                          <TableHead className="text-slate-400 font-medium">{t('billing.paymentMethod')}</TableHead>
                          <TableHead className="text-slate-400 font-medium text-right">—</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSales.map((s) => (
                          <TableRow key={s.id} className="hover:bg-slate-800/40 border-slate-800">
                            <TableCell>
                              <div className="font-medium text-slate-200">#{s.id.slice(0, 8).toUpperCase()}</div>
                              <div className="text-[11px] text-slate-500">
                                {new Date(s.createdAt).toLocaleString()}
                              </div>
                            </TableCell>
                            <TableCell className="text-slate-300 tabular-nums">Rs {s.total.toFixed(2)}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className="bg-slate-800/60 text-slate-300 border-slate-700 text-[10px]">
                                {s.paymentMethod}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-right">
                              <Button
                                size="sm"
                                className="h-8 bg-teal-500 text-teal-950 hover:bg-teal-400 text-xs"
                                onClick={() => openSale(s)}
                              >
                                {t('returns.selectSale')}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </ScrollArea>
              )}
            </div>
          ) : (
            <div className="h-full flex flex-col p-4 gap-3">
              <Button
                variant="ghost"
                className="self-start h-8 px-2 text-xs text-slate-400 hover:text-slate-200"
                onClick={() => setSelected(null)}
              >
                <ArrowLeft className="w-3.5 h-3.5" /> {t('returns.back')}
              </Button>

              <p className="text-slate-400 text-sm shrink-0">
                {t('returns.originalSale')}:{' '}
                <span className="text-slate-200 font-medium">#{selected.id.slice(0, 8).toUpperCase()}</span> ·{' '}
                {new Date(selected.createdAt).toLocaleString()}
              </p>

              <ScrollArea className="flex-1 pos-scroll">
                <div className="space-y-2">
                  {selected.items.map((it, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-[1fr_auto_auto] gap-3 items-center p-3 rounded-lg border border-slate-800 bg-slate-900/60"
                    >
                      <div className="min-w-0">
                        <div className="font-medium text-sm text-slate-200 truncate">{it.name}</div>
                        <div className="text-xs text-slate-500">
                          Rs {it.lineTotal.toFixed(2)} {it.unitType === 'thaan' ? 'per meter' : 'per piece'}
                        </div>
                      </div>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        / {it.quantity} {it.unitType === 'thaan' ? 'm' : 'pcs'}
                      </span>
                      <Input
                        type="number"
                        min={0}
                        max={it.quantity}
                        value={refundQty[i] ?? 0}
                        onChange={(e) => {
                          const v = Math.max(0, Math.min(it.quantity, parseInt(e.target.value, 10) || 0))
                          setRefundQty((prev) => ({ ...prev, [i]: v }))
                        }}
                        aria-label={t('returns.refundQty')}
                        className="w-20 bg-slate-950 border-slate-700 text-sm tabular-nums"
                      />
                    </div>
                  ))}
                </div>
              </ScrollArea>

              <div className="border-t border-slate-800 pt-3 flex items-center justify-between shrink-0">
                <span className="text-slate-400">{t('returns.refundAmount')}</span>
                <span className="text-xl font-bold text-teal-400 tabular-nums">Rs {refundTotal.toFixed(2)}</span>
              </div>

              <Button
                className="w-full h-11 bg-teal-500 text-teal-950 hover:bg-teal-400 font-semibold text-sm pos-glow"
                disabled={submitting || refundedItems.length === 0}
                onClick={() => setConfirmOpen(true)}
              >
                {submitting ? t('common.loading') : t('returns.confirmRefund')}
              </Button>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="flex-1 min-h-0 overflow-hidden">
          <div className="h-full p-4">
            {returns.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500">
                <History className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">{t('returns.noReturns')}</p>
              </div>
            ) : (
              <ScrollArea className="h-full pos-scroll">
                <div className="bg-slate-900/60 border border-slate-800 rounded-lg">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent border-slate-800">
                        <TableHead className="text-slate-400 font-medium">{t('returns.refundedItems')}</TableHead>
                        <TableHead className="text-slate-400 font-medium">{t('returns.refundAmount')}</TableHead>
                        <TableHead className="text-slate-400 font-medium">{t('billing.paymentMethod')}</TableHead>
                        <TableHead className="text-slate-400 font-medium">{t('returns.originalSale')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {returns.map((r) => (
                        <TableRow key={r.id} className="hover:bg-slate-800/40 border-slate-800">
                          <TableCell>
                            <div className="text-slate-200">{r.items.map((it) => `${it.quantity}x ${it.name}`).join(', ')}</div>
                            <div className="text-[11px] text-slate-500">
                              {new Date(r.createdAt).toLocaleString()}
                            </div>
                          </TableCell>
                          <TableCell className="text-emerald-400 font-medium tabular-nums">Rs {r.refundAmount.toFixed(2)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-slate-800/60 text-slate-300 border-slate-700 text-[10px]">
                              {r.paymentMethod}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-slate-300">#{r.saleId.slice(0, 8).toUpperCase()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            )}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> {t('returns.confirmRefund')}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {t('returns.originalSale')}: #{selected?.id.slice(0, 8).toUpperCase()} ·{' '}
              <span className="text-teal-400 font-medium">Rs {refundTotal.toFixed(2)}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              className="border-slate-700 text-slate-300"
              onClick={() => setConfirmOpen(false)}
              disabled={submitting}
            >
              {t('common.cancel')}
            </Button>
            <Button
              className="bg-teal-500 text-teal-950 hover:bg-teal-400"
              onClick={confirmRefund}
              disabled={submitting}
            >
              {submitting ? t('common.loading') : t('returns.confirmRefund')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
