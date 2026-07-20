// api/stats.ts — Vercel serverless function (Node).
// Reads all-shops stats from Supabase using the SERVICE ROLE key (server-side only).
// Never expose any key to the browser. Aggregates in JS keyed by shop_id.
import { createClient } from '@supabase/supabase-js'
import { requireBasicAuth } from './auth'

// --- Silence the Supabase "native WebSocket not found" banner. ---
// We only use the REST client (no realtime subscriptions), so a stub global
// WebSocket is enough to satisfy supabase-js on Node < 22 without adding `ws`.
if (typeof (globalThis as any).WebSocket === 'undefined') {
  ;(globalThis as any).WebSocket = class {
    constructor() { /* never instantiated: we don't open realtime sockets */ }
    close() {}
    addEventListener() {}
    removeEventListener() {}
    send() {}
  } as any
}

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!requireBasicAuth(req, res)) return
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Server misconfigured: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY env vars missing.' })
    return
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    })

    // --- Fetch raw rows (paginated) ---
    const shopsRes = await supabase.from('shops').select('id, name, currency, created_at')
    if (shopsRes.error) throw new Error(`shops: ${shopsRes.error.message}`)

    const shops = (shopsRes.data || []) as Array<{ id: string; name: string; currency: string; created_at: string }>
    const shopName = new Map(shops.map((s) => [s.id, s.name]))
    const shopCurrency = new Map(shops.map((s) => [s.id, s.currency || 'Rs']))

    const fetchAll = async (table: string, columns: string) => {
      const out: any[] = []
      let from = 0
      const PAGE = 1000
      for (;;) {
        const { data, error } = await supabase
          .from(table)
          .select(columns)
          .range(from, from + PAGE - 1)
        if (error) throw new Error(`${table}: ${error.message}`)
        const rows = (data || []) as any[]
        out.push(...rows)
        if (rows.length < PAGE) break
        from += PAGE
      }
      return out
    }

    const [sales, products, movements, returns] = await Promise.all([
      fetchAll('sales', 'total, payment_method, created_at, shop_id, items'),
      fetchAll('products', 'id, name, shop_id, active, low_stock_threshold'),
      fetchAll('stock_movements', 'product_id, shop_id, change_amount'),
      fetchAll('returns', 'shop_id, refund_amount')
    ])

    // --- Aggregate (technical / dev view: row counts + DB distribution) ---
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const todayIso = startOfDay.toISOString()

    const blankShop = () => ({
      shopId: '',
      name: '',
      currency: 'Rs',
      salesRows: 0, salesTodayRows: 0,
      products: 0, activeProducts: 0,
      movements: 0, returnsRows: 0
    })
    const byShop = new Map<string, any>()
    const ensure = (id: string) => {
      if (!byShop.has(id)) {
        const s = blankShop()
        s.shopId = id
        s.name = shopName.get(id) || id
        s.currency = shopCurrency.get(id) || 'Rs'
        byShop.set(id, s)
      }
      return byShop.get(id)!
    }

    const globalAgg = {
      shops: shops.length,
      salesRows: 0, salesTodayRows: 0,
      products: 0, activeProducts: 0,
      stockMovements: movements.length,
      returnsRows: returns.length,
      refundTotal: 0,
      totalRows: 0
    }

    for (const s of sales) {
      const sh = ensure(s.shop_id)
      sh.salesRows += 1; globalAgg.salesRows += 1
      if (s.created_at >= todayIso) { sh.salesTodayRows += 1; globalAgg.salesTodayRows += 1 }
    }

    for (const p of products) {
      const sh = ensure(p.shop_id)
      sh.products += 1; globalAgg.products += 1
      if (p.active === 1 || p.active === true) { sh.activeProducts += 1; globalAgg.activeProducts += 1 }
    }

    // per-shop movement counts
    for (const m of movements) {
      ensure(m.shop_id).movements += 1
    }

    for (const r of returns) {
      const sh = ensure(r.shop_id)
      sh.returnsRows += 1; globalAgg.returnsRows += 1
      const amt = Number(r.refund_amount) || 0
      sh.refunds = (sh.refunds || 0) + amt
      globalAgg.refundTotal += amt
    }

    // total rows across all tables (DB footprint proxy)
    globalAgg.totalRows = globalAgg.salesRows + globalAgg.products + globalAgg.stockMovements + globalAgg.returnsRows
    for (const sh of byShop.values()) {
      sh.totalRows = sh.salesRows + sh.products + sh.movements + sh.returnsRows
    }

    const perShop = Array.from(byShop.values()).sort((a, b) => b.totalRows - a.totalRows)

    res.status(200).json({
      generatedAt: new Date().toISOString(),
      global: globalAgg,
      perShop
    })
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) })
  }
}
