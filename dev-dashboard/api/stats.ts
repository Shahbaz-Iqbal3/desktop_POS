// api/stats.ts — Vercel serverless function (Node).
// Reads all-shops stats from Supabase using the SERVICE ROLE key (server-side only).
// Never expose any key to the browser. Aggregates in JS keyed by shop_id.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
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

    // --- Aggregate ---
    const startOfDay = new Date()
    startOfDay.setHours(0, 0, 0, 0)
    const todayIso = startOfDay.toISOString()

    const blankShop = () => ({
      shopId: '',
      name: '',
      currency: 'Rs',
      salesAll: 0, salesAllCount: 0,
      salesToday: 0, salesTodayCount: 0,
      cashAll: 0, digitalAll: 0,
      products: 0, activeProducts: 0, lowStock: 0
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
      salesAll: 0, salesAllCount: 0,
      salesToday: 0, salesTodayCount: 0,
      cashAll: 0, digitalAll: 0,
      products: 0, activeProducts: 0, lowStock: 0,
      stockMovements: movements.length,
      returns: returns.length,
      refundTotal: 0
    }

    for (const s of sales) {
      const sh = ensure(s.shop_id)
      const total = Number(s.total) || 0
      sh.salesAll += total; sh.salesAllCount += 1
      globalAgg.salesAll += total; globalAgg.salesAllCount += 1
      if (s.payment_method === 'cash') { sh.cashAll += total; globalAgg.cashAll += total }
      else { sh.digitalAll += total; globalAgg.digitalAll += total }
      if (s.created_at >= todayIso) { sh.salesToday += total; sh.salesTodayCount += 1; globalAgg.salesToday += total; globalAgg.salesTodayCount += 1 }
    }

    for (const p of products) {
      const sh = ensure(p.shop_id)
      sh.products += 1; globalAgg.products += 1
      if (p.active === 1 || p.active === true) { sh.activeProducts += 1; globalAgg.activeProducts += 1 }
    }

    // low stock: sum movements per product, compare to threshold per shop
    const stockByProduct = new Map<string, number>()
    for (const m of movements) {
      const key = `${m.shop_id}::${m.product_id}`
      stockByProduct.set(key, (stockByProduct.get(key) || 0) + (Number(m.change_amount) || 0))
    }
    const thresholdByProduct = new Map<string, { shop: string; threshold: number; name: string }>()
    for (const p of products) {
      thresholdByProduct.set(p.id, { shop: p.shop_id, threshold: Number(p.low_stock_threshold) || 0, name: p.name })
    }
    const lowStockList: any[] = []
    for (const [pid, info] of thresholdByProduct) {
      const stock = stockByProduct.get(`${info.shop}::${pid}`) || 0
      if (stock < info.threshold) {
        const sh = ensure(info.shop)
        sh.lowStock += 1; globalAgg.lowStock += 1
        lowStockList.push({ shopId: info.shop, shopName: shopName.get(info.shop) || info.shop, product: info.name, stock, threshold: info.threshold })
      }
    }

    for (const r of returns) {
      const sh = ensure(r.shop_id)
      const amt = Number(r.refund_amount) || 0
      sh.refunds = (sh.refunds || 0) + amt
      globalAgg.refundTotal += amt
    }

    const perShop = Array.from(byShop.values()).sort((a, b) => b.salesAll - a.salesAll)

    res.status(200).json({
      generatedAt: new Date().toISOString(),
      global: globalAgg,
      perShop,
      lowStock: lowStockList.sort((a, b) => a.stock - b.stock)
    })
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) })
  }
}
