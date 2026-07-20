'use client'
import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ShoppingCart, Search, Settings as SettingsIcon, BarChart3, Receipt,
  Package, Tag, Plus, Minus, X, Printer, RotateCcw, Pause, Play,
  Trash2, Edit3, AlertTriangle, TrendingUp, DollarSign, Wallet,
  Clock, ScanLine, ChevronRight, ChevronLeft, Save, User, StickyNote,
  Percent, ArrowLeft, Store, Calendar, Shield, CheckCircle2, XCircle,
  AlertCircle, BellRing, PackagePlus, History, Download, RefreshCw,
  Keyboard, Languages, Bell, ShoppingBag
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Progress } from '@/components/ui/progress'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import {
  Tabs, TabsContent, TabsList, TabsTrigger
} from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel
} from '@/components/ui/dropdown-menu'
import { usePosStore, installMockPosApi, type Product, type Category, type Sale, type SaleItem } from '@/lib/pos-mock'
import { useCart, computeTotals, type CartLine } from '@/lib/cart-store'
import { useRecents } from '@/lib/recents-store'
import { toasts } from '@/lib/toasts'
import { useI18n, t as translate, type Language } from '@/lib/i18n'
import { ThemeToggle } from '@/components/theme-toggle'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  PieChart, Pie, Cell, Area, AreaChart
} from 'recharts'

const CURRENCY = 'PKR'
const fmt = (n: number) => `${CURRENCY} ${n.toFixed(2)}`

// Product avatar — colored initials based on product name
const AVATAR_COLORS = [
  'bg-rose-500/20 text-rose-300',
  'bg-amber-500/20 text-amber-300',
  'bg-emerald-500/20 text-emerald-300',
  'bg-sky-500/20 text-sky-300',
  'bg-violet-500/20 text-violet-300',
  'bg-pink-500/20 text-pink-300',
  'bg-cyan-500/20 text-cyan-300',
  'bg-orange-500/20 text-orange-300'
]
function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}
function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
}

type Tab = 'billing' | 'dashboard' | 'history' | 'products' | 'shifts' | 'settings'

