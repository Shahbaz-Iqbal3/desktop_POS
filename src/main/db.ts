// SQLite data layer — runs in the MAIN PROCESS only.
// The renderer NEVER touches SQLite directly; it goes through IPC.
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync } from 'fs'
import { v4 as uuidv4 } from 'uuid'
import type {
  Sale,
  SaleItem,
  StockMovement,
  Product,
  Category,
  Branch,
  Till,
  Shift,
  Setting
} from '@shared/types'

let db: Database.Database

// ---------- Init ----------

export function initDatabase(): void {
  const userDataPath = app.getPath('userData')
  if (!existsSync(userDataPath)) mkdirSync(userDataPath, { recursive: true })
  const dbPath = join(userDataPath, 'pos.db')
  console.log('[db] opening database at', dbPath)

  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  createSchema()
  seedDefaults()
}

function createSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS tills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      FOREIGN KEY (branch_id) REFERENCES branches(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category_id TEXT NOT NULL,
      sku TEXT,
      barcode TEXT,
      unit_type TEXT NOT NULL DEFAULT 'piece',
      default_price REAL NOT NULL DEFAULT 0,
      low_stock_threshold INTEGER NOT NULL DEFAULT 5,
      created_at TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    );

    -- Stock is NEVER stored as a mutable number on products.
    -- It is always computed by SUM(stock_movements.change_amount).
    CREATE TABLE IF NOT EXISTS stock_movements (
      id TEXT PRIMARY KEY,
      product_id TEXT NOT NULL,
      category TEXT NOT NULL,
      change_amount REAL NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id TEXT PRIMARY KEY,
      branch_id TEXT NOT NULL,
      till_id TEXT NOT NULL,
      shift_id TEXT,
      items TEXT NOT NULL,        -- JSON array of SaleItem
      total REAL NOT NULL,
      actual_paid_price REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (till_id) REFERENCES tills(id)
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      till_id TEXT NOT NULL,
      opening_cash REAL NOT NULL,
      closing_cash REAL,
      expected_cash REAL,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      FOREIGN KEY (till_id) REFERENCES tills(id)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      stack TEXT,
      context TEXT,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      rating INTEGER,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_synced ON sales(synced);
    CREATE INDEX IF NOT EXISTS idx_stock_synced ON stock_movements(synced);
  `)
}

function seedDefaults(): void {
  const now = new Date().toISOString()

  // Default branch
  const branchCount = db.prepare('SELECT COUNT(*) as c FROM branches').get() as { c: number }
  if (branchCount.c === 0) {
    db.prepare('INSERT INTO branches (id, name) VALUES (?, ?)').run(
      'branch-default',
      'Main Branch'
    )
  }

  // Default till
  const tillCount = db.prepare('SELECT COUNT(*) as c FROM tills').get() as { c: number }
  if (tillCount.c === 0) {
    db.prepare('INSERT INTO tills (id, name, branch_id) VALUES (?, ?, ?)').run(
      'till-1',
      'Till 1',
      'branch-default'
    )
  }

  // Default settings (only if not present)
  const defaults: Record<string, string> = {
    shopName: 'My Shop',
    barcodeEnabled: 'false',
    tillReconciliationEnabled: 'false',
    language: 'en',
    printerName: '',
    backupPath: '',
    autoBackup: 'false',
    setupComplete: 'false'
  }
  const insertSetting = db.prepare(
    'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
  )
  for (const [k, v] of Object.entries(defaults)) {
    insertSetting.run(k, v)
  }

  // Seed a few categories + products if empty (for first-run demo)
  const catCount = db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number }
  if (catCount.c === 0) {
    const cats = [
      { id: uuidv4(), name: 'Fabrics', sort: 0 },
      { id: uuidv4(), name: 'Accessories', sort: 1 },
      { id: uuidv4(), name: 'Ready-made', sort: 2 }
    ]
    const insertCat = db.prepare(
      'INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)'
    )
    cats.forEach((c) => insertCat.run(c.id, c.name, c.sort))

    // Seed products + initial stock
    const insertProduct = db.prepare(
      `INSERT INTO products (id, name, category_id, sku, barcode, unit_type, default_price, low_stock_threshold, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const insertMovement = db.prepare(
      `INSERT INTO stock_movements (id, product_id, category, change_amount, reason, created_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, 1)`
    )

    const fabricsId = cats[0].id
    const accessoriesId = cats[1].id

    const seedProducts = [
      { name: 'Cotton Thaan A', cat: fabricsId, unit: 'thaan' as const, price: 1200, stock: 50 },
      { name: 'Silk Thaan B', cat: fabricsId, unit: 'thaan' as const, price: 2500, stock: 30 },
      { name: 'Linen Fabric C', cat: fabricsId, unit: 'thaan' as const, price: 1800, stock: 40 },
      { name: 'Buttons (pack)', cat: accessoriesId, unit: 'piece' as const, price: 50, stock: 100 },
      { name: 'Zipper 12"', cat: accessoriesId, unit: 'piece' as const, price: 20, stock: 200 },
      { name: 'Thread Roll', cat: accessoriesId, unit: 'piece' as const, price: 80, stock: 75 }
    ]

    for (const p of seedProducts) {
      const pid = uuidv4()
      insertProduct.run(
        pid,
        p.name,
        p.cat,
        null,
        null,
        p.unit,
        p.price,
        5,
        now
      )
      insertMovement.run(
        uuidv4(),
        pid,
        'initial',
        p.stock,
        'Initial stock',
        now
      )
    }
  }
}

