/**
 * Mock implementation of the window.pos API for the web preview.
 * Mirrors the Electron preload bridge (src/preload/index.ts in pos-app/)
 * but backed by Zustand + localStorage so the demo persists in the browser.
 *
 * In the real Electron app, these calls go over IPC to better-sqlite3.
 * Here they operate on an in-memory store with the same shape.
 */
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { v4 as uuidv4 } from 'uuid'

export type UnitType = 'piece' | 'thaan'
export type PaymentMethod = 'cash' | 'digital'

export type SaleItem = {
  productId: string
  name: string
  unitType: UnitType
  price: number
  quantity: number
  cutLength?: number
  discount?: number // percentage 0-100
  lineTotal: number
}

export type Sale = {
  id: string
  branchId: string
  tillId: string
  shiftId: string | null
  items: SaleItem[]
  total: number
  actualPaidPrice: number
  paymentMethod: PaymentMethod
  createdAt: string
  synced: 0 | 1
  voided?: boolean
  voidedAt?: string
}

export type StockMovement = {
  id: string
  productId: string
  category: string
  changeAmount: number
  reason: string
  createdAt: string
  synced: 0 | 1
}

export type Product = {
  id: string
  name: string
  categoryId: string
  sku: string | null
  barcode: string | null
  unitType: UnitType
  defaultPrice: number
  lowStockThreshold: number
  createdAt: string
}

export type Category = {
  id: string
  name: string
  sortOrder: number
  color?: string
}

export type Shift = {
  id: string
  tillId: string
  openingCash: number
  closingCash: number | null
  expectedCash: number | null
  openedAt: string
  closedAt: string | null
}

export type HeldCart = {
  id: string
  label: string
  items: SaleItem[]
  total: number
  heldAt: string
}

type PosState = {
  branches: Array<{ id: string; name: string }>
  tills: Array<{ id: string; name: string; branchId: string }>
  categories: Category[]
  products: Product[]
  stockMovements: StockMovement[]
  sales: Sale[]
  shifts: Shift[]
  settings: Record<string, string>
  heldCarts: HeldCart[]
  errorLogs: Array<{ id: string; message: string; stack?: string; createdAt: string }>
  feedback: Array<{ id: string; message: string; rating?: number; createdAt: string }>

  // actions
  getProducts: (categoryId?: string) => Product[]
  getCategories: () => Category[]
  createCategory: (name: string, sortOrder?: number) => Category
  createProduct: (input: {
    name: string
    categoryId: string
    unitType: UnitType
    defaultPrice: number
    barcode?: string | null
    sku?: string | null
    lowStockThreshold?: number
    initialStock?: number
  }) => Product
  updateProduct: (id: string, patch: Partial<Product>) => void
  deleteProduct: (id: string) => void
  createSale: (input: {
    branchId: string
    tillId: string
    shiftId: string | null
    items: SaleItem[]
    total: number
    actualPaidPrice: number
    paymentMethod: PaymentMethod
  }) => Sale
  getSales: (limit?: number) => Sale[]
  getLastSale: () => Sale | null
  voidSale: (saleId: string) => boolean
  getStockLevel: (productId: string) => number
  getStockLevels: () => Record<string, number>
  addStockMovement: (input: {
    productId: string
    category: string
    changeAmount: number
    reason: string
  }) => StockMovement
  getOpenShift: (tillId: string) => Shift | null
  openShift: (tillId: string, openingCash: number) => Shift
  closeShift: (shiftId: string, countedCash: number) => Shift
  getShifts: (limit?: number) => Shift[]
  getSettings: () => Record<string, string>
  getSetting: (key: string) => string | null
  setSetting: (key: string, value: string) => void
  setSettings: (values: Record<string, string>) => void
  holdCart: (label: string, items: SaleItem[], total: number) => HeldCart
  recallCart: (id: string) => HeldCart | null
  deleteHeldCart: (id: string) => void
  logError: (input: { message: string; stack?: string; context?: string }) => void
  submitFeedback: (input: { message: string; rating?: number }) => void
  getDashboard: (range?: 'today' | '7d' | '30d') => {
    todaySales: { total: number; count: number }
    cashDigitalSplit: { cash: number; digital: number }
    bestCategory: { name: string; total: number } | null
    lowStock: Array<{ id: string; name: string; stock: number; threshold: number }>
    hourlyTrend: Array<{ hour: string; total: number; count: number }>
    topProducts: Array<{ name: string; qty: number; total: number }>
  }
  getSalesReport: (from: string, to: string) => Sale[]
  resetAll: () => void
}

