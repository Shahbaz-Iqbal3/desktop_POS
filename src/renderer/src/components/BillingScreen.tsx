import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, X, Plus, Minus, ScanLine, ShoppingCart, Pause, Play, Trash2,
  Wallet, DollarSign, RotateCcw, CheckCircle2, Package
} from 'lucide-react'
import { useBilling } from '../hooks/useBilling'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import { ShiftModal } from './ShiftModal'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { ScrollArea } from '@/components/ui/scroll-area'
import type { useToasts } from '../hooks/useToasts'

type Toasts = ReturnType<typeof useToasts>

const CURRENCY = 'Rs'
const fmt = (n: number) => `${CURRENCY} ${n.toFixed(2)}`

export function BillingScreen({ toasts }: { toasts: Toasts }) {
  const { t } = useTranslation()
  const billing = useBilling(toasts)
  const [shiftModalOpen, setShiftModalOpen] = useState(false)
  const autoOpenedRef = useRef(false)
  const [heldModalOpen, setHeldModalOpen] = useState(false)
  const [holdModalOpen, setHoldModalOpen] = useState(false)
  const [holdLabel, setHoldLabel] = useState('')
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  // Barcode scan handler — looks up product by barcode, adds to cart
  const handleScan = useCallback(
    (code: string) => {
      const match = billing.products.find((p) => p.barcode === code)
      if (match) {
        billing.addToCart(match)
        toasts.success(`Scanned: ${match.name}`)
      } else {
        toasts.error(`No product with barcode ${code}`)
      }
    },
    [billing.products, billing.addToCart, toasts]
  )

  useBarcodeScanner(billing.settings.barcodeEnabled === 'true', handleScan)

  // If till reconciliation is on and there is NO open shift, prompt to open one.
  // Gated on `shiftResolved` (set only after the shift query completes) so the
  // dialog doesn't flash open while getOpenShift() is still pending — and only
  // auto-open once per visit.
  useEffect(() => {
    if (
      !autoOpenedRef.current &&
      billing.shiftResolved &&
      billing.settings.tillReconciliationEnabled === 'true' &&
      !billing.openShiftId
    ) {
      autoOpenedRef.current = true
      setShiftModalOpen(true)
    }
  }, [billing.shiftResolved, billing.settings.tillReconciliationEnabled, billing.openShiftId])

  // '/' focuses search
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') setSearch('')
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [])

  const filtered = billing.products.filter((p) => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      p.name.toLowerCase().includes(q) ||
      (p.sku?.toLowerCase().includes(q) ?? false) ||
      (p.barcode?.toLowerCase().includes(q) ?? false)
    )
  })

  const stockClass = (qty: number, threshold = 5) =>
    qty <= 0 ? 'out' : qty <= threshold ? 'low' : 'ok'

  return (
    <div className="flex h-full min-h-0">
      {/* ===== LEFT: items ===== */}
      <div className="flex-1 flex flex-col border-r border-slate-800 min-w-0">
        <div className="border-b border-slate-800 bg-slate-900/40 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('billing.allItems') + ' — search by name, SKU, barcode…  (press /)'}
                className="pl-9 bg-slate-950 border-slate-700 text-sm h-9"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {billing.settings.barcodeEnabled === 'true' && (
              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pos-pulse" />
                <ScanLine className="w-3 h-3" /> Scanner
              </Badge>
            )}
          </div>

          {/* Category bar */}
          <div className="flex items-center gap-1.5 overflow-x-auto pos-scroll-hide pb-1">
            <button
              onClick={() => billing.setActiveCategory(null)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                billing.activeCategory === null
                  ? 'bg-teal-500 text-teal-950'
                  : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {t('billing.allItems')}
            </button>
            {billing.categories.map((c) => (
              <button
                key={c.id}
                onClick={() => billing.setActiveCategory(c.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  billing.activeCategory === c.id
                    ? 'bg-teal-500 text-teal-950'
                    : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        {/* Items grid */}
        <ScrollArea className="flex-1 pos-scroll">
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
            {filtered.map((p) => {
              const stock = billing.stockMap[p.id] ?? 0
              return (
                <button
                  key={p.id}
                  onClick={() => billing.addToCart(p)}
                  disabled={stock <= 0}
                  className="group relative text-left p-3 rounded-lg border border-slate-800 bg-slate-900/60 hover:border-teal-500/50 hover:bg-slate-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className={`px-1.5 py-0.5 rounded text-[9px] border ${
                      p.categoryId
                        ? 'bg-slate-700/40 text-slate-300 border-slate-600'
                        : 'bg-slate-700/40 text-slate-300 border-slate-600'
                    }`}>
                      {billing.categories.find((c) => c.id === p.categoryId)?.name || '—'}
                    </span>
                    {stockClass(stock, p.lowStockThreshold) === 'out' ? (
                      <Badge variant="outline" className="bg-red-500/15 text-red-300 border-red-500/30 text-[10px]">Out</Badge>
                    ) : stockClass(stock, p.lowStockThreshold) === 'low' ? (
                      <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px]">Low · {stock}</Badge>
                    ) : (
                      <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">{stock}</Badge>
                    )}
                  </div>
                  <div className="font-medium text-sm leading-tight mb-1 line-clamp-2 min-h-[2.5rem]">{p.name}</div>
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-teal-400 font-bold text-base leading-none">{fmt(p.defaultPrice)}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{p.unitType === 'thaan' ? 'per meter' : 'per piece'}</div>
                    </div>
                    <div className="w-7 h-7 rounded-md bg-slate-800 group-hover:bg-teal-500 group-hover:text-teal-950 flex items-center justify-center transition-colors">
                      <Plus className="w-4 h-4" />
                    </div>
                  </div>
                  {p.barcode && (
                    <div className="mt-1.5 pt-1.5 border-t border-slate-800 text-[9px] text-slate-600 font-mono truncate">{p.barcode}</div>
                  )}
                </button>
              )
            })}
            {filtered.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-500">
                <Package className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">No products match your search</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* ===== RIGHT: cart ===== */}
      <aside className="w-[380px] flex flex-col bg-slate-900/40 min-w-0">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-teal-400" />
            <h2 className="text-sm font-semibold">{t('billing.cart')}</h2>
            <Badge variant="outline" className="text-[10px]">{billing.cart.length}</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-400" onClick={() => setHoldModalOpen(true)} title={t('billing.hold')}>
              <Pause className="w-3.5 h-3.5" /> {t('billing.hold')}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-400" onClick={() => setHeldModalOpen(true)} title={t('billing.heldCarts')}>
              <Play className="w-3.5 h-3.5" /> {t('billing.heldCarts')}
            </Button>
            {billing.cart.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-400" onClick={billing.clearCart}>
                <Trash2 className="w-3.5 h-3.5" /> {t('billing.clearCart')}
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 pos-scroll overflow-y-scroll">
          <div className="p-2 space-y-2">
            {billing.cart.map((line) => (
              <div
                key={line.productId}
                className="pos-cart-add p-2.5 rounded-lg border border-slate-800 bg-slate-950/60"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="font-medium text-sm leading-tight flex-1">{line.name}</div>
                  <button onClick={() => billing.removeFromCart(line.productId)} className="text-slate-600 hover:text-red-400">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center border border-slate-700 rounded-md">
                    <button className="px-1.5 py-0.5 text-slate-400 hover:text-teal-400" onClick={() => billing.updateLine(line.productId, { quantity: Math.max(1, line.quantity - 1) })}>
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="px-2 text-xs font-mono font-medium min-w-[2.5rem] text-center">
                      {line.quantity}{line.unitType === 'thaan' ? 'm' : '×'}
                    </span>
                    <button className="px-1.5 py-0.5 text-slate-400 hover:text-teal-400" onClick={() => billing.updateLine(line.productId, { quantity: Math.min(line.stock, line.quantity + 1) })}>
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="flex-1 relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">{CURRENCY}</span>
                    <Input
                      type="number" step="0.01" value={line.price}
                      onChange={(e) => billing.updateLine(line.productId, { price: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs pl-9 bg-slate-900 border-slate-700"
                    />
                  </div>
                </div>

                {line.unitType === 'thaan' && (
                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-[10px] text-slate-500 w-20">{t('billing.cutLength')}</Label>
                    <Input
                      type="number" step="0.1" value={line.cutLength ?? ''}
                      onChange={(e) => billing.updateLine(line.productId, { cutLength: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs w-24 bg-slate-900 border-slate-700"
                    />
                  </div>
                )}

                <div className="flex items-center gap-2 mb-2">
                  <Label className="text-[10px] text-slate-500 w-20">{t('billing.discount')}</Label>
                  <Input
                    type="number" step="1" min="0" max="100" value={line.discount ?? 0}
                    onChange={(e) => billing.updateLine(line.productId, { discount: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                    className="h-7 text-xs w-24 bg-slate-900 border-slate-700"
                  />
                </div>

                <div className="flex items-center justify-between pt-1.5 border-t border-slate-800">
                  <span className="text-[10px] text-slate-500">{t('billing.stock')}: {line.stock}</span>
                  <span className="font-bold text-teal-400 text-sm">{fmt(line.lineTotal)}</span>
                </div>
              </div>
            ))}
            {billing.cart.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-slate-500 text-center px-4">
                <div className="w-16 h-16 rounded-full bg-slate-800/50 flex items-center justify-center mb-3">
                  <ShoppingCart className="w-7 h-7 opacity-50" />
                </div>
                <p className="text-sm font-medium mb-1">Cart is empty</p>
                <p className="text-xs text-slate-600">Tap products on the left to add them</p>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Totals + actions */}
        {billing.cart.length > 0 && (
          <div className="border-t border-slate-800 p-3 space-y-3 bg-slate-900/60 fixed bottom-0 w-[380px]  z-10 backdrop-blur-sm">
            <div className="space-y-1 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">{t('billing.subtotal')}</span>
                <span className="font-medium tabular-nums">{fmt(billing.subtotal)}</span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-sm font-semibold text-slate-300">{t('billing.total')}</span>
              <span className="text-2xl font-bold text-teal-400 tabular-nums">{fmt(billing.subtotal)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={billing.paymentMethod === 'cash' ? 'default' : 'outline'}
                className={`h-9 text-xs ${billing.paymentMethod === 'cash' ? 'bg-teal-500 text-teal-950 hover:bg-teal-400' : 'border-slate-700 text-slate-300'}`}
                onClick={() => billing.setPaymentMethod('cash')}
              >
                <Wallet className="w-3.5 h-3.5 mr-1" /> {t('billing.cash')}
              </Button>
              <Button
                variant={billing.paymentMethod === 'digital' ? 'default' : 'outline'}
                className={`h-9 text-xs ${billing.paymentMethod === 'digital' ? 'bg-teal-500 text-teal-950 hover:bg-teal-400' : 'border-slate-700 text-slate-300'}`}
                onClick={() => billing.setPaymentMethod('digital')}
              >
                <DollarSign className="w-3.5 h-3.5 mr-1" /> {t('billing.digital')}
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-[10px] text-slate-500 w-12">{t('billing.paid')}</Label>
              <Input
                type="number" step="0.01"
                placeholder={billing.subtotal.toFixed(2)}
                value={billing.paidAmount}
                onChange={(e) => billing.setPaidAmount(e.target.value)}
                className="h-8 text-xs bg-slate-950 border-slate-700"
              />
              {billing.paidAmount && parseFloat(billing.paidAmount) > billing.subtotal && (
                <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px] whitespace-nowrap">
                  Change: {fmt(parseFloat(billing.paidAmount) - billing.subtotal)}
                </Badge>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={billing.confirmSale}
                disabled={billing.submitting || billing.cart.length === 0}
                className="flex-1 h-11 bg-teal-500 text-teal-950 hover:bg-teal-400 font-semibold text-sm pos-glow"
              >
                {billing.submitting ? (
                  <><RotateCcw className="w-4 h-4 mr-2 animate-spin" /> {t('billing.confirming')}</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4 mr-2" /> {t('billing.confirm')}</>
                )}
              </Button>
              <Button variant="outline" className="h-11 px-3 border-slate-700 text-slate-300" onClick={billing.reprintLast} title={t('billing.reprint')}>
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </aside>

      {/* ===== Modals ===== */}
      {shiftModalOpen && billing.settings.tillReconciliationEnabled === 'true' && (
        <ShiftModal
          mode="open"
          tillId={billing.settings.currentTillId}
          onClose={() => setShiftModalOpen(false)}
          onDone={async () => {
            await billing.refreshOpenShift()
            setShiftModalOpen(false)
          }}
          toasts={toasts}
        />
      )}

      <Dialog open={holdModalOpen} onOpenChange={setHoldModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pause className="w-4 h-4 text-teal-400" /> {t('billing.holdTitle')}</DialogTitle>
            <DialogDescription className="text-slate-400">Park the current sale to serve another customer.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>{t('billing.holdLabel')}</Label>
            <Input
              value={holdLabel}
              onChange={(e) => setHoldLabel(e.target.value)}
              placeholder="e.g. Customer waiting for tailoring"
              autoFocus
              className="bg-slate-950 border-slate-700"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHoldModalOpen(false)} className="border-slate-700">{t('common.cancel')}</Button>
            <Button
              className="bg-teal-500 text-teal-950 hover:bg-teal-400"
              onClick={async () => {
                const ok = await billing.holdCurrentCart(holdLabel)
                if (ok) {
                  toasts.success(t('billing.cartHeld'))
                  setHoldLabel('')
                  setHoldModalOpen(false)
                }
              }}
            >
              {t('billing.hold')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={heldModalOpen} onOpenChange={setHeldModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Play className="w-4 h-4 text-teal-400" /> {t('billing.heldCarts')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-72 overflow-y-auto pos-scroll">
            {billing.heldCarts.length === 0 ? (
              <p className="text-xs text-slate-600 py-4 text-center">{t('billing.noHeldCarts')}</p>
            ) : billing.heldCarts.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-800 bg-slate-950/60">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{c.label || t('billing.hold')}</div>
                  <div className="text-[10px] text-slate-500">{c.items.length} {t('billing.qty')} · {fmt(c.total)} · {new Date(c.heldAt).toLocaleString()}</div>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-teal-400" onClick={async () => {
                    const ok = await billing.recallHeldCart(c.id)
                    if (ok) { toasts.success(t('billing.cartRecalled')); setHeldModalOpen(false) }
                  }}><Play className="w-3.5 h-3.5" /></Button>
                  <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400" onClick={() => billing.deleteHeldCart(c.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHeldModalOpen(false)} className="border-slate-700">{t('common.close')}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