// ---------- Products / Categories ----------

export function getProducts(categoryId?: string): Product[] {
  if (categoryId) {
    return db.prepare('SELECT * FROM products WHERE category_id = ? ORDER BY name').all(categoryId) as Product[]
  }
  return db.prepare('SELECT * FROM products ORDER BY name').all() as Product[]
}

export function getCategories(): Category[] {
  return db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all() as Category[]
}

export function createCategory(name: string, sortOrder = 0): Category {
  const id = uuidv4()
  db.prepare('INSERT INTO categories (id, name, sort_order) VALUES (?, ?, ?)').run(id, name, sortOrder)
  return { id, name, sortOrder }
}

export function createProduct(input: {
  name: string
  categoryId: string
  unitType: 'piece' | 'thaan'
  defaultPrice: number
  barcode?: string | null
  sku?: string | null
  lowStockThreshold?: number
  initialStock?: number
}): Product {
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO products (id, name, category_id, sku, barcode, unit_type, default_price, low_stock_threshold, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.categoryId,
    input.sku ?? null,
    input.barcode ?? null,
    input.unitType,
    input.defaultPrice,
    input.lowStockThreshold ?? 5,
    now
  )
  if (input.initialStock && input.initialStock !== 0) {
    addStockMovement({
      productId: id,
      category: 'initial',
      changeAmount: input.initialStock,
      reason: 'Initial stock on product creation'
    })
  }
  return getProducts().find((p) => p.id === id)!
}

// ---------- Stock ----------

// ⚠️ CRITICAL: stock is ALWAYS computed by summing stock_movements.
// Never store or read a mutable stock integer on the product row.
export function getStockLevel(productId: string): number {
  const row = db
    .prepare('SELECT COALESCE(SUM(change_amount), 0) as total FROM stock_movements WHERE product_id = ?')
    .get(productId) as { total: number }
  return row.total
}

export function getStockLevels(): Record<string, number> {
  const rows = db
    .prepare('SELECT product_id, COALESCE(SUM(change_amount), 0) as total FROM stock_movements GROUP BY product_id')
    .all() as { product_id: string; total: number }[]
  const map: Record<string, number> = {}
  for (const r of rows) map[r.product_id] = r.total
  return map
}

export function addStockMovement(input: {
  productId: string
  category: string
  changeAmount: number
  reason: string
}): StockMovement {
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(
    `INSERT INTO stock_movements (id, product_id, category, change_amount, reason, created_at, synced)
     VALUES (?, ?, ?, ?, ?, ?, 0)`
  ).run(id, input.productId, input.category, input.changeAmount, input.reason, now)
  return {
    id,
    productId: input.productId,
    category: input.category,
    changeAmount: input.changeAmount,
    reason: input.reason,
    createdAt: now,
    synced: 0
  }
}