const now = () => new Date().toISOString()
const round = (n: number) => Math.round(n * 100) / 100

const CATEGORY_COLORS = [
  'bg-rose-500/15 text-rose-300 border-rose-500/30',
  'bg-amber-500/15 text-amber-300 border-amber-500/30',
  'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  'bg-sky-500/15 text-sky-300 border-sky-500/30',
  'bg-violet-500/15 text-violet-300 border-violet-500/30',
  'bg-pink-500/15 text-pink-300 border-pink-500/30'
]

function seedData() {
  const catIds = [uuidv4(), uuidv4(), uuidv4(), uuidv4()]
  const cats: Category[] = [
    { id: catIds[0], name: 'Fabrics', sortOrder: 0, color: CATEGORY_COLORS[0] },
    { id: catIds[1], name: 'Accessories', sortOrder: 1, color: CATEGORY_COLORS[1] },
    { id: catIds[2], name: 'Ready-made', sortOrder: 2, color: CATEGORY_COLORS[2] },
    { id: catIds[3], name: 'Tailoring', sortOrder: 3, color: CATEGORY_COLORS[3] }
  ]
  const ts = now()
  const seedProducts: Array<Omit<Product, 'id' | 'createdAt'>> = [
    { name: 'Cotton Thaan A', categoryId: catIds[0], sku: 'FAB-CT-A', barcode: '8901234500011', unitType: 'thaan', defaultPrice: 1200, lowStockThreshold: 10 },
    { name: 'Silk Thaan B', categoryId: catIds[0], sku: 'FAB-SK-B', barcode: '8901234500028', unitType: 'thaan', defaultPrice: 2500, lowStockThreshold: 8 },
    { name: 'Linen Fabric C', categoryId: catIds[0], sku: 'FAB-LN-C', barcode: '8901234500035', unitType: 'thaan', defaultPrice: 1800, lowStockThreshold: 8 },
    { name: 'Wool Thaan D', categoryId: catIds[0], sku: 'FAB-WL-D', barcode: '8901234500042', unitType: 'thaan', defaultPrice: 3200, lowStockThreshold: 5 },
    { name: 'Buttons (pack)', categoryId: catIds[1], sku: 'ACC-BT-P', barcode: '8901234500059', unitType: 'piece', defaultPrice: 50, lowStockThreshold: 20 },
    { name: 'Zipper 12"', categoryId: catIds[1], sku: 'ACC-ZP-12', barcode: '8901234500066', unitType: 'piece', defaultPrice: 20, lowStockThreshold: 30 },
    { name: 'Thread Roll', categoryId: catIds[1], sku: 'ACC-TH-RL', barcode: '8901234500073', unitType: 'piece', defaultPrice: 80, lowStockThreshold: 15 },
    { name: 'Measuring Tape', categoryId: catIds[1], sku: 'ACC-MT-01', barcode: '8901234500080', unitType: 'piece', defaultPrice: 120, lowStockThreshold: 10 },
    { name: 'Men\'s Kurta', categoryId: catIds[2], sku: 'RM-MK-01', barcode: '8901234500097', unitType: 'piece', defaultPrice: 1800, lowStockThreshold: 5 },
    { name: 'Women\'s Dupatta', categoryId: catIds[2], sku: 'RM-WD-01', barcode: '8901234500103', unitType: 'piece', defaultPrice: 950, lowStockThreshold: 5 },
    { name: 'Tailoring Service', categoryId: catIds[3], sku: 'SVC-TL-01', barcode: null, unitType: 'piece', defaultPrice: 500, lowStockThreshold: 0 },
    { name: 'Alteration', categoryId: catIds[3], sku: 'SVC-AL-01', barcode: null, unitType: 'piece', defaultPrice: 200, lowStockThreshold: 0 }
  ]
  const products: Product[] = seedProducts.map((p) => ({ ...p, id: uuidv4(), createdAt: ts }))
  const stockMovements: StockMovement[] = products.map((p, i) => {
    const stock = [50, 30, 40, 25, 100, 200, 75, 60, 40, 35, 999, 999][i] ?? 50
    return {
      id: uuidv4(),
      productId: p.id,
      category: 'initial',
      changeAmount: stock,
      reason: 'Initial stock',
      createdAt: ts,
      synced: 1 as const
    }
  })
  return { cats, products, stockMovements }
}

