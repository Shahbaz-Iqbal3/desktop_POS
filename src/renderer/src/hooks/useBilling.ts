import { useEffect, useState, useCallback } from 'react'
import type {
  Product,
  Category,
  SaleItem,
  Sale,
  PaymentMethod
} from '@shared/types'

export type CartLine = SaleItem & { stock: number }

const DEFAULT_TILL_ID = 'till-1'
const DEFAULT_BRANCH_ID = 'branch-default'

export function useBilling(toasts: {
  success: (m: string) => void
  error: (m: string) => void
}) {
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
    if (settings.tillReconciliationEnabled !== 'true') {
      setOpenShiftId(null)
      return
    }
    const shift = await window.pos.getOpenShift(DEFAULT_TILL_ID)
    setOpenShiftId(shift?.id ?? null)
  }, [settings.tillReconciliationEnabled])

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
        if (existing.quantity >= stock) {
          toasts.error('Cannot exceed available stock')
          return prev
        }
        return prev.map((l) =>
          l.productId === product.id
            ? {
                ...l,
                quantity: l.quantity + 1,
                lineTotal: round((l.quantity + 1) * l.price)
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
        cutLength: product.unitType === 'thaan' ? 1 : undefined,
        lineTotal: round(product.defaultPrice),
        stock
      }
      return [...prev, line]
    })
  }, [stockMap, toasts])

  const updateLine = useCallback((productId: string, patch: Partial<CartLine>) => {
    setCart((prev) =>
      prev.map((l) => {
        if (l.productId !== productId) return l
        const next = { ...l, ...patch }
        next.lineTotal = round(next.quantity * next.price)
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
        branchId: DEFAULT_BRANCH_ID,
        tillId: DEFAULT_TILL_ID,
        shiftId: openShiftId,
        items,
        total,
        actualPaidPrice: paid,
        paymentMethod
      })

      // ⚠️ Sale is now persisted. Print is fire-and-forget — must never block / fail the sale.
      const printResult = await window.pos.printReceipt(sale)
      if (!printResult.ok) {
        toasts.error(`Print failed (sale saved): ${printResult.error}`)
      } else {
        toasts.success('Sale confirmed! Receipt printed')
      }

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

  const reprintLast = useCallback(async () => {
    const result = await window.pos.reprintReceipt()
    if (result.ok) toasts.success('Receipt reprinted')
    else toasts.error(`Reprint failed: ${result.error}`)
  }, [toasts])

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
    reprintLast,
    submitting,
    settings,
    openShiftId,
    refreshOpenShift,
    licenseBanner: getLicenseBanner(settings)
  }
}

function round(n: number): number {
  return Math.round(n * 100) / 100
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