// ---------- Sales ----------

// ⚠️ CRITICAL: sale + stock movements must be atomic.
// If anything fails after the sale insert but before the movements,
// the whole transaction rolls back — no partial commit.
export function createSale(input: {
  branchId: string
  tillId: string
  shiftId: string | null
  items: SaleItem[]
  total: number
  actualPaidPrice: number
  paymentMethod: 'cash' | 'digital'
}): Sale {
  const id = uuidv4()
  const now = new Date().toISOString()

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sales (id, branch_id, till_id, shift_id, items, total, actual_paid_price, payment_method, created_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
    ).run(
      id,
      input.branchId,
      input.tillId,
      input.shiftId,
      JSON.stringify(input.items),
      input.total,
      input.actualPaidPrice,
      input.paymentMethod,
      now
    )

    // Write a stock movement per line item
    const moveStmt = db.prepare(
      `INSERT INTO stock_movements (id, product_id, category, change_amount, reason, created_at, synced)
       VALUES (?, ?, ?, ?, ?, ?, 0)`
    )
    for (const item of input.items) {
      moveStmt.run(
        uuidv4(),
        item.productId,
        'sale',
        -Math.abs(item.quantity),
        `Sale ${id} - ${item.name}`,
        now
      )
    }
  })

  tx() // throws on failure → caller catches, nothing committed

  return {
    id,
    branchId: input.branchId,
    tillId: input.tillId,
    shiftId: input.shiftId,
    items: input.items,
    total: input.total,
    actualPaidPrice: input.actualPaidPrice,
    paymentMethod: input.paymentMethod,
    createdAt: now,
    synced: 0
  }
}

export function getSales(limit = 100): Sale[] {
  const rows = db
    .prepare('SELECT * FROM sales ORDER BY created_at DESC LIMIT ?')
    .all(limit) as Array<Omit<Sale, 'items'> & { items: string }>
  return rows.map((r) => ({ ...r, items: JSON.parse(r.items) as SaleItem[] }))
}

export function getLastSale(): Sale | null {
  const row = db
    .prepare('SELECT * FROM sales ORDER BY created_at DESC LIMIT 1')
    .get() as (Omit<Sale, 'items'> & { items: string }) | undefined
  if (!row) return null
  return { ...row, items: JSON.parse(row.items) as SaleItem[] }
}

// ---------- Shifts ----------

export function getOpenShift(tillId: string): Shift | null {
  const row = db
    .prepare('SELECT * FROM shifts WHERE till_id = ? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1')
    .get(tillId) as Shift | undefined
  return row ?? null
}

export function openShift(tillId: string, openingCash: number): Shift {
  // Close any stray open shift on this till first (defensive)
  const existing = getOpenShift(tillId)
  if (existing) {
    throw new Error(`Till ${tillId} already has an open shift (${existing.id})`)
  }
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO shifts (id, till_id, opening_cash, opened_at) VALUES (?, ?, ?, ?)'
  ).run(id, tillId, openingCash, now)
  return {
    id,
    tillId,
    openingCash,
    closingCash: null,
    expectedCash: null,
    openedAt: now,
    closedAt: null
  }
}

export function closeShift(shiftId: string, countedCash: number): Shift {
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as Shift | undefined
  if (!shift) throw new Error(`Shift ${shiftId} not found`)
  if (shift.closedAt) throw new Error(`Shift ${shiftId} already closed`)

  // Expected = opening cash + sum of cash sales during this shift
  const cashSalesRow = db
    .prepare(
      `SELECT COALESCE(SUM(actual_paid_price), 0) as total
       FROM sales
       WHERE shift_id = ? AND payment_method = 'cash'`
    )
    .get(shiftId) as { total: number }
  const expected = shift.openingCash + cashSalesRow.total

  const now = new Date().toISOString()
  db.prepare(
    'UPDATE shifts SET closing_cash = ?, expected_cash = ?, closed_at = ? WHERE id = ?'
  ).run(countedCash, expected, now, shiftId)

  return { ...shift, closingCash: countedCash, expectedCash: expected, closedAt: now }
}