export const usePosStore = create<PosState>()(
  persist(
    (set, get) => {
      const seed = seedData()
      return {
        branches: [{ id: 'branch-default', name: 'Main Branch' }],
        tills: [{ id: 'till-1', name: 'Till 1', branchId: 'branch-default' }],
        categories: seed.cats,
        products: seed.products,
        stockMovements: seed.stockMovements,
        sales: [],
        shifts: [],
        settings: {
          shopName: 'Khan Fabrics',
          barcodeEnabled: 'false',
          tillReconciliationEnabled: 'false',
          language: 'en',
          printerName: 'EPSON_TM_T20III',
          backupPath: '',
          autoBackup: 'false',
          setupComplete: 'true',
          licenseKey: '',
          licenseExpiry: '',
          machineId: 'mock-machine-' + Math.random().toString(36).slice(2, 10),
          currency: 'PKR',
          taxRate: '0',
          receiptFooter: 'Thank you for shopping with us!'
        },
        heldCarts: [],
        errorLogs: [],
        feedback: [],

        getProducts: (categoryId) => {
          const { products } = get()
          return categoryId ? products.filter((p) => p.categoryId === categoryId) : products
        },
        getCategories: () => get().categories.sort((a, b) => a.sortOrder - b.sortOrder),
        createCategory: (name, sortOrder = 0) => {
          const cat: Category = {
            id: uuidv4(),
            name,
            sortOrder,
            color: CATEGORY_COLORS[get().categories.length % CATEGORY_COLORS.length]
          }
          set((s) => ({ categories: [...s.categories, cat] }))
          return cat
        },
        createProduct: (input) => {
          const p: Product = { ...input, id: uuidv4(), createdAt: now(), sku: input.sku ?? null, barcode: input.barcode ?? null, lowStockThreshold: input.lowStockThreshold ?? 5 }
          set((s) => ({ products: [...s.products, p] }))
          if (input.initialStock && input.initialStock !== 0) {
            get().addStockMovement({ productId: p.id, category: 'initial', changeAmount: input.initialStock, reason: 'Initial stock on product creation' })
          }
          return p
        },
        updateProduct: (id, patch) => set((s) => ({ products: s.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) })),
        deleteProduct: (id) => set((s) => ({ products: s.products.filter((p) => p.id !== id) })),

        createSale: (input) => {
          const sale: Sale = { ...input, id: uuidv4(), createdAt: now(), synced: 0 }
          const movements: StockMovement[] = input.items.map((it) => ({
            id: uuidv4(),
            productId: it.productId,
            category: 'sale',
            changeAmount: -Math.abs(it.quantity),
            reason: `Sale ${sale.id} - ${it.name}`,
            createdAt: now(),
            synced: 0
          }))
          set((s) => ({ sales: [sale, ...s.sales], stockMovements: [...s.stockMovements, ...movements] }))
          return sale
        },
        getSales: (limit = 100) => get().sales.slice(0, limit),
        getLastSale: () => get().sales[0] ?? null,
        voidSale: (saleId: string) => {
          const sale = get().sales.find((s) => s.id === saleId)
          if (!sale) return false
          if (sale.voided) return false // already voided
          // Reverse the stock movements (add back the sold quantities)
          const reverseMovements: StockMovement[] = sale.items.map((it) => ({
            id: uuidv4(),
            productId: it.productId,
            category: 'void',
            changeAmount: Math.abs(it.quantity), // positive = add back
            reason: `Void of sale ${saleId} - ${it.name}`,
            createdAt: now(),
            synced: 0
          }))
          // Mark sale as voided (keep for audit trail) and add reverse movements
          set((s) => ({
            sales: s.sales.map((x) => x.id === saleId ? { ...x, voided: true, voidedAt: now() } : x),
            stockMovements: [...s.stockMovements, ...reverseMovements]
          }))
          return true
        },

        getStockLevel: (productId) => {
          const total = get().stockMovements.filter((m) => m.productId === productId).reduce((s, m) => s + m.changeAmount, 0)
          return total
        },
        getStockLevels: () => {
          const map: Record<string, number> = {}
          for (const m of get().stockMovements) map[m.productId] = (map[m.productId] ?? 0) + m.changeAmount
          return map
        },
        addStockMovement: (input) => {
          const mv: StockMovement = { ...input, id: uuidv4(), createdAt: now(), synced: 0 }
          set((s) => ({ stockMovements: [...s.stockMovements, mv] }))
          return mv
        },

        getOpenShift: (tillId) => get().shifts.find((s) => s.tillId === tillId && !s.closedAt) ?? null,
        openShift: (tillId, openingCash) => {
          const existing = get().getOpenShift(tillId)
          if (existing) throw new Error(`Till ${tillId} already has an open shift`)
          const shift: Shift = { id: uuidv4(), tillId, openingCash, closingCash: null, expectedCash: null, openedAt: now(), closedAt: null }
          set((s) => ({ shifts: [shift, ...s.shifts] }))
          return shift
        },
        closeShift: (shiftId, countedCash) => {
          const shift = get().shifts.find((s) => s.id === shiftId)
          if (!shift) throw new Error(`Shift ${shiftId} not found`)
          if (shift.closedAt) throw new Error(`Shift ${shiftId} already closed`)
          const cashSales = get().sales.filter((s) => s.shiftId === shiftId && s.paymentMethod === 'cash' && !s.voided).reduce((sum, s) => sum + s.actualPaidPrice, 0)
          const expected = shift.openingCash + cashSales
          const closed: Shift = { ...shift, closingCash: countedCash, expectedCash: expected, closedAt: now() }
          set((s) => ({ shifts: s.shifts.map((x) => (x.id === shiftId ? closed : x)) }))
          return closed
        },
        getShifts: (limit = 50) => get().shifts.slice(0, limit),

        getSettings: () => get().settings,
        getSetting: (key) => get().settings[key] ?? null,
        setSetting: (key, value) => set((s) => ({ settings: { ...s.settings, [key]: value } })),
        setSettings: (values) => set((s) => ({ settings: { ...s.settings, ...values } })),

        holdCart: (label, items, total) => {
          const held: HeldCart = { id: uuidv4(), label, items, total, heldAt: now() }
          set((s) => ({ heldCarts: [held, ...s.heldCarts] }))
          return held
        },
        recallCart: (id) => get().heldCarts.find((h) => h.id === id) ?? null,
        deleteHeldCart: (id) => set((s) => ({ heldCarts: s.heldCarts.filter((h) => h.id !== id) })),

        logError: (input) => set((s) => ({ errorLogs: [{ id: uuidv4(), message: input.message, stack: input.stack, createdAt: now() }, ...s.errorLogs] })),
        submitFeedback: (input) => set((s) => ({ feedback: [{ id: uuidv4(), message: input.message, rating: input.rating, createdAt: now() }, ...s.feedback] })),

        getDashboard: (range = 'today') => {
          const now = new Date()
          const start = new Date()
          if (range === 'today') start.setHours(0, 0, 0, 0)
          else if (range === '7d') start.setDate(now.getDate() - 7)
          else if (range === '30d') start.setDate(now.getDate() - 30)
          const startIso = start.toISOString()
          const rangeSales = get().sales.filter((s) => s.createdAt >= startIso && !s.voided)
          const total = rangeSales.reduce((s, x) => s + x.total, 0)
          const cash = rangeSales.filter((s) => s.paymentMethod === 'cash').reduce((s, x) => s + x.actualPaidPrice, 0)
          const digital = rangeSales.filter((s) => s.paymentMethod === 'digital').reduce((s, x) => s + x.actualPaidPrice, 0)

          // best category
          const catMap: Record<string, number> = {}
          for (const s of rangeSales) {
            for (const it of s.items) {
              const p = get().products.find((x) => x.id === it.productId)
              const cat = p?.categoryId
              if (cat) catMap[cat] = (catMap[cat] ?? 0) + it.lineTotal
            }
          }
          let bestCategory: { name: string; total: number } | null = null
          for (const [cid, t] of Object.entries(catMap)) {
            if (!bestCategory || t > bestCategory.total) {
              const c = get().categories.find((x) => x.id === cid)
              bestCategory = c ? { name: c.name, total: t } : null
            }
          }

          // low stock (always current, not range-filtered)
          const stockMap = get().getStockLevels()
          const lowStock = get().products
            .map((p) => ({ id: p.id, name: p.name, stock: stockMap[p.id] ?? 0, threshold: p.lowStockThreshold }))
            .filter((p) => p.stock < p.threshold && p.threshold > 0)

          // hourly trend (only meaningful for 'today'; for 7d/30d show daily buckets)
          let hourlyTrend: Array<{ hour: string; total: number; count: number }> = []
          if (range === 'today') {
            const hourly: Record<number, { total: number; count: number }> = {}
            for (const s of rangeSales) {
              const h = new Date(s.createdAt).getHours()
              hourly[h] = hourly[h] ?? { total: 0, count: 0 }
              hourly[h].total += s.total
              hourly[h].count += 1
            }
            hourlyTrend = Array.from({ length: 24 }, (_, h) => ({
              hour: `${h.toString().padStart(2, '0')}:00`,
              total: hourly[h]?.total ?? 0,
              count: hourly[h]?.count ?? 0
            })).filter((x, i) => i >= 8 && i <= 22) // 8am-10pm
          } else {
            const days = range === '7d' ? 7 : 30
            const daily: Record<string, { total: number; count: number }> = {}
            for (let d = days - 1; d >= 0; d--) {
              const day = new Date(now); day.setDate(now.getDate() - d); day.setHours(0,0,0,0)
              const key = day.toISOString().slice(0, 10)
              daily[key] = { total: 0, count: 0 }
            }
            for (const s of rangeSales) {
              const key = s.createdAt.slice(0, 10)
              if (daily[key]) { daily[key].total += s.total; daily[key].count += 1 }
            }
            hourlyTrend = Object.entries(daily).map(([key, v]) => ({
              hour: new Date(key).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }),
              total: round(v.total),
              count: v.count
            }))
          }

          // top products
          const prodMap: Record<string, { qty: number; total: number }> = {}
          for (const s of rangeSales) {
            for (const it of s.items) {
              prodMap[it.productId] = prodMap[it.productId] ?? { qty: 0, total: 0 }
              prodMap[it.productId].qty += it.quantity
              prodMap[it.productId].total += it.lineTotal
            }
          }
          const topProducts = Object.entries(prodMap)
            .map(([pid, v]) => ({ name: get().products.find((p) => p.id === pid)?.name ?? 'Unknown', ...v }))
            .sort((a, b) => b.total - a.total)
            .slice(0, 5)

          return {
            todaySales: { total: round(total), count: rangeSales.length },
            cashDigitalSplit: { cash: round(cash), digital: round(digital) },
            bestCategory,
            lowStock,
            hourlyTrend,
            topProducts
          }
        },
        getSalesReport: (from, to) => get().sales.filter((s) => s.createdAt >= from && s.createdAt <= to),

        resetAll: () => {
          const fresh = seedData()
          set({
            categories: fresh.cats,
            products: fresh.products,
            stockMovements: fresh.stockMovements,
            sales: [],
            shifts: [],
            heldCarts: [],
            errorLogs: [],
            feedback: []
          })
        }
      }
    },
    { name: 'pos-mock-store' }
  )
)