export default function Page() {
  const [tab, setTab] = useState<Tab>('billing')
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [booted, setBooted] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const { lang, setLang } = useI18n()

  useEffect(() => {
    installMockPosApi()
    window.pos.getSettings().then((s) => {
      setSettings(s)
      setBooted(true)
    })
  }, [])

  // keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'F1') { e.preventDefault(); setTab('billing') }
      if (e.key === 'F2') { e.preventDefault(); setTab('dashboard') }
      if (e.key === 'F3') { e.preventDefault(); setTab('history') }
      if (e.key === 'F4') { e.preventDefault(); setTab('products') }
      if (e.key === 'F5') { e.preventDefault(); setTab('shifts') }
      if (e.key === 'F6') { e.preventDefault(); setTab('settings') }
      if (e.key === '?' && (e.shiftKey || true)) {
        const tag = (document.activeElement?.tagName || '').toLowerCase()
        if (tag !== 'input' && tag !== 'textarea') { e.preventDefault(); setShortcutsOpen((v) => !v) }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const refreshSettings = useCallback(async () => {
    const s = await window.pos.getSettings()
    setSettings(s)
  }, [])

  if (!booted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading POS…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col" dir={lang === 'ur' ? 'rtl' : 'ltr'}>
      <Header tab={tab} setTab={setTab} settings={settings} lang={lang} setLang={setLang} onShortcuts={() => setShortcutsOpen(true)} />
      <main className="flex-1 overflow-hidden">
        <AnimatePresence mode="wait">
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {tab === 'billing' && <BillingScreen settings={settings} onSettingsChanged={refreshSettings} />}
            {tab === 'dashboard' && <DashboardScreen settings={settings} />}
            {tab === 'history' && <HistoryScreen />}
            {tab === 'products' && <ProductsScreen />}
            {tab === 'shifts' && <ShiftsScreen />}
            {tab === 'settings' && <SettingsScreen settings={settings} onSettingsChanged={refreshSettings} />}
          </motion.div>
        </AnimatePresence>
      </main>
      {shortcutsOpen && <ShortcutsOverlay onClose={() => setShortcutsOpen(false)} />}
    </div>
  )
}

/* ============ HEADER ============ */
function Header({ tab, setTab, settings, lang, setLang, onShortcuts }: {
  tab: Tab; setTab: (t: Tab) => void; settings: Record<string, string>
  lang: Language; setLang: (l: Language) => void; onShortcuts: () => void
}) {
  const [time, setTime] = useState(new Date())
  const [lowStockCount, setLowStockCount] = useState(0)

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  // poll low-stock count for the notifications bell
  useEffect(() => {
    const load = async () => {
      try {
        const d = await window.pos.getDashboard()
        setLowStockCount(d.lowStock.length)
      } catch { /* ignore */ }
    }
    void load()
    const t = setInterval(load, 30000)
    return () => clearInterval(t)
  }, [])

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType; key: string }> = [
    { id: 'billing', label: translate('nav.billing'), icon: ShoppingCart, key: 'F1' },
    { id: 'dashboard', label: translate('nav.dashboard'), icon: BarChart3, key: 'F2' },
    { id: 'history', label: translate('nav.history'), icon: History, key: 'F3' },
    { id: 'products', label: translate('nav.products'), icon: Package, key: 'F4' },
    { id: 'shifts', label: translate('nav.shifts'), icon: Clock, key: 'F5' },
    { id: 'settings', label: translate('nav.settings'), icon: SettingsIcon, key: 'F6' }
  ]

  return (
    <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
      <div className="flex items-center justify-between px-4 h-14 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/20 shrink-0">
            <Store className="w-5 h-5 text-teal-950" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-sm leading-tight truncate">{settings.shopName || 'POS App'}</div>
            <div className="text-[10px] text-slate-500 leading-tight">Till 1 · Main Branch</div>
          </div>
        </div>

        <nav className="flex items-center gap-0.5 overflow-x-auto pos-scroll-hide">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                tab === t.id
                  ? 'bg-teal-500/15 text-teal-300 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
              }`}
              title={`${t.label} (${t.key})`}
            >
              <t.icon className="w-3.5 h-3.5" />
              <span className="hidden lg:inline">{t.label}</span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-1.5 text-xs shrink-0">
          {/* Language toggle */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-1 px-2 py-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors" title="Language">
                <Languages className="w-4 h-4" />
                <span className="hidden md:inline text-[10px] uppercase">{lang}</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700">
              <DropdownMenuLabel className="text-slate-400 text-xs">Language / زبان</DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-800" />
              <DropdownMenuItem onClick={() => setLang('en')} className={`text-sm ${lang === 'en' ? 'bg-teal-500/10 text-teal-300' : 'text-slate-200'}`}>
                English {lang === 'en' && <CheckCircle2 className="w-3 h-3 ml-auto" />}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setLang('ur')} className={`text-sm ${lang === 'ur' ? 'bg-teal-500/10 text-teal-300' : 'text-slate-200'}`}>
                اردو (Urdu) {lang === 'ur' && <CheckCircle2 className="w-3 h-3 ml-auto" />}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Notifications bell */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="relative flex items-center px-2 py-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors" title="Notifications">
                <Bell className="w-4 h-4" />
                {lowStockCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                    {lowStockCount}
                  </span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700 w-64">
              <DropdownMenuLabel className="text-slate-400 text-xs flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3 text-amber-400" /> Low Stock Alerts
              </DropdownMenuLabel>
              <DropdownMenuSeparator className="bg-slate-800" />
              {lowStockCount === 0 ? (
                <div className="px-2 py-3 text-center text-xs text-slate-500 flex flex-col items-center gap-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  All products well stocked
                </div>
              ) : (
                <div className="text-xs text-slate-400 px-2 py-1.5">
                  {lowStockCount} product{lowStockCount > 1 ? 's' : ''} need restocking.
                  <button onClick={() => setTab('dashboard')} className="block w-full text-left text-teal-400 hover:text-teal-300 mt-1">
                    View details →
                  </button>
                </div>
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Keyboard shortcuts */}
          <button onClick={onShortcuts} className="flex items-center px-2 py-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors" title="Keyboard shortcuts (?)">
            <Keyboard className="w-4 h-4" />
          </button>

          {/* Theme toggle */}
          <ThemeToggle />

          <div className="text-right hidden md:block ml-1 px-1">
            <div className="font-mono font-medium text-slate-200 text-xs">
              {time.toLocaleTimeString('en-GB')}
            </div>
            <div className="text-[10px] text-slate-500">
              {time.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
            </div>
          </div>
          <div className="w-2 h-2 rounded-full bg-emerald-500 pos-pulse" title="Online" />
        </div>
      </div>
    </header>
  )
}

/* ============ KEYBOARD SHORTCUTS OVERLAY ============ */
function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const shortcuts = [
    { key: 'F1', desc: 'Go to Billing' },
    { key: 'F2', desc: 'Go to Dashboard' },
    { key: 'F3', desc: 'Go to Sale History' },
    { key: 'F4', desc: 'Go to Products' },
    { key: 'F5', desc: 'Go to Shifts' },
    { key: 'F6', desc: 'Go to Settings' },
    { key: '/', desc: 'Focus product search' },
    { key: 'Esc', desc: 'Clear search / close dialog' },
    { key: '?', desc: 'Toggle this shortcuts overlay' },
    { key: 'Ctrl+↵', desc: 'Confirm sale (from billing)' },
    { key: 'F7', desc: 'Hold current cart' }
  ]
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Keyboard className="w-4 h-4 text-teal-400" /> Keyboard Shortcuts</DialogTitle>
          <DialogDescription className="text-slate-400">Speed up your workflow with these shortcuts.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-1.5">
          {shortcuts.map((s) => (
            <div key={s.key} className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-slate-800/50">
              <span className="text-sm text-slate-300">{s.desc}</span>
              <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs font-mono text-teal-300 min-w-[2rem] text-center">{s.key}</kbd>
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="bg-teal-500 text-teal-950 hover:bg-teal-400">Got it</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ============ BILLING SCREEN ============ */
function BillingScreen({ settings, onSettingsChanged }: { settings: Record<string, string>; onSettingsChanged: () => Promise<void> }) {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [activeCategory, setActiveCategory] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [shiftModal, setShiftModal] = useState(false)
  const [openShiftId, setOpenShiftId] = useState<string | null>(null)
  const [holdModal, setHoldModal] = useState(false)
  const [receiptPreview, setReceiptPreview] = useState<Sale | null>(null)
  const [restockModal, setRestockModal] = useState<Product | null>(null)
  const [quickAddProduct, setQuickAddProduct] = useState<Product | null>(null)
  const [customerView, setCustomerView] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)

  const cart = useCart()
  const recents = useRecents()
  const taxRate = parseFloat(settings.taxRate || '0')
  const totals = computeTotals(cart.lines, cart.cartDiscount, taxRate)

  // Add to cart + track in recents
  const addToCartWithRecent = useCallback((product: Product, stock: number) => {
    cart.addToCart(product, stock)
    recents.addRecent(product)
  }, [cart, recents])

  const refreshAll = useCallback(async () => {
    const [ps, cs, sm] = await Promise.all([
      window.pos.getProducts(),
      window.pos.getCategories(),
      window.pos.getStockLevels()
    ])
    setProducts(ps)
    setCategories(cs)
    setStockMap(sm)
  }, [])

  const refreshShift = useCallback(async () => {
    if (settings.tillReconciliationEnabled !== 'true') {
      setOpenShiftId(null)
      return
    }
    const sh = await window.pos.getOpenShift('till-1')
    setOpenShiftId(sh?.id ?? null)
    if (!sh) setShiftModal(true)
  }, [settings.tillReconciliationEnabled])

  useEffect(() => { void refreshAll() }, [refreshAll])
  useEffect(() => { void refreshShift() }, [refreshShift])

  // barcode scanner
  useEffect(() => {
    if (settings.barcodeEnabled !== 'true') return
    let buf = ''
    let lastT = 0
    const h = (e: KeyboardEvent) => {
      const now = Date.now()
      if (now - lastT > 100) buf = ''
      lastT = now
      if (e.key === 'Enter' && buf.length >= 4) {
        e.preventDefault()
        const match = products.find((p) => p.barcode === buf)
        if (match) {
          addToCartWithRecent(match, stockMap[match.id] ?? 0)
          toasts.success(`Scanned: ${match.name}`)
        } else {
          toasts.error(`No product for barcode ${buf}`)
        }
        buf = ''
        return
      }
      if (e.key.length === 1) buf += e.key
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [settings.barcodeEnabled, products, stockMap, cart])

  // keyboard shortcuts: / focus search, Esc clear search, F7 hold cart
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') {
        e.preventDefault()
        searchRef.current?.focus()
      }
      if (e.key === 'Escape') setSearch('')
      // F7 to hold current cart
      if (e.key === 'F7' && cart.lines.length > 0) {
        e.preventDefault()
        setHoldModal(true)
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [cart.lines.length])

  const filtered = useMemo(() => {
    let list = products
    if (activeCategory) list = list.filter((p) => p.categoryId === activeCategory)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.sku?.toLowerCase().includes(q) ||
        p.barcode?.toLowerCase().includes(q)
      )
    }
    return list
  }, [products, activeCategory, search])

  const handleConfirm = async () => {
    if (cart.lines.length === 0) { toasts.error('Cart is empty'); return }
    if (settings.tillReconciliationEnabled === 'true' && !openShiftId) {
      toasts.error('Open a shift first'); setShiftModal(true); return
    }
    setSubmitting(true)
    try {
      const items: SaleItem[] = cart.lines.map((l) => ({
        productId: l.productId, name: l.name, unitType: l.unitType,
        price: l.price, quantity: l.quantity, cutLength: l.cutLength,
        discount: l.discount, lineTotal: l.lineTotal
      }))
      const paid = cart.paidAmount ? parseFloat(cart.paidAmount) : totals.total
      const sale = await window.pos.createSale({
        branchId: 'branch-default', tillId: 'till-1', shiftId: openShiftId,
        items, total: totals.total, actualPaidPrice: paid, paymentMethod: cart.paymentMethod
      })
      // fire-and-forget print
      const pr = await window.pos.printReceipt(sale)
      if (!pr.ok) toasts.warning(`Print failed (sale saved): ${pr.error}`)
      else toasts.success('Sale confirmed · receipt printed')
      setReceiptPreview(sale)
      await refreshAll()
      cart.clearCart()
    } catch (err) {
      toasts.error(`Sale failed: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setSubmitting(false)
    }
  }

  // Ctrl+Enter to confirm sale
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && cart.lines.length > 0 && !submitting) {
        e.preventDefault()
        void handleConfirm()
      }
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [cart.lines, submitting, handleConfirm])

  const handleHold = () => {
    if (cart.lines.length === 0) { toasts.error('Cart is empty'); return }
    setHoldModal(true)
  }

  const handleRecall = async (id: string) => {
    const held = await window.pos.recallCart(id)
    if (!held) { toasts.error('Held cart not found'); return }
    const sm = await window.pos.getStockLevels()
    cart.loadHeld(held.items, sm)
    await window.pos.deleteHeldCart(id)
    setHoldModal(false)
    toasts.success(`Recalled: ${held.label}`)
  }

  const [heldCarts, setHeldCarts] = useState<Array<{ id: string; label: string; total: number; heldAt: string; items: SaleItem[] }>>([])
  const refreshHeld = useCallback(async () => {
    const store = usePosStore.getState()
    setHeldCarts(store.heldCarts)
  }, [])

  const stockBadge = (qty: number, threshold: number) => {
    if (qty <= 0) return <Badge variant="outline" className="bg-red-500/15 text-red-300 border-red-500/30 text-[10px]">Out</Badge>
    if (qty <= threshold) return <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30 text-[10px]">Low · {qty}</Badge>
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px]">{qty}</Badge>
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)]">
      {/* LEFT: items */}
      <div className="flex-1 flex flex-col border-r border-slate-800 min-w-0">
        {/* category bar + search */}
        <div className="border-b border-slate-800 bg-slate-900/40 p-3 space-y-3">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                ref={searchRef}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search products by name, SKU, or barcode…  (press /)"
                className="pl-9 bg-slate-950 border-slate-700 text-sm h-9"
              />
              {search && (
                <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
            {settings.barcodeEnabled === 'true' && (
              <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pos-pulse" />
                <ScanLine className="w-3 h-3" /> Scanner
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto pos-scroll pb-1">
            <CategoryChip active={activeCategory === null} onClick={() => setActiveCategory(null)} label="All" count={products.length} />
            {categories.map((c) => (
              <CategoryChip
                key={c.id}
                active={activeCategory === c.id}
                onClick={() => setActiveCategory(c.id)}
                label={c.name}
                count={products.filter((p) => p.categoryId === c.id).length}
              />
            ))}
          </div>
          {/* Recent products quick-access bar */}
          {recents.recents.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pos-scroll-hide pt-1">
              <span className="text-[10px] text-slate-600 uppercase tracking-wide shrink-0 pr-1">Recent</span>
              {recents.recents.map((r) => {
                const product = products.find((p) => p.id === r.id)
                if (!product) return null
                const stock = stockMap[r.id] ?? 0
                return (
                  <button
                    key={r.id}
                    onClick={() => addToCartWithRecent(product, stock)}
                    disabled={stock <= 0}
                    className="shrink-0 flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-800/60 hover:bg-slate-700 border border-slate-700/50 text-xs text-slate-300 disabled:opacity-40 transition-colors"
                    title={`${r.name} — ${fmt(r.defaultPrice)} (Shift+click for quantity)`}
                  >
                    <span className={`w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold ${avatarColor(r.name)}`}>
                      {initials(r.name)}
                    </span>
                    <span className="max-w-[100px] truncate">{r.name}</span>
                    <span className="text-teal-400 font-medium">{fmt(r.defaultPrice)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {/* items grid */}
        <ScrollArea className="flex-1 pos-scroll">
          <div className="p-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5">
            <AnimatePresence mode="popLayout">
              {filtered.map((p) => {
                const stock = stockMap[p.id] ?? 0
                const cat = categories.find((c) => c.id === p.categoryId)
                return (
                  <motion.button
                    key={p.id}
                    layout
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={{ duration: 0.15 }}
                    onClick={(e) => {
                      if (e.shiftKey) {
                        setQuickAddProduct(p)
                      } else {
                        addToCartWithRecent(p, stock)
                      }
                    }}
                    onContextMenu={(e) => { e.preventDefault(); setQuickAddProduct(p) }}
                    disabled={stock <= 0}
                    className="group relative text-left p-3 rounded-lg border border-slate-800 bg-slate-900/60 hover:border-teal-500/50 hover:bg-slate-900 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <span className={`px-1.5 py-0.5 rounded text-[9px] border ${cat?.color || 'bg-slate-700/40 text-slate-300 border-slate-600'}`}>
                        {cat?.name || 'Uncategorized'}
                      </span>
                      {stockBadge(stock, p.lowStockThreshold)}
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
                  </motion.button>
                )
              })}
            </AnimatePresence>
            {filtered.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center py-16 text-slate-500">
                <Package className="w-10 h-10 mb-2 opacity-40" />
                <p className="text-sm">No products match your search</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </div>

      {/* RIGHT: cart */}
      <aside className="w-[380px] flex flex-col bg-slate-900/40 min-w-0">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingCart className="w-4 h-4 text-teal-400" />
            <h2 className="text-sm font-semibold">Current Sale</h2>
            <Badge variant="outline" className="text-[10px]">{cart.lines.length} items</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-400" onClick={() => setCustomerView(true)} title="Customer-facing display">
              <ShoppingBag className="w-3.5 h-3.5" /> View
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-400" onClick={handleHold} title="Hold cart (park sale) — F7">
              <Pause className="w-3.5 h-3.5" /> Hold
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-slate-400" onClick={() => { void refreshHeld(); setHoldModal(true) }} title="Recall held sale">
              <Play className="w-3.5 h-3.5" /> Recall
            </Button>
            {cart.lines.length > 0 && (
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs text-red-400" onClick={cart.clearCart}>
                <Trash2 className="w-3.5 h-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>

        <ScrollArea className="flex-1 pos-scroll">
          <div className="p-2 space-y-2">
            <AnimatePresence mode="popLayout">
              {cart.lines.map((line) => (
                <motion.div
                  key={line.productId}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.18 }}
                  className="pos-cart-add p-2.5 rounded-lg border border-slate-800 bg-slate-950/60"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="font-medium text-sm leading-tight flex-1">{line.name}</div>
                    <button onClick={() => cart.removeFromCart(line.productId)} className="text-slate-600 hover:text-red-400">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2 mb-2">
                    <div className="flex items-center border border-slate-700 rounded-md">
                      <button className="px-1.5 py-0.5 text-slate-400 hover:text-teal-400" onClick={() => cart.updateLine(line.productId, { quantity: Math.max(1, line.quantity - 1) })}>
                        <Minus className="w-3 h-3" />
                      </button>
                      <span className="px-2 text-xs font-mono font-medium min-w-[2.5rem] text-center">
                        {line.quantity}{line.unitType === 'thaan' ? 'm' : '×'}
                      </span>
                      <button className="px-1.5 py-0.5 text-slate-400 hover:text-teal-400" onClick={() => cart.updateLine(line.productId, { quantity: Math.min(line.stock, line.quantity + 1) })}>
                        <Plus className="w-3 h-3" />
                      </button>
                    </div>
                    <div className="flex-1 relative">
                      <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-500">{CURRENCY}</span>
                      <Input
                        type="number" step="0.01" value={line.price}
                        onChange={(e) => cart.updateLine(line.productId, { price: parseFloat(e.target.value) || 0 })}
                        className="h-7 text-xs pl-9 bg-slate-900 border-slate-700"
                      />
                    </div>
                  </div>

                  {line.unitType === 'thaan' && (
                    <div className="flex items-center gap-2 mb-2">
                      <Label className="text-[10px] text-slate-500 w-20">Cut length (m)</Label>
                      <Input
                        type="number" step="0.1" value={line.cutLength ?? ''}
                        onChange={(e) => cart.updateLine(line.productId, { cutLength: parseFloat(e.target.value) || 0 })}
                        className="h-7 text-xs w-24 bg-slate-900 border-slate-700"
                      />
                    </div>
                  )}

                  <div className="flex items-center gap-2 mb-2">
                    <Label className="text-[10px] text-slate-500 w-20">Discount %</Label>
                    <Input
                      type="number" step="1" min="0" max="100" value={line.discount ?? 0}
                      onChange={(e) => cart.updateLine(line.productId, { discount: Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)) })}
                      className="h-7 text-xs w-24 bg-slate-900 border-slate-700"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1.5 border-t border-slate-800">
                    <span className="text-[10px] text-slate-500">Stock: {line.stock}</span>
                    <span className="font-bold text-teal-400 text-sm">{fmt(line.lineTotal)}</span>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
            {cart.lines.length === 0 && (
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

        {/* totals + actions */}
        {cart.lines.length > 0 && (
          <div className="border-t border-slate-800 p-3 space-y-3 bg-slate-900/60">
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Customer name (optional)"
                value={cart.customerName}
                onChange={(e) => cart.setCustomerName(e.target.value)}
                className="h-8 text-xs bg-slate-950 border-slate-700"
              />
              <div className="flex items-center gap-1">
                <Percent className="w-3 h-3 text-slate-500 ml-1" />
                <Input
                  type="number" min="0" max="100" placeholder="Cart %"
                  value={cart.cartDiscount || ''}
                  onChange={(e) => cart.setCartDiscount(parseFloat(e.target.value) || 0)}
                  className="h-8 text-xs bg-slate-950 border-slate-700"
                />
              </div>
            </div>

            <div className="space-y-1 text-xs">
              <Row label="Subtotal" value={fmt(totals.subtotal)} />
              {totals.discount > 0 && <Row label="Discount" value={`− ${fmt(totals.discount)}`} className="text-amber-400" />}
              {totals.tax > 0 && <Row label={`Tax (${taxRate}%)`} value={fmt(totals.tax)} />}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <span className="text-sm font-semibold text-slate-300">Total</span>
              <span className="text-2xl font-bold text-teal-400 tabular-nums">{fmt(totals.total)}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                variant={cart.paymentMethod === 'cash' ? 'default' : 'outline'}
                className={`h-9 text-xs ${cart.paymentMethod === 'cash' ? 'bg-teal-500 text-teal-950 hover:bg-teal-400' : 'border-slate-700 text-slate-300'}`}
                onClick={() => cart.setPaymentMethod('cash')}
              >
                <Wallet className="w-3.5 h-3.5 mr-1" /> Cash
              </Button>
              <Button
                variant={cart.paymentMethod === 'digital' ? 'default' : 'outline'}
                className={`h-9 text-xs ${cart.paymentMethod === 'digital' ? 'bg-teal-500 text-teal-950 hover:bg-teal-400' : 'border-slate-700 text-slate-300'}`}
                onClick={() => cart.setPaymentMethod('digital')}
              >
                <DollarSign className="w-3.5 h-3.5 mr-1" /> Digital
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Label className="text-[10px] text-slate-500 w-12">Paid</Label>
              <Input
                type="number" step="0.01"
                placeholder={totals.total.toFixed(2)}
                value={cart.paidAmount}
                onChange={(e) => cart.setPaidAmount(e.target.value)}
                className="h-8 text-xs bg-slate-950 border-slate-700"
              />
              {cart.paidAmount && parseFloat(cart.paidAmount) > totals.total && (
                <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 text-[10px] whitespace-nowrap">
                  Change: {fmt(parseFloat(cart.paidAmount) - totals.total)}
                </Badge>
              )}
            </div>

            <div className="flex gap-2">
              <Button
                onClick={handleConfirm}
                disabled={submitting || cart.lines.length === 0}
                className="flex-1 h-11 bg-teal-500 text-teal-950 hover:bg-teal-400 font-semibold text-sm pos-glow"
              >
                {submitting ? (
                  <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Processing…</>
                ) : (
                  <><CheckCircle2 className="w-4 h-4 mr-2" /> Confirm Order <kbd className="ml-2 px-1.5 py-0.5 rounded bg-teal-950/30 text-[10px] font-mono">Ctrl+↵</kbd></>
                )}
              </Button>
              <Button variant="outline" className="h-11 px-3 border-slate-700 text-slate-300" onClick={async () => { const r = await window.pos.reprintReceipt(); r.ok ? toasts.success('Reprinted') : toasts.error(r.error || 'Failed') }} title="Reprint last receipt">
                <RotateCcw className="w-4 h-4" />
              </Button>
            </div>
          </div>
        )}
      </aside>

      {/* modals */}
      {shiftModal && (
        <ShiftDialog mode="open" onClose={() => setShiftModal(false)} onDone={async () => { await refreshShift(); setShiftModal(false) }} />
      )}
      {holdModal && (
        <HoldCartDialog
          onClose={() => setHoldModal(false)}
          onHold={async (label) => {
            await window.pos.holdCart(label || `Sale ${new Date().toLocaleTimeString()}`, cart.lines, totals.total)
            cart.clearCart()
            setHoldModal(false)
            toasts.success('Cart held')
          }}
          heldCarts={heldCarts}
          onRecall={handleRecall}
          onDelete={async (id) => { await window.pos.deleteHeldCart(id); void refreshHeld() }}
          refresh={refreshHeld}
        />
      )}
      {receiptPreview && (
        <ReceiptPreviewDialog sale={receiptPreview} settings={settings} onClose={() => setReceiptPreview(null)} />
      )}
      {restockModal && (
        <RestockDialog product={restockModal} onClose={() => setRestockModal(null)} onDone={async () => { await refreshAll(); setRestockModal(null) }} />
      )}
      {customerView && (
        <CustomerViewDialog
          lines={cart.lines}
          total={totals.total}
          subtotal={totals.subtotal}
          discount={totals.discount}
          tax={totals.tax}
          taxRate={taxRate}
          shopName={settings.shopName || 'My Shop'}
          onClose={() => setCustomerView(false)}
        />
      )}
      {quickAddProduct && (
        <QuickAddDialog
          product={quickAddProduct}
          stock={stockMap[quickAddProduct.id] ?? 0}
          onClose={() => setQuickAddProduct(null)}
          onConfirm={(qty, cutLength) => {
            const stock = stockMap[quickAddProduct.id] ?? 0
            cart.addToCart(quickAddProduct, stock)
            cart.updateLine(quickAddProduct.id, { quantity: Math.min(stock, qty), cutLength })
            recents.addRecent(quickAddProduct)
            toasts.success(`Added ${qty}${quickAddProduct.unitType === 'thaan' ? 'm' : '×'} ${quickAddProduct.name}`)
            setQuickAddProduct(null)
          }}
        />
      )}
    </div>
  )
}

function Row({ label, value, className = '' }: { label: string; value: string; className?: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`font-medium tabular-nums ${className}`}>{value}</span>
    </div>
  )
}

function CategoryChip({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
        active
          ? 'bg-teal-500 text-teal-950 shadow-sm'
          : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700'
      }`}
    >
      {label}
      <span className={`text-[10px] px-1 rounded ${active ? 'bg-teal-950/20' : 'bg-slate-900/60 text-slate-500'}`}>{count}</span>
    </button>
  )
}

/* ============ SHIFT DIALOG ============ */
function ShiftDialog({ mode, shiftId, openingCash, expectedCash, onClose, onDone }: {
  mode: 'open' | 'close'; shiftId?: string; openingCash?: number; expectedCash?: number
  onClose: () => void; onDone: () => void | Promise<void>
}) {
  const [cash, setCash] = useState(mode === 'close' && openingCash !== undefined ? String(openingCash) : '')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    const n = parseFloat(cash)
    if (isNaN(n) || n < 0) { toasts.error('Enter a valid amount'); return }
    setSubmitting(true)
    try {
      if (mode === 'open') {
        await window.pos.openShift('till-1', n)
        toasts.success('Shift opened')
      } else if (shiftId) {
        await window.pos.closeShift(shiftId, n)
        const variance = expectedCash !== undefined ? n - expectedCash : 0
        toasts.success(`Shift closed · variance ${fmt(variance)}`)
      }
      await onDone()
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="bg-slate-900 border-slate-800">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-400" />
            {mode === 'open' ? 'Open Shift' : 'Close Shift'}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {mode === 'open' ? 'Enter the opening cash float for this till.' : 'Count the cash in the drawer and enter the total.'}
          </DialogDescription>
        </DialogHeader>
        {mode === 'close' && expectedCash !== undefined && (
          <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
            <div className="flex justify-between text-xs"><span className="text-slate-500">Expected cash</span><span className="font-mono font-semibold text-teal-400">{fmt(expectedCash)}</span></div>
          </div>
        )}
        <div className="space-y-2">
          <Label>{mode === 'open' ? 'Opening cash' : 'Counted cash'}</Label>
          <Input type="number" step="0.01" value={cash} onChange={(e) => setCash(e.target.value)} autoFocus className="bg-slate-950 border-slate-700 text-lg font-mono" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-700">Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-teal-500 text-teal-950 hover:bg-teal-400">
            {submitting ? 'Processing…' : mode === 'open' ? 'Open Shift' : 'Close Shift'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ============ HOLD CART DIALOG ============ */
function HoldCartDialog({ onClose, onHold, heldCarts, onRecall, onDelete, refresh }: {
  onClose: () => void; onHold: (label: string) => void | Promise<void>
  heldCarts: Array<{ id: string; label: string; total: number; heldAt: string; items: SaleItem[] }>
  onRecall: (id: string) => void | Promise<void>; onDelete: (id: string) => void | Promise<void>
  refresh: () => void | Promise<void>
}) {
  const [label, setLabel] = useState('')
  useEffect(() => { void refresh() }, [refresh])
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Pause className="w-4 h-4 text-teal-400" /> Hold / Recall Sale</DialogTitle>
          <DialogDescription className="text-slate-400">Park the current sale to serve another customer, then recall it later.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Label for this held sale</Label>
          <div className="flex gap-2">
            <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Customer waiting for tailoring" className="bg-slate-950 border-slate-700" />
            <Button onClick={() => onHold(label)} className="bg-teal-500 text-teal-950 hover:bg-teal-400">Hold</Button>
          </div>
        </div>
        <Separator className="bg-slate-800" />
        <div className="space-y-2 max-h-64 overflow-y-auto pos-scroll">
          <Label className="text-xs text-slate-500">Held sales ({heldCarts.length})</Label>
          {heldCarts.length === 0 ? (
            <p className="text-xs text-slate-600 py-4 text-center">No held sales</p>
          ) : heldCarts.map((h) => (
            <div key={h.id} className="flex items-center justify-between p-2 rounded-lg border border-slate-800 bg-slate-950/60">
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">{h.label}</div>
                <div className="text-[10px] text-slate-500">{h.items.length} items · {new Date(h.heldAt).toLocaleTimeString()} · {fmt(h.total)}</div>
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" className="h-7 px-2 text-teal-400" onClick={() => onRecall(h.id)}><Play className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400" onClick={() => onDelete(h.id)}><Trash2 className="w-3.5 h-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ============ RECEIPT PREVIEW ============ */
function ReceiptPreviewDialog({ sale, settings, onClose, onVoid }: { sale: Sale; settings: Record<string, string>; onClose: () => void; onVoid?: () => void | Promise<void> }) {
  const change = sale.actualPaidPrice - sale.total
  const [voidConfirm, setVoidConfirm] = useState(false)

  const handlePrint = () => {
    // Open a real browser print dialog with just the receipt
    const w = window.open('', '_blank', 'width=400,height=600')
    if (!w) { toasts.error('Pop-up blocked — allow pop-ups to print'); return }
    const rows = sale.items.map((it) => `<tr><td>${it.name}</td><td style="text-align:right">${fmt(it.lineTotal)}</td></tr>`).join('')
    w.document.write(`<!doctype html><html><head><title>Receipt ${sale.id.slice(0,8)}</title>
      <style>
        * { font-family: 'Courier New', monospace; box-sizing: border-box; }
        body { width: 80mm; margin: 0 auto; padding: 4mm; color: #000; font-size: 11px; }
        .center { text-align: center; }
        .row { display: flex; justify-content: space-between; }
        .bold { font-weight: bold; }
        .dashed { border-top: 1px dashed #000; margin: 4px 0; padding: 4px 0; }
        table { width: 100%; border-collapse: collapse; }
        td { padding: 1px 0; }
        .small { font-size: 10px; }
      </style></head><body>
      <div class="center bold">${settings.shopName || 'Shop'}</div>
      <div class="center small">Main Branch · Till 1</div>
      <div class="center small">${new Date(sale.createdAt).toLocaleString()}</div>
      <div class="center small">Receipt #${sale.id.slice(0,8).toUpperCase()}</div>
      <div class="dashed"></div>
      <table>${rows}</table>
      <div class="dashed"></div>
      <div class="row bold"><span>TOTAL</span><span>${fmt(sale.total)}</span></div>
      <div class="row"><span>Paid (${sale.paymentMethod})</span><span>${fmt(sale.actualPaidPrice)}</span></div>
      ${change > 0 ? `<div class="row"><span>Change</span><span>${fmt(change)}</span></div>` : ''}
      <div class="dashed"></div>
      <div class="center small">${settings.receiptFooter || 'Thank you for your business!'}</div>
      <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500) }</script>
      </body></html>`)
    w.document.close()
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Receipt className="w-4 h-4 text-teal-400" /> Receipt Preview</DialogTitle>
          <DialogDescription className="text-slate-400 text-xs">Receipt #{sale.id.slice(0, 8).toUpperCase()} · {new Date(sale.createdAt).toLocaleString()}</DialogDescription>
        </DialogHeader>
        <div className="pos-receipt bg-white text-black p-4 rounded-lg font-mono text-[11px]">
          <div className="text-center mb-2">
            <div className="font-bold uppercase">{settings.shopName}</div>
            <div className="text-[10px]">Main Branch · Till 1</div>
            <div className="text-[10px]">{new Date(sale.createdAt).toLocaleString()}</div>
            <div className="text-[10px]">Receipt #{sale.id.slice(0, 8).toUpperCase()}</div>
          </div>
          <div className="border-t border-b border-dashed border-gray-400 py-1 my-1">
            {sale.items.map((it, i) => (
              <div key={i} className="flex justify-between">
                <span>{it.name}{it.discount ? ` (−${it.discount}%)` : ''}</span>
                <span>{fmt(it.lineTotal)}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between font-bold"><span>TOTAL</span><span>{fmt(sale.total)}</span></div>
          <div className="flex justify-between"><span>Paid ({sale.paymentMethod})</span><span>{fmt(sale.actualPaidPrice)}</span></div>
          {change > 0 && <div className="flex justify-between"><span>Change</span><span>{fmt(change)}</span></div>}
          <div className="text-center mt-2 border-t border-dashed border-gray-400 pt-1 text-[10px]">
            {settings.receiptFooter || 'Thank you for your business!'}
          </div>
        </div>
        <DialogFooter className="flex-wrap gap-2">
          <Button variant="outline" onClick={onClose} className="border-slate-700">Close</Button>
          {onVoid && !voidConfirm && (
            <Button variant="outline" onClick={() => setVoidConfirm(true)} className="border-red-800 text-red-400 hover:bg-red-950/30">
              <XCircle className="w-4 h-4 mr-1" /> Void
            </Button>
          )}
          {onVoid && voidConfirm && (
            <>
              <span className="text-xs text-red-400 self-center mr-1">Confirm void? Stock will be restored.</span>
              <Button variant="outline" onClick={() => setVoidConfirm(false)} className="border-slate-700 text-slate-300 h-9">Cancel</Button>
              <Button variant="outline" onClick={async () => { await onVoid(); setVoidConfirm(false) }} className="border-red-600 bg-red-600 text-white hover:bg-red-500 h-9">
                <Trash2 className="w-4 h-4 mr-1" /> Confirm Void
              </Button>
            </>
          )}
          <Button variant="outline" onClick={handlePrint} className="border-teal-700 text-teal-300 hover:bg-teal-950/30">
            <Printer className="w-4 h-4 mr-1" /> Print
          </Button>
          <Button onClick={async () => { const r = await window.pos.printReceipt(sale); r.ok ? toasts.success('Sent to thermal printer') : toasts.error(r.error || 'Failed') }} className="bg-teal-500 text-teal-950 hover:bg-teal-400">
            <CheckCircle2 className="w-4 h-4 mr-1" /> Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ============ CUSTOMER VIEW DIALOG ============ */
function CustomerViewDialog({ lines, total, subtotal, discount, tax, taxRate, shopName, onClose }: {
  lines: CartLine[]; total: number; subtotal: number; discount: number; tax: number; taxRate: number
  shopName: string; onClose: () => void
}) {
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="bg-slate-950 border-slate-800 max-w-2xl p-0 overflow-hidden">
        {/* Header with shop name */}
        <div className="bg-gradient-to-r from-teal-600 to-teal-500 p-6 text-center">
          <div className="text-xs text-teal-100 uppercase tracking-widest mb-1">Welcome to</div>
          <div className="text-3xl font-bold text-white">{shopName}</div>
        </div>

        {/* Items list — large format for customer viewing */}
        <div className="p-6 max-h-[50vh] overflow-y-auto pos-scroll">
          {lines.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <ShoppingBag className="w-12 h-12 mx-auto mb-3 opacity-40" />
              <p className="text-lg">Your cart is empty</p>
            </div>
          ) : (
            <div className="space-y-3">
              {lines.map((line) => (
                <div key={line.productId} className="flex items-center justify-between py-3 border-b border-slate-800">
                  <div className="flex-1 min-w-0">
                    <div className="text-lg font-medium text-slate-100">{line.name}</div>
                    <div className="text-sm text-slate-500">
                      {line.quantity}{line.unitType === 'thaan' ? 'm' : '×'} × {fmt(line.price)}
                      {line.discount ? ` (−${line.discount}%)` : ''}
                    </div>
                  </div>
                  <div className="text-xl font-bold text-teal-400 tabular-nums">{fmt(line.lineTotal)}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Total — large, prominent */}
        {lines.length > 0 && (
          <div className="bg-slate-900 border-t border-slate-800 p-6">
            <div className="space-y-1.5 mb-4">
              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Subtotal</span>
                  <span className="text-slate-300 tabular-nums">{fmt(subtotal)}</span>
                </div>
              )}
              {discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Discount</span>
                  <span className="text-amber-400 tabular-nums">− {fmt(discount)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-slate-400">Tax ({taxRate}%)</span>
                  <span className="text-slate-300 tabular-nums">{fmt(tax)}</span>
                </div>
              )}
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <span className="text-lg text-slate-300">Total</span>
              <span className="text-4xl font-bold text-teal-400 tabular-nums">{fmt(total)}</span>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="bg-slate-900/50 px-6 py-3 flex justify-between items-center border-t border-slate-800">
          <span className="text-xs text-slate-500">Thank you for shopping with us!</span>
          <Button variant="outline" size="sm" onClick={onClose} className="border-slate-700 text-slate-300">
            <X className="w-3.5 h-3.5 mr-1" /> Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ============ QUICK ADD DIALOG ============ */
function QuickAddDialog({ product, stock, onClose, onConfirm }: {
  product: Product; stock: number; onClose: () => void
  onConfirm: (qty: number, cutLength?: number) => void
}) {
  const [qty, setQty] = useState(product.unitType === 'thaan' ? '1' : '1')
  const [cutLength, setCutLength] = useState(product.unitType === 'thaan' ? '1' : '')

  const qtyNum = parseFloat(qty) || 0
  const lineTotal = qtyNum * product.defaultPrice

  const handleConfirm = () => {
    if (qtyNum <= 0) { toasts.error('Enter a quantity'); return }
    if (qtyNum > stock) { toasts.error(`Only ${stock} in stock`); return }
    onConfirm(qtyNum, product.unitType === 'thaan' ? (parseFloat(cutLength) || 0) : undefined)
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${avatarColor(product.name)}`}>
              {initials(product.name)}
            </span>
            {product.name}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {fmt(product.defaultPrice)} {product.unitType === 'thaan' ? 'per meter' : 'per piece'} · {stock} in stock
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">{product.unitType === 'thaan' ? 'Meters' : 'Quantity'}</Label>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-slate-700" onClick={() => setQty(String(Math.max(1, qtyNum - 1)))}>
                <Minus className="w-4 h-4" />
              </Button>
              <Input
                type="number" step={product.unitType === 'thaan' ? '0.1' : '1'} min="1"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleConfirm()}
                autoFocus
                className="bg-slate-950 border-slate-700 text-center text-lg font-mono font-bold"
              />
              <Button variant="outline" size="sm" className="h-9 w-9 p-0 border-slate-700" onClick={() => setQty(String(qtyNum + 1))}>
                <Plus className="w-4 h-4" />
              </Button>
            </div>
            {/* Quick quantity buttons */}
            <div className="flex gap-1.5 mt-2">
              {(product.unitType === 'thaan' ? [1, 2, 3, 5, 10] : [1, 2, 5, 10, 20]).map((n) => (
                <button
                  key={n}
                  onClick={() => setQty(String(n))}
                  className="flex-1 py-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          {product.unitType === 'thaan' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Cut length (m) — optional</Label>
              <Input
                type="number" step="0.1" value={cutLength}
                onChange={(e) => setCutLength(e.target.value)}
                className="bg-slate-950 border-slate-700 font-mono"
              />
            </div>
          )}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800">
            <span className="text-xs text-slate-500">Line total</span>
            <span className="text-lg font-bold text-teal-400 tabular-nums">{fmt(lineTotal)}</span>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-700">Cancel</Button>
          <Button onClick={handleConfirm} className="bg-teal-500 text-teal-950 hover:bg-teal-400">
            <Plus className="w-4 h-4 mr-1" /> Add to Cart
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ============ RESTOCK DIALOG ============ */
function RestockDialog({ product, onClose, onDone }: { product: Product; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [qty, setQty] = useState('')
  const [reason, setReason] = useState('restock')
  const submit = async () => {
    const n = parseFloat(qty)
    if (isNaN(n) || n === 0) { toasts.error('Enter a quantity'); return }
    await window.pos.addStockMovement({ productId: product.id, category: reason, changeAmount: n, reason: `${reason} — manual entry` })
    toasts.success(`Stock adjusted by ${n > 0 ? '+' : ''}${n}`)
    await onDone()
  }
  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="bg-slate-900 border-slate-800">
        <DialogHeader><DialogTitle>Restock: {product.name}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Quantity (use negative for stock-out)</Label>
            <Input type="number" step="0.1" value={qty} onChange={(e) => setQty(e.target.value)} autoFocus className="bg-slate-950 border-slate-700 font-mono text-lg" />
          </div>
          <div className="space-y-2">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="restock">Restock from supplier</SelectItem>
                <SelectItem value="return">Customer return</SelectItem>
                <SelectItem value="adjustment">Stock adjustment</SelectItem>
                <SelectItem value="damage">Damaged / written off</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-700">Cancel</Button>
          <Button onClick={submit} className="bg-teal-500 text-teal-950 hover:bg-teal-400"><PackagePlus className="w-4 h-4 mr-1" /> Adjust Stock</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ============ DASHBOARD ============ */
function DashboardScreen({ settings }: { settings: Record<string, string> }) {
  const [data, setData] = useState<ReturnType<ReturnType<typeof usePosStore.getState>['getDashboard']>>(null)
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState<'today' | '7d' | '30d'>('today')

  const load = useCallback(async () => {
    const d = await window.pos.getDashboard(range)
    setData(d)
    setLoading(false)
  }, [range])
  useEffect(() => { void load(); const t = setInterval(load, 30000); return () => clearInterval(t) }, [load])

  if (loading || !data) return <Loading />

  const rangeLabel = range === 'today' ? 'Today' : range === '7d' ? 'Last 7 days' : 'Last 30 days'

  const pieData = [
    { name: 'Cash', value: data.cashDigitalSplit.cash, color: '#22c55e' },
    { name: 'Digital', value: data.cashDigitalSplit.digital, color: '#14b8a6' }
  ].filter((d) => d.value > 0)

  return (
    <div className="p-4 space-y-4 overflow-y-auto pos-scroll h-[calc(100vh-3.5rem)]">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Dashboard</h1>
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

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard icon={DollarSign} label={range === 'today' ? "Today's Sales" : 'Total Sales'} value={fmt(data.todaySales.total)} sub={`${data.todaySales.count} transactions`} color="teal" />
        <KpiCard icon={Wallet} label="Cash" value={fmt(data.cashDigitalSplit.cash)} sub={`${pieData.length ? Math.round((data.cashDigitalSplit.cash / (data.cashDigitalSplit.cash + data.cashDigitalSplit.digital || 1)) * 100) : 0}% of total`} color="emerald" />
        <KpiCard icon={DollarSign} label="Digital" value={fmt(data.cashDigitalSplit.digital)} sub={`${pieData.length ? Math.round((data.cashDigitalSplit.digital / (data.cashDigitalSplit.cash + data.cashDigitalSplit.digital || 1)) * 100) : 0}% of total`} color="cyan" />
        <KpiCard icon={TrendingUp} label="Best Category" value={data.bestCategory?.name ?? '—'} sub={data.bestCategory ? fmt(data.bestCategory.total) : 'No sales yet'} color="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Hourly trend */}
        <Card className="lg:col-span-2 bg-slate-900/60 border-slate-800 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold flex items-center gap-2"><BarChart3 className="w-4 h-4 text-teal-400" /> {range === 'today' ? 'Hourly Sales Trend' : 'Daily Sales Trend'}</h3>
            <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700">8:00 – 22:00</Badge>
          </div>
          {data.hourlyTrend.some((h) => h.total > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.hourlyTrend}>
                <defs>
                  <linearGradient id="g1" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#14b8a6" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="#14b8a6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="hour" stroke="#64748b" fontSize={10} interval={2} />
                <YAxis stroke="#64748b" fontSize={10} />
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="total" stroke="#14b8a6" strokeWidth={2} fill="url(#g1)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyChart label="No sales yet today" />}
        </Card>

        {/* Cash vs Digital */}
        <Card className="bg-slate-900/60 border-slate-800 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Wallet className="w-4 h-4 text-teal-400" /> Cash vs Digital</h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2}>
                  {pieData.map((d, i) => <Cell key={i} fill={d.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyChart label="No sales yet" />}
          {pieData.length > 0 && (
            <div className="flex justify-center gap-4 mt-2">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-slate-400">{d.name}</span>
                  <span className="font-medium">{fmt(d.value)}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Top products */}
        <Card className="bg-slate-900/60 border-slate-800 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Package className="w-4 h-4 text-teal-400" /> Top Products Today</h3>
          {data.topProducts.length > 0 ? (
            <div className="space-y-2">
              {data.topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400">{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-500">{p.qty} sold</div>
                  </div>
                  <div className="text-sm font-semibold text-teal-400">{fmt(p.total)}</div>
                </div>
              ))}
            </div>
          ) : <EmptyChart label="No sales yet today" />}
        </Card>

        {/* Low stock alerts */}
        <Card className="bg-slate-900/60 border-slate-800 p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Low Stock Alerts</h3>
          {data.lowStock.length > 0 ? (
            <div className="space-y-2 max-h-48 overflow-y-auto pos-scroll">
              {data.lowStock.map((p) => (
                <div key={p.id} className="flex items-center justify-between p-2 rounded-md bg-slate-950/60 border border-slate-800">
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-slate-500">Threshold: {p.threshold}</div>
                  </div>
                  <Badge variant="outline" className="bg-red-500/15 text-red-300 border-red-500/30 text-[10px]">{p.stock} left</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-6 text-emerald-400">
              <CheckCircle2 className="w-8 h-8 mb-1" />
              <p className="text-xs text-slate-400">All products well stocked</p>
            </div>
          )}
        </Card>
      </div>

      {/* End of Day summary */}
      <Card className="bg-slate-900/60 border-slate-800 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><Receipt className="w-4 h-4 text-teal-400" /> End of Day Summary</h3>
          <Button variant="outline" size="sm" onClick={() => {
            const w = window.open('', '_blank', 'width=600,height=800')
            if (!w) { toasts.error('Pop-up blocked'); return }
            const d = data
            w.document.write(`<!doctype html><html><head><title>EOD Summary ${new Date().toLocaleDateString()}</title>
              <style>
                * { font-family: Arial, sans-serif; box-sizing: border-box; }
                body { padding: 20px; color: #1e293b; }
                h1 { font-size: 18px; margin: 0 0 4px; }
                h2 { font-size: 14px; margin: 16px 0 8px; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px; }
                .muted { color: #64748b; font-size: 12px; margin: 0 0 16px; }
                .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
                .total { font-weight: bold; font-size: 16px; border-top: 2px solid #1e293b; margin-top: 8px; padding-top: 8px; }
                table { width: 100%; border-collapse: collapse; font-size: 12px; }
                th { text-align: left; border-bottom: 1px solid #cbd5e1; padding: 4px; }
                td { padding: 4px; }
              </style></head><body>
              <h1>${settings.shopName || 'POS App'}</h1>
              <p class="muted">End of Day Summary · ${new Date().toLocaleString()}</p>
              <h2>Sales</h2>
              <div class="row"><span>Total sales</span><span>${d.todaySales.count}</span></div>
              <div class="row"><span>Total revenue</span><span>${fmt(d.todaySales.total)}</span></div>
              <div class="row"><span>Cash</span><span>${fmt(d.cashDigitalSplit.cash)}</span></div>
              <div class="row"><span>Digital</span><span>${fmt(d.cashDigitalSplit.digital)}</span></div>
              ${d.bestCategory ? `<div class="row"><span>Best category</span><span>${d.bestCategory.name} (${fmt(d.bestCategory.total)})</span></div>` : ''}
              <h2>Top Products</h2>
              <table><thead><tr><th>Product</th><th>Qty</th><th>Revenue</th></tr></thead><tbody>
              ${d.topProducts.map((p) => `<tr><td>${p.name}</td><td>${p.qty}</td><td>${fmt(p.total)}</td></tr>`).join('') || '<tr><td colspan=3>No sales</td></tr>'}
              </tbody></table>
              ${d.lowStock.length > 0 ? `<h2>Low Stock</h2><table><thead><tr><th>Product</th><th>Stock</th><th>Threshold</th></tr></thead><tbody>${d.lowStock.map((p) => `<tr><td>${p.name}</td><td>${p.stock}</td><td>${p.threshold}</td></tr>`).join('')}</tbody></table>` : ''}
              <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 500) }</script>
              </body></html>`)
            w.document.close()
          }} className="border-slate-700 text-slate-300 h-8">
            <Printer className="w-3.5 h-3.5 mr-1" /> Print Summary
          </Button>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
          <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Sales</div>
            <div className="font-bold text-slate-200">{data.todaySales.count}</div>
          </div>
          <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Revenue</div>
            <div className="font-bold text-teal-400">{fmt(data.todaySales.total)}</div>
          </div>
          <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Low stock</div>
            <div className={`font-bold ${data.lowStock.length > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>{data.lowStock.length}</div>
          </div>
          <div className="bg-slate-950/60 rounded-lg p-2.5 border border-slate-800">
            <div className="text-[10px] text-slate-500 uppercase">Top product</div>
            <div className="font-bold text-slate-200 truncate text-xs">{data.topProducts[0]?.name ?? '—'}</div>
          </div>
        </div>
      </Card>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, sub, color }: { icon: React.ElementType; label: string; value: string; sub: string; color: string }) {
  const colors: Record<string, string> = {
    teal: 'text-teal-400 bg-teal-500/10',
    emerald: 'text-emerald-400 bg-emerald-500/10',
    cyan: 'text-cyan-400 bg-cyan-500/10',
    amber: 'text-amber-400 bg-amber-500/10'
  }
  return (
    <Card className="bg-slate-900/60 border-slate-800 p-4 hover:border-slate-700 transition-colors">
      <div className="flex items-start justify-between mb-2">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className="text-[11px] text-slate-500 uppercase tracking-wide mb-1">{label}</div>
      <div className="text-lg font-bold tabular-nums truncate">{value}</div>
      <div className="text-[11px] text-slate-500 mt-0.5">{sub}</div>
    </Card>
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

/* ============ HISTORY ============ */
function HistoryScreen() {
  const [sales, setSales] = useState<Sale[]>([])
  const [filter, setFilter] = useState<'all' | 'today' | 'cash' | 'digital' | 'voided'>('today')
  const [selected, setSelected] = useState<Sale | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    const [s, st] = await Promise.all([window.pos.getSales(500), window.pos.getSettings()])
    setSales(s)
    setSettings(st)
  }, [])
  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    let list = sales
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0)
    if (filter === 'today') list = list.filter((s) => new Date(s.createdAt) >= todayStart)
    if (filter === 'cash') list = list.filter((s) => s.paymentMethod === 'cash' && !s.voided)
    if (filter === 'digital') list = list.filter((s) => s.paymentMethod === 'digital' && !s.voided)
    if (filter === 'voided') list = list.filter((s) => s.voided)
    return list
  }, [sales, filter])

  // Totals exclude voided sales (audit trail kept but not counted in revenue)
  const activeSales = filtered.filter((s) => !s.voided)
  const total = activeSales.reduce((s, x) => s + x.total, 0)
  const cashTotal = activeSales.filter((s) => s.paymentMethod === 'cash').reduce((s, x) => s + x.actualPaidPrice, 0)
  const digitalTotal = activeSales.filter((s) => s.paymentMethod === 'digital').reduce((s, x) => s + x.actualPaidPrice, 0)
  const avgSale = activeSales.length > 0 ? total / activeSales.length : 0
  const voidedCount = sales.filter((s) => s.voided).length

  const handleExportCsv = () => {
    if (filtered.length === 0) { toasts.error('No sales to export'); return }
    const rows = [
      ['Receipt ID', 'Date', 'Time', 'Items', 'Total', 'Paid', 'Payment Method', ...Array.from({ length: 10 }, (_, i) => `Item ${i + 1} Name`), ...Array.from({ length: 10 }, (_, i) => `Item ${i + 1} Qty`), ...Array.from({ length: 10 }, (_, i) => `Item ${i + 1} Total`)]
    ]
    for (const s of filtered) {
      const d = new Date(s.createdAt)
      const row = [
        s.id.slice(0, 8).toUpperCase(),
        d.toLocaleDateString('en-GB'),
        d.toLocaleTimeString('en-GB'),
        String(s.items.length),
        s.total.toFixed(2),
        s.actualPaidPrice.toFixed(2),
        s.paymentMethod
      ]
      for (let i = 0; i < 10; i++) {
        const it = s.items[i]
        row.push(it?.name ?? '', it ? String(it.quantity) : '', it ? it.lineTotal.toFixed(2) : '')
      }
      rows.push(row)
    }
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales-${filter}-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toasts.success(`Exported ${filtered.length} sales to CSV`)
  }

  return (
    <div className="p-4 space-y-3 h-[calc(100vh-3.5rem)] overflow-y-auto pos-scroll">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold">Sale History</h1>
          <p className="text-xs text-slate-500">{filtered.length} sales · total {fmt(total)}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {(['today', 'all', 'cash', 'digital', 'voided'] as const).map((f) => (
              <Button key={f} size="sm" variant={filter === f ? 'default' : 'outline'} className={`text-xs h-8 ${filter === f ? (f === 'voided' ? 'bg-red-500 text-white' : 'bg-teal-500 text-teal-950') : 'border-slate-700 text-slate-300'}`} onClick={() => setFilter(f)}>
                {f.charAt(0).toUpperCase() + f.slice(1)}{f === 'voided' && voidedCount > 0 ? ` (${voidedCount})` : ''}
              </Button>
            ))}
          </div>
          <Button size="sm" variant="outline" onClick={handleExportCsv} className="border-slate-700 text-slate-300 h-8" title="Export to CSV">
            <Download className="w-3.5 h-3.5 mr-1" /> CSV
          </Button>
        </div>
      </div>

      {/* Summary stats */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Total</div>
            <div className="text-base font-bold text-teal-400 tabular-nums">{fmt(total)}</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Cash</div>
            <div className="text-base font-bold text-emerald-400 tabular-nums">{fmt(cashTotal)}</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Digital</div>
            <div className="text-base font-bold text-cyan-400 tabular-nums">{fmt(digitalTotal)}</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5">
            <div className="text-[10px] text-slate-500 uppercase tracking-wide">Avg Sale</div>
            <div className="text-base font-bold text-amber-400 tabular-nums">{fmt(avgSale)}</div>
          </div>
        </div>
      )}

      <Card className="bg-slate-900/60 border-slate-800">
        <ScrollArea className="max-h-[60vh] pos-scroll">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-slate-500">
              <History className="w-8 h-8 mb-1 opacity-40" />
              <p className="text-xs">No sales found</p>
              <p className="text-[10px] text-slate-600 mt-1">Sales will appear here after you confirm orders in Billing</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {filtered.map((s) => (
                <button key={s.id} onClick={() => setSelected(s)} className={`w-full text-left p-3 hover:bg-slate-800/40 transition-colors flex items-center gap-3 ${s.voided ? 'opacity-50' : ''}`}>
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${s.voided ? 'bg-red-500/15 text-red-400' : s.paymentMethod === 'cash' ? 'bg-emerald-500/15 text-emerald-400' : 'bg-teal-500/15 text-teal-400'}`}>
                    {s.voided ? <XCircle className="w-4 h-4" /> : s.paymentMethod === 'cash' ? <Wallet className="w-4 h-4" /> : <DollarSign className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-slate-400">#{s.id.slice(0, 8).toUpperCase()}</span>
                      <Badge variant="outline" className="text-[9px] border-slate-700 text-slate-400">{s.items.length} items</Badge>
                      {s.voided && <Badge variant="outline" className="text-[9px] bg-red-500/15 text-red-300 border-red-500/30">VOIDED</Badge>}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {new Date(s.createdAt).toLocaleString()}
                      {s.voided && s.voidedAt && <span className="text-red-400"> · voided {new Date(s.voidedAt).toLocaleTimeString()}</span>}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className={`font-bold ${s.voided ? 'text-red-400 line-through' : 'text-teal-400'}`}>{fmt(s.total)}</div>
                    <div className="text-[10px] text-slate-500 capitalize">{s.paymentMethod}</div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-600" />
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </Card>

      {selected && <ReceiptPreviewDialog sale={selected} settings={settings} onClose={() => setSelected(null)} onVoid={selected.voided ? undefined : async () => {
        const ok = await window.pos.voidSale(selected.id)
        if (ok) {
          toasts.success(`Sale #${selected.id.slice(0, 8).toUpperCase()} voided — stock restored`)
          setSelected(null)
          await load()
        } else {
          toasts.error('Could not void sale — it may already be voided')
        }
      }} />}
    </div>
  )
}

/* ============ PRODUCTS ============ */
function ProductsScreen() {
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [editProduct, setEditProduct] = useState<Product | 'new' | null>(null)
  const [restockProduct, setRestockProduct] = useState<Product | null>(null)
  const [deleteProduct, setDeleteProduct] = useState<Product | null>(null)
  const [categoryModal, setCategoryModal] = useState(false)
  const [activeCategoryFilter, setActiveCategoryFilter] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [p, c, sm] = await Promise.all([window.pos.getProducts(), window.pos.getCategories(), window.pos.getStockLevels()])
    setProducts(p); setCategories(c); setStockMap(sm)
  }, [])
  useEffect(() => { void load() }, [load])

  let filtered = products
  if (activeCategoryFilter) filtered = filtered.filter((p) => p.categoryId === activeCategoryFilter)
  if (search.trim()) {
    const q = search.toLowerCase()
    filtered = filtered.filter((p) =>
      p.name.toLowerCase().includes(q) ||
      p.sku?.toLowerCase().includes(q) ||
      p.barcode?.toLowerCase().includes(q)
    )
  }

  const handleDelete = async () => {
    if (!deleteProduct) return
    await window.pos.deleteProduct(deleteProduct.id)
    toasts.success(`Deleted: ${deleteProduct.name}`)
    setDeleteProduct(null)
    await load()
  }

  return (
    <div className="p-4 space-y-3 h-[calc(100vh-3.5rem)] overflow-y-auto pos-scroll">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">Products</h1>
          <p className="text-xs text-slate-500">{products.length} products · {categories.length} categories</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setCategoryModal(true)} className="border-slate-700 text-slate-300">
            <Tag className="w-4 h-4 mr-1" /> Categories
          </Button>
          <Button onClick={() => setEditProduct('new')} className="bg-teal-500 text-teal-950 hover:bg-teal-400">
            <Plus className="w-4 h-4 mr-1" /> Add Product
          </Button>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…" className="pl-9 bg-slate-900 border-slate-800" />
      </div>

      {/* Category filter chips */}
      <div className="flex items-center gap-1.5 overflow-x-auto pos-scroll-hide pb-1">
        <button
          onClick={() => setActiveCategoryFilter(null)}
          className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${activeCategoryFilter === null ? 'bg-teal-500 text-teal-950' : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700'}`}
        >
          All ({products.length})
        </button>
        {categories.map((c) => {
          const count = products.filter((p) => p.categoryId === c.id).length
          return (
            <button
              key={c.id}
              onClick={() => setActiveCategoryFilter(c.id)}
              className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-all ${activeCategoryFilter === c.id ? 'bg-teal-500 text-teal-950' : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700'}`}
            >
              {c.name} ({count})
            </button>
          )
        })}
      </div>

      <Card className="bg-slate-900/60 border-slate-800">
        <div className="divide-y divide-slate-800">
          {filtered.length === 0 ? (
            <div className="py-10 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <Package className="w-8 h-8 opacity-40" />
              No products found
            </div>
          ) : filtered.map((p) => {
            const stock = stockMap[p.id] ?? 0
            const cat = categories.find((c) => c.id === p.categoryId)
            const low = stock < p.lowStockThreshold && p.lowStockThreshold > 0
            return (
              <div key={p.id} className="p-3 flex items-center gap-3 hover:bg-slate-800/30">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold ${avatarColor(p.name)}`}>
                  {initials(p.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">{p.name}</div>
                  <div className="flex items-center gap-2 text-[10px] text-slate-500">
                    {cat && <span className={`px-1.5 py-0.5 rounded border ${cat.color}`}>{cat.name}</span>}
                    {p.sku && <span className="font-mono">{p.sku}</span>}
                    {p.barcode && <span className="font-mono">{p.barcode}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-semibold text-sm">{fmt(p.defaultPrice)}</div>
                  <Badge variant="outline" className={`text-[10px] ${low ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'}`}>
                    {stock} {p.unitType === 'thaan' ? 'm' : 'pcs'}
                  </Badge>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-teal-400" onClick={() => setRestockProduct(p)} title="Adjust stock">
                    <PackagePlus className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-teal-400" onClick={() => setEditProduct(p)} title="Edit">
                    <Edit3 className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-400 hover:text-red-400" onClick={() => setDeleteProduct(p)} title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {editProduct && <ProductDialog product={editProduct === 'new' ? null : editProduct} categories={categories} onClose={() => setEditProduct(null)} onDone={async () => { await load(); setEditProduct(null) }} />}
      {restockProduct && <RestockDialog product={restockProduct} onClose={() => setRestockProduct(null)} onDone={async () => { await load(); setRestockProduct(null) }} />}
      {deleteProduct && (
        <Dialog open onOpenChange={(o) => { if (!o) setDeleteProduct(null) }}>
          <DialogContent className="bg-slate-900 border-slate-800 max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-400" /> Delete Product</DialogTitle>
              <DialogDescription className="text-slate-400">
                Are you sure you want to delete <span className="font-semibold text-slate-200">{deleteProduct.name}</span>? This cannot be undone. Stock history will be preserved.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDeleteProduct(null)} className="border-slate-700">Cancel</Button>
              <Button onClick={handleDelete} className="bg-red-500 text-white hover:bg-red-600">
                <Trash2 className="w-4 h-4 mr-1" /> Delete
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {categoryModal && <CategoryDialog categories={categories} onClose={() => setCategoryModal(false)} onDone={async () => { await load(); setCategoryModal(false) }} />}
    </div>
  )
}

/* ============ CATEGORY DIALOG ============ */
function CategoryDialog({ categories, onClose, onDone }: { categories: Category[]; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleAdd = async () => {
    if (!name.trim()) { toasts.error('Name required'); return }
    setSubmitting(true)
    try {
      await window.pos.createCategory(name.trim())
      toasts.success(`Category "${name.trim()}" added`)
      setName('')
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Tag className="w-4 h-4 text-teal-400" /> Manage Categories</DialogTitle>
          <DialogDescription className="text-slate-400">Add product categories to organize your catalog.</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Category name" className="bg-slate-950 border-slate-700" onKeyDown={(e) => e.key === 'Enter' && handleAdd()} />
          <Button onClick={handleAdd} disabled={submitting} className="bg-teal-500 text-teal-950 hover:bg-teal-400">
            <Plus className="w-4 h-4" /> Add
          </Button>
        </div>
        <Separator className="bg-slate-800" />
        <div className="space-y-1.5 max-h-60 overflow-y-auto pos-scroll">
          {categories.length === 0 ? (
            <p className="text-xs text-slate-600 py-4 text-center">No categories yet</p>
          ) : categories.map((c) => {
            const count = usePosStore.getState().products.filter((p) => p.categoryId === c.id).length
            return (
              <div key={c.id} className="flex items-center justify-between p-2 rounded-md bg-slate-950/60 border border-slate-800">
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-0.5 rounded text-xs border ${c.color || 'bg-slate-700/40 text-slate-300 border-slate-600'}`}>{c.name}</span>
                </div>
                <Badge variant="outline" className="text-[10px] text-slate-400 border-slate-700">{count} products</Badge>
              </div>
            )
          })}
        </div>
        <DialogFooter>
          <Button onClick={onClose} className="bg-teal-500 text-teal-950 hover:bg-teal-400">Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ProductDialog({ product, categories, onClose, onDone }: { product: Product | null; categories: Category[]; onClose: () => void; onDone: () => void | Promise<void> }) {
  const [name, setName] = useState(product?.name ?? '')
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '')
  const [unitType, setUnitType] = useState<'piece' | 'thaan'>(product?.unitType ?? 'piece')
  const [price, setPrice] = useState(String(product?.defaultPrice ?? ''))
  const [barcode, setBarcode] = useState(product?.barcode ?? '')
  const [sku, setSku] = useState(product?.sku ?? '')
  const [threshold, setThreshold] = useState(String(product?.lowStockThreshold ?? 5))
  const [initialStock, setInitialStock] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submit = async () => {
    if (!name.trim()) { toasts.error('Name required'); return }
    if (!categoryId) { toasts.error('Category required'); return }
    setSubmitting(true)
    try {
      if (product) {
        await window.pos.updateProduct(product.id, {
          name, categoryId, unitType, defaultPrice: parseFloat(price) || 0,
          barcode: barcode || null, sku: sku || null, lowStockThreshold: parseInt(threshold) || 5
        })
        toasts.success('Product updated')
      } else {
        await window.pos.createProduct({
          name, categoryId, unitType, defaultPrice: parseFloat(price) || 0,
          barcode: barcode || null, sku: sku || null, lowStockThreshold: parseInt(threshold) || 5,
          initialStock: parseFloat(initialStock) || 0
        })
        toasts.success('Product created')
      }
      await onDone()
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose() }}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Package className="w-4 h-4 text-teal-400" /> {product ? 'Edit Product' : 'New Product'}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} className="bg-slate-950 border-slate-700" autoFocus />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Category</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Unit type</Label>
            <Select value={unitType} onValueChange={(v: 'piece' | 'thaan') => setUnitType(v)}>
              <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="piece">Piece</SelectItem>
                <SelectItem value="thaan">Thaan (meter)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Default price</Label>
            <Input type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="bg-slate-950 border-slate-700 font-mono" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Low-stock threshold</Label>
            <Input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} className="bg-slate-950 border-slate-700 font-mono" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">SKU</Label>
            <Input value={sku} onChange={(e) => setSku(e.target.value)} className="bg-slate-950 border-slate-700 font-mono" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Barcode</Label>
            <Input value={barcode} onChange={(e) => setBarcode(e.target.value)} className="bg-slate-950 border-slate-700 font-mono" />
          </div>
          {!product && (
            <div className="col-span-2 space-y-1">
              <Label className="text-xs">Initial stock (optional)</Label>
              <Input type="number" step="0.1" value={initialStock} onChange={(e) => setInitialStock(e.target.value)} className="bg-slate-950 border-slate-700 font-mono" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="border-slate-700">Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="bg-teal-500 text-teal-950 hover:bg-teal-400">
            {submitting ? 'Saving…' : product ? 'Save Changes' : 'Create Product'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ============ SHIFTS ============ */
function ShiftsScreen() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [openShift, setOpenShift] = useState<Shift | null>(null)
  const [modal, setModal] = useState<'open' | 'close' | null>(null)
  const [sales, setSales] = useState<Sale[]>([])

  const load = useCallback(async () => {
    const [list, open, s] = await Promise.all([window.pos.getShifts(), window.pos.getOpenShift('till-1'), window.pos.getSales(500)])
    setShifts(list); setOpenShift(open); setSales(s)
  }, [])
  useEffect(() => { void load() }, [load])

  // Compute live expected cash for the open shift = opening + cash sales during this shift
  const liveExpectedCash = useMemo(() => {
    if (!openShift) return undefined
    const cashSales = sales.filter((s) => s.shiftId === openShift.id && s.paymentMethod === 'cash').reduce((sum, s) => sum + s.actualPaidPrice, 0)
    return openShift.openingCash + cashSales
  }, [openShift, sales])

  return (
    <div className="p-4 space-y-3 h-[calc(100vh-3.5rem)] overflow-y-auto pos-scroll">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">Shifts</h1>
          <p className="text-xs text-slate-500">Till 1 · reconciliation</p>
        </div>
        {openShift ? (
          <Button onClick={() => setModal('close')} variant="outline" className="border-red-700 text-red-400 hover:bg-red-950/30">
            <XCircle className="w-4 h-4 mr-1" /> Close Shift
          </Button>
        ) : (
          <Button onClick={() => setModal('open')} className="bg-teal-500 text-teal-950 hover:bg-teal-400">
            <Clock className="w-4 h-4 mr-1" /> Open Shift
          </Button>
        )}
      </div>

      {openShift && (
        <Card className="bg-teal-500/5 border-teal-500/30 p-4">
          <div className="flex items-center gap-2 mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-400 pos-pulse" />
            <span className="text-sm font-semibold text-teal-300">Shift Open</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div><div className="text-slate-500">Opened</div><div className="font-medium">{new Date(openShift.openedAt).toLocaleString()}</div></div>
            <div><div className="text-slate-500">Opening cash</div><div className="font-medium text-teal-400">{fmt(openShift.openingCash)}</div></div>
            <div><div className="text-slate-500">Expected cash</div><div className="font-medium text-emerald-400">{liveExpectedCash !== undefined ? fmt(liveExpectedCash) : '—'}</div></div>
            <div><div className="text-slate-500">Duration</div><div className="font-medium">{Math.round((Date.now() - new Date(openShift.openedAt).getTime()) / 60000)} min</div></div>
          </div>
        </Card>
      )}

      <Card className="bg-slate-900/60 border-slate-800">
        <div className="p-3 border-b border-slate-800 text-sm font-semibold">Shift History</div>
        {shifts.length === 0 ? (
          <div className="py-10 text-center text-slate-500 text-xs">No shifts recorded</div>
        ) : (
          <div className="divide-y divide-slate-800">
            {shifts.map((s) => {
              const variance = s.closingCash !== null && s.expectedCash !== null ? s.closingCash - s.expectedCash : null
              return (
                <div key={s.id} className="p-3 grid grid-cols-6 gap-2 items-center text-xs">
                  <div><div className="text-slate-500">Opened</div><div className="font-medium">{new Date(s.openedAt).toLocaleString()}</div></div>
                  <div><div className="text-slate-500">Closed</div><div className="font-medium">{s.closedAt ? new Date(s.closedAt).toLocaleString() : '—'}</div></div>
                  <div><div className="text-slate-500">Opening</div><div className="font-medium font-mono">{fmt(s.openingCash)}</div></div>
                  <div><div className="text-slate-500">Expected</div><div className="font-medium font-mono">{s.expectedCash !== null ? fmt(s.expectedCash) : '—'}</div></div>
                  <div><div className="text-slate-500">Counted</div><div className="font-medium font-mono">{s.closingCash !== null ? fmt(s.closingCash) : '—'}</div></div>
                  <div><div className="text-slate-500">Variance</div><div className={`font-medium font-mono ${variance === null ? '' : variance < 0 ? 'text-red-400' : 'text-emerald-400'}`}>{variance === null ? '—' : fmt(variance)}</div></div>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      {modal && (
        <ShiftDialog
          mode={modal}
          shiftId={openShift?.id}
          openingCash={openShift?.openingCash}
          expectedCash={liveExpectedCash}
          onClose={() => setModal(null)}
          onDone={async () => { await load(); setModal(null) }}
        />
      )}
    </div>
  )
}

type Shift = { id: string; tillId: string; openingCash: number; closingCash: number | null; expectedCash: number | null; openedAt: string; closedAt: string | null }

/* ============ SETTINGS ============ */
function SettingsScreen({ settings, onSettingsChanged }: { settings: Record<string, string>; onSettingsChanged: () => Promise<void> }) {
  const [machineId, setMachineId] = useState('')
  const [licenseStatus, setLicenseStatus] = useState<any>(null)
  const [licenseKey, setLicenseKey] = useState('')
  const [feedback, setFeedback] = useState('')

  useEffect(() => {
    void (async () => {
      setMachineId(await window.pos.getMachineId())
      setLicenseStatus(await window.pos.getLicenseStatus())
    })()
  }, [settings])

  const update = async (key: string, value: string) => {
    await window.pos.setSetting(key, value)
    await onSettingsChanged()
    toasts.success('Setting saved')
  }

  const activate = async () => {
    if (!licenseKey.trim()) { toasts.error('Enter a license key'); return }
    const r = await window.pos.activateLicense(licenseKey.trim())
    if (r.ok) { toasts.success('License activated'); setLicenseKey(''); await onSettingsChanged() }
    else toasts.error(`Invalid: ${r.error}`)
  }

  return (
    <div className="p-4 space-y-3 h-[calc(100vh-3.5rem)] overflow-y-auto pos-scroll max-w-3xl mx-auto">
      <h1 className="text-xl font-bold">Settings</h1>

      <Card className="bg-slate-900/60 border-slate-800 p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Store className="w-4 h-4 text-teal-400" /> Shop</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Shop name</Label>
            <Input defaultValue={settings.shopName} onBlur={(e) => update('shopName', e.target.value)} className="bg-slate-950 border-slate-700" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Currency</Label>
            <Select defaultValue={settings.currency || 'PKR'} onValueChange={(v) => update('currency', v)}>
              <SelectTrigger className="bg-slate-950 border-slate-700"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="PKR">PKR — Pakistani Rupee</SelectItem>
                <SelectItem value="USD">USD — US Dollar</SelectItem>
                <SelectItem value="EUR">EUR — Euro</SelectItem>
                <SelectItem value="GBP">GBP — British Pound</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-xs">Tax rate (%)</Label>
            <Input type="number" step="0.1" defaultValue={settings.taxRate || '0'} onBlur={(e) => update('taxRate', e.target.value)} className="bg-slate-950 border-slate-700 font-mono" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Receipt footer</Label>
            <Input defaultValue={settings.receiptFooter || ''} onBlur={(e) => update('receiptFooter', e.target.value)} className="bg-slate-950 border-slate-700" />
          </div>
        </div>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800 p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><SettingsIcon className="w-4 h-4 text-teal-400" /> Features</h3>
        <ToggleRow label="Barcode scanner" desc="Listen for USB HID scanner input" checked={settings.barcodeEnabled === 'true'} onChange={(v) => update('barcodeEnabled', String(v))} />
        <ToggleRow label="Till reconciliation" desc="Require shift open/close with cash counting" checked={settings.tillReconciliationEnabled === 'true'} onChange={(v) => update('tillReconciliationEnabled', String(v))} />
        <ToggleRow label="Auto-backup" desc="Daily SQLite backup to backup folder" checked={settings.autoBackup === 'true'} onChange={(v) => update('autoBackup', String(v))} />
      </Card>

      <Card className="bg-slate-900/60 border-slate-800 p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Printer className="w-4 h-4 text-teal-400" /> Printer</h3>
        <div className="space-y-1">
          <Label className="text-xs">Printer name (as OS sees it)</Label>
          <Input defaultValue={settings.printerName} onBlur={(e) => update('printerName', e.target.value)} className="bg-slate-950 border-slate-700 font-mono" placeholder="EPSON_TM_T20III" />
        </div>
        <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={async () => { const r = await window.pos.backupDatabase(); r.ok ? toasts.success('Backup downloaded') : toasts.error(r.error || 'Failed') }}>
          <Download className="w-3.5 h-3.5 mr-1" /> Backup Database
        </Button>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800 p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><Shield className="w-4 h-4 text-teal-400" /> License</h3>
        <div className="text-xs space-y-1">
          <div className="flex justify-between"><span className="text-slate-500">Machine ID</span><code className="text-slate-400 font-mono text-[10px]">{machineId}</code></div>
          <div className="flex justify-between"><span className="text-slate-500">Status</span>
            {licenseStatus?.state === 'valid' && <span className="text-emerald-400">Valid · {licenseStatus.daysRemaining}d left</span>}
            {licenseStatus?.state === 'grace' && <span className="text-amber-400">Grace · {licenseStatus.daysRemaining}d</span>}
            {licenseStatus?.state === 'expired' && <span className="text-red-400">Expired</span>}
            {licenseStatus?.state === 'none' && <span className="text-slate-400">Trial mode</span>}
          </div>
        </div>
        <Textarea value={licenseKey} onChange={(e) => setLicenseKey(e.target.value)} placeholder="Paste license key…" className="bg-slate-950 border-slate-700 font-mono text-xs" rows={2} />
        <Button onClick={activate} className="bg-teal-500 text-teal-950 hover:bg-teal-400"><Shield className="w-4 h-4 mr-1" /> Activate</Button>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800 p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><StickyNote className="w-4 h-4 text-teal-400" /> Feedback</h3>
        <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="Tell us what's working or what's broken…" className="bg-slate-950 border-slate-700" rows={3} />
        <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" disabled={!feedback.trim()} onClick={async () => { await window.pos.submitFeedback({ message: feedback, rating: 5 }); toasts.success('Feedback submitted'); setFeedback('') }}>
          Submit Feedback
        </Button>
      </Card>

      <Card className="bg-slate-900/60 border-slate-800 p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Data Management</h3>
        <div className="text-xs text-slate-500">
          Reset all data and restore demo products, or clear everything to start fresh. These actions cannot be undone.
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" className="border-slate-700 text-slate-300" onClick={async () => {
            usePosStore.getState().resetAll()
            await onSettingsChanged()
            toasts.success('Demo data restored — 12 products across 4 categories')
          }}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Restore Demo Data
          </Button>
          <Button variant="outline" size="sm" className="border-red-800 text-red-400 hover:bg-red-950/30" onClick={async () => {
            if (!confirm('Clear ALL sales, shifts, and held carts? Products and categories are kept. This cannot be undone.')) return
            usePosStore.setState({ sales: [], shifts: [], heldCarts: [], errorLogs: [], feedback: [] })
            await onSettingsChanged()
            toasts.success('All transaction data cleared')
          }}>
            <Trash2 className="w-3.5 h-3.5 mr-1" /> Clear Transactions
          </Button>
        </div>
        <Separator className="bg-slate-800" />
        <div className="text-[10px] text-slate-600 font-mono">
          Storage: localStorage · ~{Math.round((JSON.stringify(usePosStore.getState()).length / 1024))}KB used
        </div>
      </Card>
    </div>
  )
}

function ToggleRow({ label, desc, checked, onChange }: { label: string; desc: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-[11px] text-slate-500">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function Loading() {
  return (
    <div className="h-[calc(100vh-3.5rem)] flex items-center justify-center">
      <div className="w-8 h-8 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin" />
    </div>
  )
}
