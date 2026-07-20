import { useEffect, useState, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import {
  Search, X, Plus, Minus, ScanLine, ShoppingCart, Pause, Play, Trash2,
  Wallet, DollarSign, RotateCcw, CheckCircle2, Package
} from 'lucide-react'
import { useBilling } from '../hooks/useBilling'
import { useBarcodeScanner } from '../hooks/useBarcodeScanner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { PrintPreviewDialog } from './PrintPreviewDialog'
import type { useToasts } from '../hooks/useToasts'
import type { Sale } from '@shared/types'

type Toasts = ReturnType<typeof useToasts>

// Small square thumbnail: shows the product image when one is set, otherwise
// falls back to the first letter of its name (matches the inventory screen).
function ProductThumb({ product, className = '' }: { product: { id: string; name: string; imagePath?: string | null }; className?: string }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    if (!product.imagePath) { setUrl(null); return }
    window.pos.getProductImage(product.id).then((u) => { if (alive) setUrl(u ?? null) }).catch(() => {})
    return () => { alive = false }
  }, [product.id, product.imagePath])
  return (
    <span className={`flex items-center justify-center overflow-hidden rounded-md bg-slate-800 text-slate-400 ${className}`}>
      {url ? (
        <img src={url} alt={product.name} className="h-full w-full object-cover" />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" className="h-3/5 w-3/5" xmlns="http://www.w3.org/2000/svg">
          <path d="M3 7L6 4H9C9 4.39397 9.0776 4.78407 9.22836 5.14805C9.37913 5.51203 9.6001 5.84274 9.87868 6.12132C10.1573 6.3999 10.488 6.62087 10.8519 6.77164C11.2159 6.9224 11.606 7 12 7C12.394 7 12.7841 6.9224 13.1481 6.77164C13.512 6.62087 13.8427 6.3999 14.1213 6.12132C14.3999 5.84274 14.6209 5.51203 14.7716 5.14805C14.9224 4.78407 15 4.39397 15 4H18L21 7L20.5 12L18 10.5V20H6V10.5L3.5 12L3 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  )
}

const CURRENCY = 'Rs'
const fmt = (n: number) => `${CURRENCY} ${n.toFixed(2)}`

export function BillingScreen({ toasts }: { toasts: Toasts }) {
  const { t } = useTranslation()
  const billing = useBilling(toasts)
  const [heldModalOpen, setHeldModalOpen] = useState(false)
  const [holdModalOpen, setHoldModalOpen] = useState(false)
  const [holdLabel, setHoldLabel] = useState('')
  const [search, setSearch] = useState('')
  const [completedSale, setCompletedSale] = useState<Sale | null>(null)
  const [receiptLogo, setReceiptLogo] = useState<string | null>(null)
  const [flashProductId, setFlashProductId] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  // Short confirmation beep via WebAudio. The AudioContext must be created/
  // resumed from a user gesture, so we lazy-init and swallow any failure.
  const playBeep = useCallback(() => {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctx) return
      const ctx = beepCtx.current ?? new Ctx()
      beepCtx.current = ctx
      void ctx.resume()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'square'
      osc.frequency.value = 880
      gain.gain.setValueAtTime(0.06, ctx.currentTime)
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.12)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start()
      osc.stop(ctx.currentTime + 0.12)
    } catch {
      /* audio not available — ignore */
    }
  }, [])
  const beepCtx = useRef<AudioContext | null>(null)

  // Barcode scan handler — looks up product by barcode, adds to cart
  const handleScan = useCallback(
    (code: string) => {
      const matches = billing.products.filter((p) => p.barcode === code)
      if (matches.length === 0) {
        toasts.error(t('barcode.noMatch', { code }))
        return
      }
      if (matches.length > 1) {
        toasts.error(t('barcode.duplicate'))
        return
      }
      const match = matches[0]
      playBeep()
      billing.addToCart(match)
      toasts.success(t('barcode.matched', { name: match.name }))
      setFlashProductId(match.id)
      window.setTimeout(() => setFlashProductId(null), 600)
    },
    [billing.products, billing.addToCart, toasts, t, playBeep]
  )

  useBarcodeScanner(billing.settings.barcodeEnabled === 'true', handleScan)

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
        <div className="flex-1 min-h-0 overflow-y-auto pos-scroll">
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {filtered.map((p) => {
              const stock = billing.stockMap[p.id] ?? 0
              const sClass = stockClass(stock, p.lowStockThreshold)
              const catName = billing.categories.find((c) => c.id === p.categoryId)?.name
              return (
                <button
                  key={p.id}
                  onClick={() => billing.addToCart(p)}
                  disabled={stock <= 0}
                  title={p.name}
                  className={`group relative flex items-center gap-2.5 text-left p-2 rounded-lg border bg-slate-900/60 hover:border-teal-500/50 hover:bg-slate-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    flashProductId === p.id ? 'border-teal-400 pos-scan-flash' : 'border-slate-800'
                  }`}
                >
                  {/* image */}
                  <div className="relative shrink-0">
                    <ProductThumb product={p} className="h-14 w-14 rounded-md object-cover" />
                    {sClass !== 'ok' && (
                      <span
                        className={`absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full border-2 border-slate-950 ${
                          sClass === 'out' ? 'bg-red-500' : 'bg-amber-500'
                        }`}
                      />
                    )}
                  </div>

                  {/* info */}
                  <div className="min-w-0 flex-1 flex flex-col gap-0.5">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-[9px] uppercase tracking-wide text-slate-500 truncate">
                        {catName || '—'}
                      </span>
                      {p.barcode && (
                        <span className="text-[8.5px] text-slate-600 font-mono shrink-0">{p.barcode.slice(-6)}</span>
                      )}
                    </div>

                    <div className="text-[12.5px] font-medium leading-tight line-clamp-1 text-slate-100">
                      {p.name}
                    </div>

                    <div className="flex items-end justify-between mt-0.5">
                      <div className="leading-none">
                        <span className="text-teal-400 font-bold text-[13px]">{fmt(p.defaultPrice)}</span>
                        <span className="text-[9px] text-slate-500 ml-1">
                          {p.unitType === 'thaan' ? '/m' : '/pc'}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {sClass === 'out' ? (
                          <Badge variant="outline" className="bg-red-500/15 text-red-300 border-red-500/30 text-[9px] px-1 py-0 h-4">
                            Out
                          </Badge>
                        ) : sClass === 'low' ? (
                          <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[9px] px-1 py-0 h-4">
                            {stock}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[9px] px-1 py-0 h-4">
                            {stock}
                          </Badge>
                        )}
                        <div className="w-6 h-6 rounded-md bg-slate-800 group-hover:bg-teal-500 group-hover:text-teal-950 flex items-center justify-center transition-colors shrink-0">
                          <Plus className="w-3.5 h-3.5" />
                        </div>
                      </div>
                    </div>
                  </div>
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
        </div>
      </div>

      {/* ===== RIGHT: cart ===== */}
      <aside className="w-[380px] flex flex-col bg-slate-900/40 min-w-0">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between shrink-0">
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

        <div className="flex-1 min-h-0 overflow-y-auto pos-scroll">
          <div className="p-2 space-y-2">
            {billing.cart.map((line) => (
              <div
                key={line.productId}
                className="pos-cart-add p-2.5 rounded-lg border border-slate-800 bg-slate-950/60"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <ProductThumb product={{ id: line.productId, name: line.name }} className="h-9 w-9 rounded-md object-cover shrink-0" />
                    <div className="font-medium text-sm leading-tight flex-1 min-w-0 break-words">{line.name}</div>
                  </div>
                  <button onClick={() => billing.removeFromCart(line.productId)} className="text-slate-600 hover:text-red-400 shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Quantity: full-width input (steps by 0.1) + ±1 step buttons.
                    For piece items only whole units are allowed; the input
                    step lets thaan (meters) use fine values like 0.2 / 0.4. */}
                <div className="flex items-center gap-1.5 mb-2">
                  <Input
                    type="number" step="0.1"
                    value={line.unitType === 'thaan' ? (line.cutLength ?? line.quantity) : line.quantity}
                    onChange={(e) => billing.updateLine(line.productId, { qty: parseFloat(e.target.value) || 0 })}
                    className="h-7 text-xs flex-1 bg-slate-900 border-slate-700"
                  />
                  <span className="text-[10px] text-slate-500 shrink-0">{line.unitType === 'thaan' ? 'm' : '×'}</span>
                  <div className="flex items-center border border-slate-700 rounded-md shrink-0">
                    <button
                      className="flex items-center justify-center w-14 h-7 text-slate-400 hover:text-teal-400 active:bg-slate-800"
                      onClick={() => billing.updateLine(line.productId, { qtyStep: -1 })} title="−1"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="w-px h-6 bg-slate-700" />
                    <button
                      className="flex items-center justify-center w-14 h-7 text-slate-400 hover:text-teal-400 active:bg-slate-800"
                      onClick={() => billing.updateLine(line.productId, { qtyStep: 1 })} title="+1"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Price + Discount share the row */}
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">{CURRENCY}</span>
                    <Input
                      type="number" step="0.01" value={line.price}
                      onChange={(e) => billing.updateLine(line.productId, { price: parseFloat(e.target.value) || 0 })}
                      className="h-7 text-xs pl-9 bg-slate-900 border-slate-700"
                    />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[10px] text-slate-500 shrink-0">{t('billing.discount')}</Label>
                    <Input
                      type="number" step="1" min="0" max="100" value={line.discount ?? 0}
                      onChange={(e) => billing.updateLine(line.productId, { discount: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                      className="h-7 text-xs flex-1 bg-slate-900 border-slate-700"
                    />
                    <span className="text-[10px] text-slate-500 shrink-0">%</span>
                  </div>
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
        </div>

        {/* Totals + actions — compact footer */}
        {billing.cart.length > 0 && (
          <div className="border-t border-slate-800 px-3 py-2 bg-slate-900/60 shrink-0 space-y-2">
            {/* Total + payment toggle on one row */}
            <div className="flex items-center justify-between gap-2">
              <div className="leading-none">
                <div className="text-[10px] uppercase tracking-wide text-slate-500">{t('billing.total')}</div>
                <div className="text-xl font-bold text-teal-400 tabular-nums">{fmt(billing.subtotal)}</div>
              </div>
              <div className="flex items-center rounded-lg border border-slate-700 p-0.5 text-xs font-medium">
                <button
                  onClick={() => billing.setPaymentMethod('cash')}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1 transition-all ${billing.paymentMethod === 'cash' ? 'bg-teal-500 text-teal-950' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <Wallet className="w-3.5 h-3.5" /> {t('billing.cash')}
                </button>
                <button
                  onClick={() => billing.setPaymentMethod('digital')}
                  className={`px-3 py-1.5 rounded-md flex items-center gap-1 transition-all ${billing.paymentMethod === 'digital' ? 'bg-teal-500 text-teal-950' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  <DollarSign className="w-3.5 h-3.5" /> {t('billing.digital')}
                </button>
              </div>
            </div>

            {/* Paid + change, inline */}
            <div className="flex items-center gap-2">
              <Label className="text-[10px] text-slate-500 shrink-0">{t('billing.paid')}</Label>
              <Input
                type="number" step="0.01"
                placeholder={billing.subtotal.toFixed(2)}
                value={billing.paidAmount}
                onChange={(e) => billing.setPaidAmount(e.target.value)}
                className="h-8 text-xs flex-1 bg-slate-950 border-slate-700"
              />
              {billing.paidAmount && parseFloat(billing.paidAmount) > billing.subtotal && (
                <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px] whitespace-nowrap">
                  {t('billing.change')}: {fmt(parseFloat(billing.paidAmount) - billing.subtotal)}
                </Badge>
              )}
            </div>

            {/* Confirm + reprint */}
            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  const sale = await billing.confirmSale()
                  if (!sale) return
                  if (billing.settings.confirmSaleBeforePrint === 'true') {
                    try {
                      const fn = window.pos.getReceiptLogo
                      const logo = fn ? await fn() : null
                      setReceiptLogo(logo ?? null)
                    } catch {
                      setReceiptLogo(null)
                    }
                    setCompletedSale(sale)
                  } else {
                    await billing.printSale(sale)
                  }
                }}
                disabled={billing.submitting || billing.cart.length === 0}
                className="flex-1 h-10 bg-teal-500 text-teal-950 hover:bg-teal-400 font-semibold text-sm pos-glow"
              >
                {billing.submitting ? (
                  <><RotateCcw className="w-4 h-4 mr-2 animate-spin" /> {t('billing.confirming')}</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4 mr-2" /> {t('billing.confirm')}</>
                )}
              </Button>
              <Button variant="outline" className="h-10 px-3 border-slate-700 text-slate-300" onClick={async () => {
                const sales = await window.pos.getSales(1)
                const last = sales[0]
                if (!last) {
                  toasts.error(t('billing.noLastSale'))
                  return
                }
                if (billing.settings.confirmSaleBeforePrint === 'true') {
                  const fn = window.pos.getReceiptLogo
                  const logo = fn ? await fn().catch(() => null) : null
                  setReceiptLogo(logo ?? null)
                  setCompletedSale(last)
                } else {
                  toasts.error(t('billing.noLastSale'))
                }
              }} title={t('billing.reprint')}>
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </aside>

      {/* ===== Modals ===== */}
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

      {/* ===== Receipt preview dialog (shown when confirmSaleBeforePrint is on) ===== */}
      <PrintPreviewDialog
        open={completedSale !== null}
        onOpenChange={(o) => { if (!o) { setCompletedSale(null); setReceiptLogo(null) } }}
        settings={billing.settings}
        logo={receiptLogo}
        onPrint={async () => {
          if (!completedSale) return
          await billing.printSale(completedSale)
          setCompletedSale(null)
          setReceiptLogo(null)
        }}
      >
        {completedSale && (
          <>
            <div className="text-center">{new Date(completedSale.createdAt).toLocaleString()}</div>

            <div className="border-t border-dashed border-black my-1" />

            <div className="flex font-bold">
              <span className="flex-1">ITEM</span>
              <span className="w-12 text-right">QTY</span>
              <span className="w-16 text-right">PRICE</span>
            </div>
            <div className="border-t border-dashed border-black my-1" />

            {completedSale.items.map((it, i) => {
              const qtyLabel = it.unitType === 'thaan'
                ? `${it.cutLength ?? it.quantity}m`
                : `${it.quantity}x`
              const discAmount = it.discount && it.discount > 0
                ? (it.quantity * it.price * it.discount) / 100
                : 0
              return (
                <div key={i}>
                  <div className="flex">
                    <span className="flex-1 break-words">{it.name}</span>
                    <span className="w-12 text-right">{qtyLabel}</span>
                    <span className="w-16 text-right">{fmt(it.lineTotal)}</span>
                  </div>
                  {discAmount > 0 && (
                    <div className="flex">
                      <span className="flex-1 pl-2">Disc {it.discount}%</span>
                      <span className="w-12 text-right" />
                      <span className="w-16 text-right">- {fmt(discAmount)}</span>
                    </div>
                  )}
                </div>
              )
            })}

            <div className="border-t border-dashed border-black my-1" />

            <div className="flex">
              <span className="flex-1 text-right">SUBTOTAL:</span>
              <span className="w-16 text-right">{fmt(completedSale.total)}</span>
            </div>
            <div className="flex">
              <span className="flex-1 text-right">PAID ({completedSale.paymentMethod.toUpperCase()}):</span>
              <span className="w-16 text-right">{fmt(completedSale.actualPaidPrice)}</span>
            </div>
            <div className="flex">
              <span className="flex-1 text-right">CHANGE:</span>
              <span className="w-16 text-right">{fmt(Math.max(0, completedSale.actualPaidPrice - completedSale.total))}</span>
            </div>
            <div className="flex font-bold">
              <span className="flex-1 text-right">TOTAL:</span>
              <span className="w-16 text-right">{fmt(completedSale.total)}</span>
            </div>

            <div className="border-t border-dashed border-black my-1" />

            {billing.settings.receiptFooter && (
              <div className="text-center whitespace-pre-line">{billing.settings.receiptFooter}</div>
            )}
            <div className="text-center">Thank you for your business!</div>
            <div className="text-center">Visit us again</div>
          </>
        )}
      </PrintPreviewDialog>
    </div>
  )
}