/**
 * Install the mock as window.pos so the Electron renderer components
 * (which call window.pos.*) work unchanged in the web preview.
 */
export function installMockPosApi() {
  if (typeof window === 'undefined') return
  const api = {
    getProducts: (categoryId?: string) => Promise.resolve(usePosStore.getState().getProducts(categoryId)),
    getCategories: () => Promise.resolve(usePosStore.getState().getCategories()),
    createCategory: (name: string, sortOrder = 0) => Promise.resolve(usePosStore.getState().createCategory(name, sortOrder)),
    createProduct: (input: any) => Promise.resolve(usePosStore.getState().createProduct(input)),
    updateProduct: (id: string, patch: any) => { usePosStore.getState().updateProduct(id, patch); return Promise.resolve(true) },
    deleteProduct: (id: string) => { usePosStore.getState().deleteProduct(id); return Promise.resolve(true) },
    createSale: (input: any) => Promise.resolve(usePosStore.getState().createSale(input)),
    getSales: (limit = 100) => Promise.resolve(usePosStore.getState().getSales(limit)),
    getLastSale: () => Promise.resolve(usePosStore.getState().getLastSale()),
    voidSale: (saleId: string) => { const ok = usePosStore.getState().voidSale(saleId); return Promise.resolve(ok) },
    getStockLevel: (productId: string) => Promise.resolve(usePosStore.getState().getStockLevel(productId)),
    getStockLevels: () => Promise.resolve(usePosStore.getState().getStockLevels()),
    addStockMovement: (input: any) => Promise.resolve(usePosStore.getState().addStockMovement(input)),
    getOpenShift: (tillId: string) => Promise.resolve(usePosStore.getState().getOpenShift(tillId)),
    openShift: (tillId: string, openingCash: number) => Promise.resolve(usePosStore.getState().openShift(tillId, openingCash)),
    closeShift: (shiftId: string, countedCash: number) => Promise.resolve(usePosStore.getState().closeShift(shiftId, countedCash)),
    getShifts: (limit = 50) => Promise.resolve(usePosStore.getState().getShifts(limit)),
    getSettings: () => Promise.resolve(usePosStore.getState().getSettings()),
    getSetting: (key: string) => Promise.resolve(usePosStore.getState().getSetting(key)),
    setSetting: (key: string, value: string) => { usePosStore.getState().setSetting(key, value); return Promise.resolve(true) },
    setSettings: (values: any) => { usePosStore.getState().setSettings(values); return Promise.resolve(true) },
    holdCart: (label: string, items: any[], total: number) => Promise.resolve(usePosStore.getState().holdCart(label, items, total)),
    recallCart: (id: string) => Promise.resolve(usePosStore.getState().recallCart(id)),
    deleteHeldCart: (id: string) => { usePosStore.getState().deleteHeldCart(id); return Promise.resolve(true) },
    getPrinters: () => Promise.resolve(['EPSON_TM_T20III', 'Star_TSP100', 'Xprinter_XP_58IIH']),
    printReceipt: async (sale: any) => {
      // Simulate print — open receipt preview in new window
      console.log('[mock-printer] receipt for sale', sale.id, sale)
      return Promise.resolve({ ok: true })
    },
    reprintReceipt: () => {
      const last = usePosStore.getState().getLastSale()
      console.log('[mock-printer] reprint', last?.id)
      return Promise.resolve({ ok: !!last, error: last ? undefined : 'No previous sale' })
    },
    printBarcodeLabel: (product: any) => { console.log('[mock-printer] label', product); return Promise.resolve({ ok: true }) },
    getMachineId: () => Promise.resolve(usePosStore.getState().getSetting('machineId') ?? 'mock-machine'),
    activateLicense: (key: string) => {
      // Mock: accept any non-empty key with 1-year expiry
      if (!key.trim()) return Promise.resolve({ ok: false, error: 'Empty key' })
      const expiry = new Date(); expiry.setFullYear(expiry.getFullYear() + 1)
      usePosStore.getState().setSetting('licenseKey', key)
      usePosStore.getState().setSetting('licenseExpiry', expiry.toISOString())
      return Promise.resolve({ ok: true, status: { state: 'valid', shopName: usePosStore.getState().getSetting('shopName') ?? 'Shop', expiry: expiry.toISOString(), daysRemaining: 365 } })
    },
    getLicenseStatus: () => {
      const key = usePosStore.getState().getSetting('licenseKey')
      const expiry = usePosStore.getState().getSetting('licenseExpiry')
      const shopName = usePosStore.getState().getSetting('shopName') ?? 'Shop'
      if (!key || !expiry) return Promise.resolve({ state: 'none' })
      const exp = new Date(expiry)
      const nowD = new Date()
      const graceEnd = new Date(exp); graceEnd.setDate(graceEnd.getDate() + 7)
      if (nowD > graceEnd) return Promise.resolve({ state: 'expired', shopName, expiry })
      if (nowD > exp) {
        const days = Math.ceil((graceEnd.getTime() - nowD.getTime()) / 86400000)
        return Promise.resolve({ state: 'grace', shopName, expiry, daysRemaining: days })
      }
      const days = Math.ceil((exp.getTime() - nowD.getTime()) / 86400000)
      return Promise.resolve({ state: 'valid', shopName, expiry, daysRemaining: days })
    },
    backupDatabase: () => {
      const data = JSON.stringify({ ...usePosStore.getState() }, null, 2)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pos-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
      a.click()
      URL.revokeObjectURL(url)
      return Promise.resolve({ ok: true, path: a.download })
    },
    exportReport: (input: any) => {
      console.log('[mock-export] report', input)
      const data = JSON.stringify(usePosStore.getState().getSalesReport(input.from, input.to), null, 2)
      const blob = new Blob([data], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `report-${input.type}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      return Promise.resolve({ ok: true, path: a.download })
    },
    logError: (input: any) => { usePosStore.getState().logError(input); return Promise.resolve(true) },
    submitFeedback: (input: any) => { usePosStore.getState().submitFeedback(input); return Promise.resolve(true) },
    getDashboard: (range?: 'today' | '7d' | '30d') => Promise.resolve(usePosStore.getState().getDashboard(range)),
    getSalesReport: (from: string, to: string) => Promise.resolve(usePosStore.getState().getSalesReport(from, to))
  }
  ;(window as any).pos = api
}
