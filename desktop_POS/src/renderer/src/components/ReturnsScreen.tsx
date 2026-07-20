import { useEffect, useMemo, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { History, Search, Star, StarOff, RotateCcw, Download, ChevronLeft, ChevronRight, AlertTriangle, Receipt, Printer } from 'lucide-react'
import type { useToasts } from '../hooks/useToasts'
import type { Sale, SaleItem, SaleReturn } from '@shared/types'
import { computeLineTotal, round } from '@shared/pure'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { PrintPreviewDialog } from './PrintPreviewDialog'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'

type Toasts = ReturnType<typeof useToasts>

const PAGE_SIZE = 25

// Safe money formatter — never throws on undefined/null.
const money = (n: unknown) => `Rs ${(Number(n ?? 0) || 0).toFixed(2)}`

// Safe id shortener.
const shortId = (id?: string | null) => (id ?? '').slice(0, 8).toUpperCase()

// Safe date formatter.
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleString() : '—')

// Ensure `items` is an array (defends against a stored JSON string or missing field).
function ensureItems(items: unknown): SaleItem[] {
  if (Array.isArray(items)) return items as SaleItem[]
  if (typeof items === 'string') {
    try {
      const parsed = JSON.parse(items)
      return Array.isArray(parsed) ? (parsed as SaleItem[]) : []
    } catch {
      return []
    }
  }
  return []
}