export function getShifts(limit = 50): Shift[] {
  return db
    .prepare('SELECT * FROM shifts ORDER BY opened_at DESC LIMIT ?')
    .all(limit) as Shift[]
}

// ---------- Settings ----------

export function getSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM settings').all() as Setting[]
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  return map
}

export function getSetting(key: string): string | null {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
  return row?.value ?? null
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  ).run(key, value)
}

export function setSettings(values: Record<string, string>): void {
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  )
  const tx = db.transaction(() => {
    for (const [k, v] of Object.entries(values)) stmt.run(k, v)
  })
  tx()
}

// ---------- Branches / Tills ----------

export function getBranches(): Branch[] {
  return db.prepare('SELECT * FROM branches').all() as Branch[]
}

export function getTills(): Till[] {
  return db.prepare('SELECT * FROM tills').all() as Till[]
}

// ---------- Error logs / Feedback ----------

export function logError(input: { message: string; stack?: string; context?: string }): void {
  db.prepare(
    'INSERT INTO error_logs (id, message, stack, context, created_at, synced) VALUES (?, ?, ?, ?, ?, 0)'
  ).run(uuidv4(), input.message, input.stack ?? null, input.context ?? null, new Date().toISOString())
}

export function submitFeedback(input: { message: string; rating?: number }): void {
  db.prepare(
    'INSERT INTO feedback (id, message, rating, created_at, synced) VALUES (?, ?, ?, ?, 0)'
  ).run(uuidv4(), input.message, input.rating ?? null, new Date().toISOString())
}

// ---------- Reports ----------

export function getDashboard(): {
  todaySales: { total: number; count: number }
  cashDigitalSplit: { cash: number; digital: number }
  bestCategory: { name: string; total: number } | null
  lowStock: Array<{ id: string; name: string; stock: number; threshold: number }>
} {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()

  const todayRow = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
       FROM sales WHERE created_at >= ?`
    )
    .get(todayIso) as { total: number; count: number }

  const splitRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_method='cash' THEN actual_paid_price ELSE 0 END), 0) as cash,
         COALESCE(SUM(CASE WHEN payment_method='digital' THEN actual_paid_price ELSE 0 END), 0) as digital
       FROM sales WHERE created_at >= ?`
    )
    .get(todayIso) as { cash: number; digital: number }

  // Best category by revenue today
  const bestCatRow = db
    .prepare(
      `SELECT c.name as name, COALESCE(SUM(s.total), 0) as total
       FROM sales s, json_each(s.items) as je
       JOIN products p ON p.id = json_extract(je.value, '$.productId')
       JOIN categories c ON c.id = p.category_id
       WHERE s.created_at >= ?
       GROUP BY c.id
       ORDER BY total DESC
       LIMIT 1`
    )
    .get(todayIso) as { name: string; total: number } | undefined

  // Low stock: products whose computed stock < threshold
  const stockRows = db
    .prepare(
      `SELECT p.id, p.name, p.low_stock_threshold as threshold,
              COALESCE((SELECT SUM(change_amount) FROM stock_movements WHERE product_id = p.id), 0) as stock
       FROM products p`
    )
    .all() as Array<{ id: string; name: string; stock: number; threshold: number }>
  const lowStock = stockRows.filter((r) => r.stock < r.threshold)

  return {
    todaySales: { total: todayRow.total, count: todayRow.count },
    cashDigitalSplit: { cash: splitRow.cash, digital: splitRow.digital },
    bestCategory: bestCatRow && bestCatRow.total > 0 ? bestCatRow : null,
    lowStock
  }
}

export function getSalesReport(from: string, to: string): Sale[] {
  const rows = db
    .prepare('SELECT * FROM sales WHERE created_at >= ? AND created_at <= ? ORDER BY created_at DESC')
    .all(from, to) as Array<Omit<Sale, 'items'> & { items: string }>
  return rows.map((r) => ({ ...r, items: JSON.parse(r.items) as SaleItem[] }))
}

// ---------- Backup ----------

export function getDbPath(): string {
  return join(app.getPath('userData'), 'pos.db')
}
