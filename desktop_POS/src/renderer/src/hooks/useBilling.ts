import { useEffect, useState, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type {
  Product,
  Category,
  SaleItem,
  Sale,
  PaymentMethod,
  HeldCart
} from '@shared/types'
import { round, computeLineTotal } from '@shared/pure'
import type { useToasts } from './useToasts'

type Toasts = ReturnType<typeof useToasts>

export type CartLine = SaleItem & { stock: number }

const DEFAULT_TILL_ID = 'till-1'
const DEFAULT_BRANCH_ID = 'branch-default'

function currentTillId(settings: Record<string, string>): string {
  return settings.currentTillId || DEFAULT_TILL_ID
}

function currentBranchId(settings: Record<string, string>): string {
  return settings.currentBranchId || DEFAULT_BRANCH_ID
}

export function useBilling(toasts: Toasts) {
  const { t } = useTranslation()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [cart, setCart] = useState<CartLine[]>([])
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash')
  const [paidAmount, setPaidAmount] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [openShiftId, setOpenShiftId] = useState<string | null>(null)
  const [shiftResolved, setShiftResolved] = useState(false)
  const [heldCarts, setHeldCarts] = useState<HeldCart[]>([])

  const refreshProducts = useCallback(async () => {
    const list = await window.pos.getProducts(activeCategory ?? undefined)
    setProducts(list)
  }, [activeCategory])

  const refreshCategories = useCallback(async () => {
    const list = await window.pos.getCategories()
    setCategories(list)
  }, [])

  const refreshStock = useCallback(async () => {
    const map = await window.pos.getStockLevels()
    setStockMap(map)
  }, [])

  const refreshSettings = useCallback(async () => {
    const s = await window.pos.getSettings()
    setSettings(s)
  }, [])

  const refreshOpenShift = useCallback(async () => {
    // Keep `shiftResolved` false until the query actually completes.
    // Otherwise `openShiftId` is still null while getOpenShift() is pending,
    // and BillingScreen's effect would wrongly flash the open-shift dialog
    // on every visit even when a shift is already open.
    setShiftResolved(false)
    try {
      if (settings.tillReconciliationEnabled !== 'true') {
        setOpenShiftId(null)
        return
      }
      const shift = await window.pos.getOpenShift(currentTillId(settings))
      setOpenShiftId(shift?.id ?? null)
    } finally {
      setShiftResolved(true)
    }
  }, [settings.tillReconciliationEnabled, settings.currentTillId])

  useEffect(() => {
    void refreshCategories()
    void refreshSettings()
  }, [refreshCategories, refreshSettings])

  useEffect(() => {
    void refreshProducts()
  }, [refreshProducts])

  useEffect(() => {
    void refreshStock()
  }, [refreshStock])

  useEffect(() => {
    void refreshOpenShift()
  }, [refreshOpenShift])

  const filteredProducts = activeCategory
    ? products
    : products

  const visibleProducts = filteredProducts

  const addToCart = useCallback((product: Product) => {
    const stock = stockMap[product.id] ?? 0
    if (stock <= 0) {
      toasts.error('Out of stock')
      return
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.productId === product.id)
      if (existing) {
        // For thaan the billable amount is the cut length (meters); clicking
        // again adds 1m. For piece items it adds 1 piece.
        const cur = existing.unitType === 'thaan' ? (existing.cutLength ?? existing.quantity) : existing.quantity
        if (cur >= stock) {
          toasts.error('Cannot exceed available stock')
          return prev
        }
        const nextAmt = existing.unitType === 'thaan' ? cur + 1 : cur + 1
        return prev.map((l) =>
          l.productId === product.id
            ? {
                ...l,
                cutLength: existing.unitType === 'thaan' ? nextAmt : l.cutLength,
                quantity: existing.unitType === 'thaan' ? l.quantity : nextAmt,
                lineTotal: computeLineTotal(l.price, l.quantity, l.discount, existing.unitType === 'thaan' ? nextAmt : undefined)
              }
            : l
        )
      }
        const line: CartLine = {
          productId: product.id,
          name: product.name,
          unitType: product.unitType,
          price: product.defaultPrice,
          quantity: 1,
            discount: product.defaultDiscount ?? 0,
            cutLength: product.unitType === 'thaan' ? 1 : undefined,
            lineTotal: computeLineTotal(product.defaultPrice, 1, product.defaultDiscount ?? 0, product.unitType === 'thaan' ? 1 : undefined),
          stock
        }
      return [...prev, line]
    })
  }, [stockMap, toasts])

  const updateLine = useCallback((productId: string, patch: Partial<CartLine> & { qtyStep?: number; qty?: number }) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l
        const next = { ...l, ...patch }
        // Resolve the billable amount (cut length in meters for thaan,
        // quantity for piece) from either a direct edit or a step button.
        // Piece items are whole units — never fractional.
        const billableFor = (amt: number) => {
          const raw = l.unitType === 'thaan' ? Math.round(amt * 10) / 10 : Math.round(amt)
          const min = l.unitType === 'thaan' ? 0.2 : 1
          const max = l.stock
          return Math.max(min, Math.min(max, raw))
        }
        if (patch.qtyStep != null) {
          const cur = l.unitType === 'thaan' ? (l.cutLength ?? l.quantity) : l.quantity
          const amt = billableFor(cur + patch.qtyStep)
          if (l.unitType === 'thaan') next.cutLength = amt
          else next.quantity = amt
        }
        if (patch.qty != null) {
          const amt = billableFor(patch.qty)
          if (l.unitType === 'thaan') next.cutLength = amt
          else next.quantity = amt
        }
        const disc = next.discount ?? 0
        next.lineTotal = computeLineTotal(next.price, next.quantity, disc, next.unitType === 'thaan' ? next.cutLength : undefined)
        return next
      })
    )
  }, [])

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((l) => l.productId !== productId))
  }, [])

  const clearCart = useCallback(() => setCart([]), [])

  const subtotal = round(cart.reduce((s, l) => s + l.lineTotal, 0))

  const confirmSale = useCallback(async (): Promise<Sale | null> => {
    if (cart.length === 0) {
      toasts.error('Cart is empty')
      return null
    }
    if (settings.tillReconciliationEnabled === 'true' && !openShiftId) {
      toasts.error('Open a shift first')
      return null
    }
    setSubmitting(true)
    try {
      const items: SaleItem[] = cart.map((l) => ({
        productId: l.productId,
        name: l.name,
        unitType: l.unitType,
        price: l.price,
        quantity: l.quantity,
        cutLength: l.cutLength,
        lineTotal: l.lineTotal
      }))
      const total = subtotal
      const paid = paidAmount ? parseFloat(paidAmount) : total
      const sale = await window.pos.createSale({
        branchId: currentBranchId(settings),
        tillId: currentTillId(settings),
        shiftId: openShiftId,
        items,
        total,
        actualPaidPrice: paid,
        paymentMethod
      })

      // ⚠️ Sale is now persisted. Do NOT auto-print here — the caller decides
      // whether to show a receipt-preview dialog (settings.confirmSaleBeforePrint)
      // or print immediately. The sale stays saved regardless of printing.

      // Refresh stock + clear cart
      await refreshStock()
      setCart([])
      setPaidAmount('')
      return sale
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      toasts.error(`Sale failed: ${msg}`)
      return null
    } finally {
      setSubmitting(false)
    }
  }, [cart, subtotal, paidAmount, paymentMethod, openShiftId, settings, toasts, refreshStock])

  const printSale = useCallback(
    async (sale: Sale): Promise<boolean> => {
      try {
        const result = await window.pos.printReceipt(sale)
        if (result.ok) {
          toasts.success(t('billing.printSuccess'))
          return true
        }
        toasts.warning(t('billing.printFailed', { error: result.error ?? '' }))
        return false
      } catch {
        toasts.warning(t('billing.printFailed', { error: 'unknown error' }))
        return false
      }
    },
    [toasts, t]
  )

  const reprintLast = useCallback(async () => {
    const result = await window.pos.reprintReceipt()
    if (result.ok) toasts.success('Receipt reprinted')
    else toasts.error(`Reprint failed: ${result.error}`)
  }, [toasts])

  const refreshHeldCarts = useCallback(async () => {
    try {
      const carts = await window.pos.getHeldCarts()
      setHeldCarts(carts)
    } catch {
      // ignore — held carts are best-effort
    }
  }, [])

  const holdCurrentCart = useCallback(
    async (label: string): Promise<boolean> => {
      if (cart.length === 0) {
        toasts.error('Cart is empty')
        return false
      }
      try {
        await window.pos.holdCart(label.trim(), cart, subtotal)
        setCart([])
        setPaidAmount('')
        await refreshHeldCarts()
        return true
      } catch (err) {
        toasts.error(err instanceof Error ? err.message : String(err))
        return false
      }
    },
    [cart, subtotal, toasts, refreshHeldCarts]
  )

  const recallHeldCart = useCallback(
    async (id: string): Promise<boolean> => {
      try {
        const cart2 = await window.pos.recallCart(id)
        if (!cart2) return false
        const lines: CartLine[] = cart2.items.map((it: SaleItem) => {
          const stock = stockMap[it.productId] ?? 0
          const qty = Math.min(it.quantity, Math.max(1, stock))
          return {
            ...it,
            quantity: stock > 0 ? qty : it.quantity,
            stock
          }
        })
        setCart(lines)
        setHeldCarts((prev) => prev.filter((c) => c.id !== id))
        return true
      } catch (err) {
        toasts.error(err instanceof Error ? err.message : String(err))
        return false
      }
    },
    [stockMap, toasts]
  )

  const deleteHeldCart = useCallback(
    async (id: string) => {
      try {
        await window.pos.deleteHeldCart(id)
        setHeldCarts((prev) => prev.filter((c) => c.id !== id))
      } catch (err) {
        toasts.error(err instanceof Error ? err.message : String(err))
      }
    },
    [toasts]
  )

  useEffect(() => {
    void refreshHeldCarts()
  }, [refreshHeldCarts])

  return {
    products: visibleProducts,
    categories,
    activeCategory,
    setActiveCategory,
    stockMap,
    cart,
    addToCart,
    updateLine,
    removeFromCart,
    clearCart,
    paymentMethod,
    setPaymentMethod,
    paidAmount,
    setPaidAmount,
    subtotal,
    confirmSale,
    printSale,
    reprintLast,
    heldCarts,
    refreshHeldCarts,
    holdCurrentCart,
    recallHeldCart,
    deleteHeldCart,
    submitting,
    settings,
    openShiftId,
    shiftResolved,
    refreshOpenShift,
    licenseBanner: getLicenseBanner(settings)
  }
}

function getLicenseBanner(settings: Record<string, string>): { kind: 'none' | 'grace' | 'expired'; text: string } | null {
  const key = settings.licenseKey
  const expiry = settings.licenseExpiry
  if (!key || !expiry) return { kind: 'none', text: 'No license — running in trial mode' }

  const exp = new Date(expiry)
  const now = new Date()
  const graceEnd = new Date(exp)
  graceEnd.setDate(graceEnd.getDate() + 7)

  if (now > graceEnd) {
    return { kind: 'expired', text: `License expired ${exp.toLocaleDateString()} — activate to continue` }
  }
  if (now > exp) {
    const days = Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return { kind: 'grace', text: `GRACE PERIOD — ${days} days to renew license` }
  }
  return null
}