export function ReturnsScreen({ toasts }: { toasts: Toasts }) {
  const { t } = useTranslation()
  const [range, setRange] = useState<'all' | 'today' | '7d' | '30d'>('today')
  const [payment, setPayment] = useState<'all' | 'cash' | 'digital'>('all')
  const [search, setSearch] = useState('')
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false)
  const [page, setPage] = useState(0)
  const [sales, setSales] = useState<Sale[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(false)
  const [returns, setReturns] = useState<SaleReturn[]>([])
  const [settings, setSettings] = useState<Record<string, string>>({})

  // Dialog state
  const [viewSale, setViewSale] = useState<Sale | null>(null)
  const [receiptLogo, setReceiptLogo] = useState<string | null>(null)
  const [returnTarget, setReturnTarget] = useState<Sale | null>(null)
  const [refundQty, setRefundQty] = useState<Record<number, number>>({})
  const [refundedByProduct, setRefundedByProduct] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [completedReturn, setCompletedReturn] = useState<SaleReturn | null>(null)
  const [refundLogo, setRefundLogo] = useState<string | null>(null)

  const buildQuery = useCallback(() => ({
    range,
    payment,
    search: search.trim(),
    bookmarkedOnly,
    offset: page * PAGE_SIZE,
    limit: PAGE_SIZE
  }), [range, payment, search, bookmarkedOnly, page])

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const s = await window.pos.getSettings()
      setSettings(s)
      const q = buildQuery()
      const [sl, count, rt] = await Promise.all([
        window.pos.getSales(q),
        window.pos.getSalesCount(q),
        window.pos.getReturns(200)
      ])
      setSales(sl.map((sale) => ({ ...sale, items: ensureItems(sale.items) })))
      setTotal(count)
      setReturns(rt.map((r) => ({ ...r, items: ensureItems(r.items) })))
    } finally {
      setLoading(false)
    }
  }, [buildQuery])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const toggleBookmark = async (s: Sale) => {
    await window.pos.setSaleBookmarked(s.id, !s.bookmarked)
    await refresh()
  }

  const filteredQuery = buildQuery()

  const viewReceipt = async (s: Sale) => {
    const sale = await window.pos.getSale(s.id)
    if (!sale) { toasts.error(t('returns.noSales')); return }
    try {
      const fn = window.pos.getReceiptLogo
      const logo = fn ? await fn().catch(() => null) : null
      setReceiptLogo(logo ?? null)
    } catch { setReceiptLogo(null) }
    setViewSale(sale)
  }

  // ----- Refund flow -----
  const openReturn = async (s: Sale) => {
    setReturnTarget(s)
    // Ask the backend for the authoritative per-product refunded quantities so
    // the UI reflects any refund for this sale (even from another session).
    let refunded: Record<string, number> = {}
    try {
      refunded = (await window.pos.getRefundedForSale(s.id)) ?? {}
    } catch {
      refunded = {}
    }
    setRefundedByProduct(refunded)
    const maxByIndex = returnableByIndex(s, refunded)
    const q: Record<number, number> = {}
    s.items.forEach((_, i) => {
      q[i] = Math.max(0, Math.min(maxByIndex[i], refundQty[i] ?? 0))
    })
    setRefundQty(q)
  }

  // For a single product that appears on multiple lines of a sale, distribute the
  // returned quantity across lines in order so the earliest lines are marked
  // returned first. Returns a per-line max keyed by line index. The refunded map
  // is passed in explicitly so the dialog can use the authoritative backend value.
  const returnableByIndex = useCallback((sale: Sale, refunded: Record<string, number>) => {
    const result: Record<number, number> = {}
    const remaining: Record<string, number> = {}
    sale.items.forEach((it, i) => {
      const totalReturned = refunded[it.productId] ?? 0
      const consumed = remaining[it.productId] ?? 0
      const returnedForThisLine = Math.min(it.quantity, Math.max(0, totalReturned - consumed))
      remaining[it.productId] = consumed + returnedForThisLine
      result[i] = Math.max(0, it.quantity - returnedForThisLine)
    })
    return result
  }, [])

  const refundedItems: SaleItem[] = useMemo(() => {
    if (!returnTarget) return []
    const maxByIndex = returnableByIndex(returnTarget, refundedByProduct)
    return returnTarget.items
      .map((it, i) => {
        const max = maxByIndex[i]
        const qty = Math.max(0, Math.min(max, refundQty[i] ?? 0))
        return { ...it, quantity: qty }
      })
      .filter((it) => it.quantity > 0)
  }, [returnTarget, refundQty, refundedByProduct, returnableByIndex])

  const refundTotal = useMemo(
    () => round(refundedItems.reduce((sum, it) => sum + computeLineTotal(it.price, it.quantity, it.discount, it.unitType === 'thaan' ? it.cutLength : undefined), 0)),
    [refundedItems]
  )

  const confirmRefund = async () => {
    if (!returnTarget || refundedItems.length === 0) {
      toasts.error(t('history.nothingToRefund'))
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
        saleId: returnTarget.id,
        branchId,
        tillId,
        shiftId: openShift?.id ?? null,
        items: refundedItems,
        total: refundTotal,
        refundAmount: refundTotal,
        paymentMethod: returnTarget.paymentMethod
      })
      if (settings.confirmSaleBeforePrint === 'true') {
        try {
          const fn = window.pos.getReceiptLogo
          const logo = fn ? await fn() : null
          setRefundLogo(logo ?? null)
        } catch { setRefundLogo(null) }
        setCompletedReturn(ret)
      } else {
        await printRefund(ret)
      }
      setReturnTarget(null)
      setConfirmOpen(false)
      // Refresh the authoritative refunded map for this sale so the table badge
      // and any reopened dialog reflect the new refund immediately.
      try {
        const updated = await window.pos.getRefundedForSale(returnTarget.id)
        setRefundedByProduct((prev) => ({ ...prev, ...(updated ?? {}) }))
      } catch { /* ignore — refresh() below reloads the list */ }
      await refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toasts.error(msg)
      // Over-refund / nothing-left guard: close the dialogs so the user can't get stuck.
      if (/fully refunded|sale not found/i.test(msg)) {
        setReturnTarget(null)
        setConfirmOpen(false)
      }
    } finally {
      setSubmitting(false)
    }
  }

  const printRefund = async (ret: SaleReturn) => {
    const printResult = await window.pos.printRefund(ret)
    if (!printResult.ok) toasts.warning(`Refund saved — receipt not printed: ${printResult.error}`)
    else toasts.success(t('history.refundDone'))
  }

  const saleChange = (s: Sale) => Math.max(0, round(s.actualPaidPrice - s.total))

  // ----- Sale detail (View History) -----
  const linkedReturns = (saleId: string): SaleReturn[] =>
    returns.filter((r) => r.saleId === saleId)

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      <div className="border-b border-slate-800 bg-slate-900/40 px-4 py-2.5 shrink-0">
        <div className="flex items-center gap-2 mb-2.5">
          <History className="w-5 h-5 text-teal-400" />
          <h2 className="text-base font-semibold">{t('history.title')}</h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[160px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0) }}
              placeholder={t('returns.search')}
              className="pl-9 bg-slate-950 border-slate-700 text-sm h-9"
            />
          </div>

          <div className="flex gap-0.5 bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            {(['all', 'today', '7d', '30d'] as const).map((r) => (
              <button
                key={r}
                onClick={() => { setRange(r); setPage(0) }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${range === r ? 'bg-teal-500 text-teal-950' : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                {t(`history.range.${r === '7d' ? 'week' : r === '30d' ? 'month' : r}`)}
              </button>
            ))}
          </div>

          <div className="flex gap-0.5 bg-slate-900 rounded-lg p-0.5 border border-slate-800">
            {(['all', 'cash', 'digital'] as const).map((p) => (
              <button
                key={p}
                onClick={() => { setPayment(p); setPage(0) }}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${payment === p ? 'bg-teal-500 text-teal-950' : 'text-slate-400 hover:text-slate-200'
                  }`}
              >
                {t(`history.payment.${p === 'digital' ? 'card' : p}`)}
              </button>
            ))}
          </div>

          <button
            onClick={() => { setBookmarkedOnly((v) => !v); setPage(0) }}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all border border-slate-800 ${
              bookmarkedOnly ? 'bg-amber-500 text-amber-950 hover:bg-amber-400' : 'bg-slate-900 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Star className="w-3.5 h-3.5" /> {t('history.bookmark')}
          </button>

          <button
            onClick={async () => {
              const res = await window.pos.exportSalesCsv(filteredQuery)
              if (res.ok) toasts.success(`CSV saved: ${res.path}`)
              else if (res.error && res.error !== 'Export cancelled') toasts.error(res.error)
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-medium transition-all border border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
          >
            <Download className="w-3.5 h-3.5" /> {t('history.csv')}
          </button>
        </div>
      </div>

      {/* Sales table (flat list — no dropdown) */}
      <div className="flex-1 min-h-0 overflow-y-auto pos-scroll">
        {loading && sales.length === 0 ? (
          <div className="h-full flex items-center justify-center text-slate-500">
            <div className="w-8 h-8 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
          </div>
        ) : sales.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-500">
            <Receipt className="w-10 h-10 mb-2 opacity-40" />
            <p className="text-sm">{t('returns.noSales')}</p>
          </div>
        ) : (
          <div className="p-3">
            <div className="bg-slate-900/60 border border-slate-800 rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-slate-800">
                    <TableHead className="text-slate-400 font-medium w-9"></TableHead>
                    <TableHead className="text-slate-400 font-medium">{t('returns.originalSale')}</TableHead>
                    <TableHead className="text-slate-400 font-medium">{t('history.items')}</TableHead>
                    <TableHead className="text-slate-400 font-medium">{t('returns.saleTotal')}</TableHead>
                    <TableHead className="text-slate-400 font-medium">{t('billing.paymentMethod')}</TableHead>
                    <TableHead className="text-slate-400 font-medium text-right">{t('app.history')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sales.map((s) => {
                    const linked = linkedReturns(s.id)
                    const hasRefunds = linked.length > 0
                    return (
                      <TableRow key={s.id} className="hover:bg-slate-800/40 border-slate-800">
                        <TableCell>
                          <button onClick={() => toggleBookmark(s)} title={t('history.bookmark')} className="text-amber-400 hover:scale-110 transition-transform">
                            {s.bookmarked ? <Star className="w-4 h-4 fill-current" /> : <StarOff className="w-4 h-4 text-slate-500" />}
                          </button>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <span className="font-medium text-slate-200">#{shortId(s.id)}</span>
                            {hasRefunds && (
                              <Badge variant="outline" className="bg-emerald-900/30 text-emerald-300 border-emerald-800 text-[10px]">
                                {t('returns.returned')}
                              </Badge>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500">{fmtDate(s.createdAt)}</div>
                          {hasRefunds && (
                            <div className="text-[11px] text-emerald-400">
                              {t('returns.refundedItems')}: −{money(linked.reduce((sum, r) => sum + (r.refundAmount ?? r.total), 0))}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-slate-400 text-xs">{t('history.itemCount', { count: s.items.length })}</TableCell>
                        <TableCell className="text-slate-300 tabular-nums">{money(s.total)}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-slate-800/60 text-slate-300 border-slate-700 text-[10px]">
                            {s.paymentMethod === 'digital' ? t('history.payment.card') : t('history.payment.cash')}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1">
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-teal-300 bg-accent/20" onClick={() => viewReceipt(s)} title={t('history.viewReceipt')}>
                              <Printer className="w-3.5 h-3.5" /> {t('history.viewReceipt')}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-amber-300 bg-accent/20" onClick={() => openReturn(s)} title={t('history.addReturn')}>
                              <RotateCcw className="w-3.5 h-3.5" /> {t('history.addReturn')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>

      {/* Pagination */}
      <div className="border-t border-slate-800 px-4 py-2 flex items-center justify-between shrink-0 bg-slate-900/40">
        <div className="text-[11px] text-slate-500">
          {t('history.filteredTotal')}: <span className="text-slate-300 font-medium">{total}</span>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm" variant="outline" className="border-slate-700 text-slate-300 h-8"
            disabled={page <= 0 || loading}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </Button>
          <span className="text-xs text-slate-400 px-1">
            {t('history.page')} {page + 1} {t('history.of')} {pageCount}
          </span>
          <Button
            size="sm" variant="outline" className="border-slate-700 text-slate-300 h-8"
            disabled={page >= pageCount - 1 || loading}
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* View Receipt dialog */}
      <PrintPreviewDialog
        open={viewSale !== null}
        onOpenChange={(o) => { if (!o) { setViewSale(null); setReceiptLogo(null) } }}
        settings={settings}
        logo={receiptLogo}
        onPrint={async () => {
          if (!viewSale) return
          const result = await window.pos.printReceipt(viewSale)
          if (!result.ok) toasts.warning(t('billing.printFailed', { error: result.error ?? '' }))
          else toasts.success(t('billing.printSuccess'))
          setViewSale(null)
          setReceiptLogo(null)
        }}
      >
        {viewSale && (
          <>
            <div className="text-center">{new Date(viewSale.createdAt).toLocaleString()}</div>
            <div className="border-t border-dashed border-black my-1" />
            <div className="flex font-bold">
              <span className="flex-1">ITEM</span>
              <span className="w-12 text-right">QTY</span>
              <span className="w-16 text-right">PRICE</span>
            </div>
            <div className="border-t border-dashed border-black my-1" />
            {viewSale.items.map((it, i) => {
              const bill = it.unitType === 'thaan' ? it.cutLength : undefined
              const qtyLabel = it.unitType === 'thaan'
                ? `${it.cutLength ?? it.quantity}m`
                : `${it.quantity}x`
              const discAmount = it.discount && it.discount > 0
                ? round(computeLineTotal(it.price, it.quantity, 0, bill) - computeLineTotal(it.price, it.quantity, it.discount, bill))
                : 0
              return (
                <div key={i}>
                  <div className="flex">
                    <span className="flex-1 break-words">{it.name}</span>
                    <span className="w-12 text-right">{qtyLabel}</span>
                    <span className="w-16 text-right">{money(it.lineTotal)}</span>
                  </div>
                  {discAmount > 0 && (
                    <div className="flex">
                      <span className="flex-1 pl-2">Disc {it.discount}%</span>
                      <span className="w-12 text-right" />
                      <span className="w-16 text-right">- {money(discAmount)}</span>
                    </div>
                  )}
                </div>
              )
            })}
            <div className="border-t border-dashed border-black my-1" />
            <div className="flex">
              <span className="flex-1 text-right">SUBTOTAL:</span>
              <span className="w-16 text-right">{money(viewSale.total)}</span>
            </div>
            <div className="flex">
              <span className="flex-1 text-right">PAID ({viewSale.paymentMethod.toUpperCase()}):</span>
              <span className="w-16 text-right">{money(viewSale.actualPaidPrice)}</span>
            </div>
            <div className="flex">
              <span className="flex-1 text-right">CHANGE:</span>
              <span className="w-16 text-right">{money(saleChange(viewSale))}</span>
            </div>
            <div className="flex font-bold">
              <span className="flex-1 text-right">TOTAL:</span>
              <span className="w-16 text-right">{money(viewSale.total)}</span>
            </div>
            <div className="border-t border-dashed border-black my-1" />
            {settings.receiptFooter && <div className="text-center whitespace-pre-line">{settings.receiptFooter}</div>}
            <div className="text-center">Thank you for your business!</div>
            <div className="text-center">Visit us again</div>
          </>
        )}
      </PrintPreviewDialog>

      {/* Add Return dialog */}
      <Dialog open={returnTarget !== null} onOpenChange={(o) => { if (!o) setReturnTarget(null) }}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="w-4 h-4 text-amber-400" /> {t('history.addReturn')}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {t('history.originalSale')}:{' '}
              <span className="text-slate-200 font-medium">{returnTarget ? `#${shortId(returnTarget.id)}` : ''}</span> ·{' '}
              {returnTarget ? fmtDate(returnTarget.createdAt) : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2 max-h-[50vh] overflow-y-auto pos-scroll">
            {returnTarget && (() => {
              const maxByIndex = returnableByIndex(returnTarget, refundedByProduct)
              const allReturned = returnTarget.items.every((_, i) => maxByIndex[i] <= 0)
              return (
                <>
                  {returnTarget.items.map((it, i) => {
                    const max = maxByIndex[i]
                    const returned = it.quantity - max
                    const fullyReturned = max <= 0
                    return (
                      <div key={i} className={`grid grid-cols-[1fr_auto_auto] gap-3 items-center p-2.5 rounded-lg border bg-slate-950/60 ${fullyReturned ? 'border-emerald-800/50 opacity-70' : 'border-slate-800'}`}>
                        <div className="min-w-0">
                          <div className="font-medium text-sm text-slate-200 truncate">{it.name}</div>
                          <div className="text-xs text-slate-500">
                            {money(computeLineTotal(it.price, it.quantity, it.discount))} {it.unitType === 'thaan' ? 'per meter' : 'per piece'}
                          </div>
                          {returned > 0 && (
                            <div className="text-[11px] text-emerald-400">
                              {fullyReturned ? t('returns.fullyReturned') : t('returns.partiallyReturned', { returned })}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-slate-500 whitespace-nowrap">
                          / {it.quantity} {it.unitType === 'thaan' ? 'm' : 'pcs'}
                        </span>
                        <Input
                          type="number" min={0} max={max}
                          value={refundQty[i] ?? 0}
                          disabled={fullyReturned}
                          onChange={(e) => {
                            const v = Math.max(0, Math.min(max, parseInt(e.target.value, 10) || 0))
                            setRefundQty((prev) => ({ ...prev, [i]: v }))
                          }}
                          aria-label={t('history.refundQty')}
                          className="w-20 bg-slate-900 border-slate-700 text-sm tabular-nums disabled:opacity-50"
                        />
                      </div>
                    )
                  })}
                  {allReturned && (
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-emerald-800/50 bg-emerald-900/20 text-emerald-300 text-sm">
                      <RotateCcw className="w-4 h-4" />
                      {t('returns.fullyReturned')}
                    </div>
                  )}
                </>
              )
            })()}
          </div>

          <div className="border-t border-slate-800 pt-3 flex items-center justify-between">
            <span className="text-slate-400">{t('history.refundAmount')}</span>
            <span className="text-xl font-bold text-teal-400 tabular-nums">{money(refundTotal)}</span>
          </div>

          <DialogFooter>
            <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setReturnTarget(null)} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button className="bg-teal-500 text-teal-950 hover:bg-teal-400" onClick={() => setConfirmOpen(true)} disabled={submitting || refundedItems.length === 0}>
              {t('history.confirmRefund')}
            </Button>
            {!returnTarget?.items.some((_, i) => returnableByIndex(returnTarget, refundedByProduct)[i] > 0) && (
              <span className="text-xs text-emerald-400 mr-2">{t('returns.fullyReturned')}</span>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund confirm dialog */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" /> {t('history.confirmRefund')}
            </DialogTitle>
            <DialogDescription className="text-slate-400">
              {t('history.originalSale')}: {returnTarget ? `#${shortId(returnTarget.id)}` : ''} ·{' '}
              <span className="text-teal-400 font-medium">{money(refundTotal)}</span>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setConfirmOpen(false)} disabled={submitting}>
              {t('common.cancel')}
            </Button>
            <Button className="bg-teal-500 text-teal-950 hover:bg-teal-400" onClick={confirmRefund} disabled={submitting}>
              {submitting ? t('common.loading') : t('history.confirmRefund')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Refund receipt preview */}
      <PrintPreviewDialog
        open={completedReturn !== null}
        onOpenChange={(o) => { if (!o) { setCompletedReturn(null); setRefundLogo(null) } }}
        settings={settings}
        logo={refundLogo}
        onPrint={async () => {
          if (!completedReturn) return
          await printRefund(completedReturn)
          setCompletedReturn(null)
          setRefundLogo(null)
        }}
      >
        {completedReturn && (
          <>
            <div className="text-center font-bold">*** REFUND / RETURN ***</div>
            <div className="text-center">Date: {fmtDate(completedReturn.createdAt)}</div>
            <div className="text-center">Refund ID: {shortId(completedReturn.id)}</div>
            <div className="text-center">Orig Sale ID: {shortId(completedReturn.saleId)}</div>
            <div className="text-center">Payment: {completedReturn.paymentMethod.toUpperCase()}</div>
            <div className="border-t border-dashed border-black my-1" />
            <div className="flex font-bold">
              <span className="flex-1">RETURNED ITEM</span>
              <span className="w-12 text-right">QTY</span>
              <span className="w-16 text-right">TOTAL</span>
            </div>
            <div className="border-t border-dashed border-black my-1" />
            {ensureItems(completedReturn.items).map((it, i) => {
              const qtyLabel = it.unitType === 'thaan'
                ? `${it.quantity}m${it.cutLength ? ` (${it.cutLength}m)` : ''}`
                : `${it.quantity}x`
              return (
                <div key={i} className="flex">
                  <span className="flex-1 break-words">{it.name}</span>
                  <span className="w-12 text-right">{qtyLabel}</span>
                  <span className="w-16 text-right">{money(it.lineTotal)}</span>
                </div>
              )
            })}
            <div className="border-t border-dashed border-black my-1" />
            <div className="flex font-bold">
              <span className="flex-1 text-right">TOTAL REFUNDED:</span>
              <span className="w-16 text-right">{money(completedReturn.refundAmount)}</span>
            </div>
            <div className="border-t border-dashed border-black my-1" />
            <div className="text-center">Sorry for the inconvenience!</div>
          </>
        )}
      </PrintPreviewDialog>
    </div>
  )
}
