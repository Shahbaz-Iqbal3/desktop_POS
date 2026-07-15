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
  SaleReturn,
  StockMovement,
  Product,
  Category,
  Branch,
  Till,
  Shift,
  Setting,
  HeldCart
} from '@shared/types'

let db: Database.Database

// ---------- Helpers ----------

/** Convert a snake_case object key to camelCase: default_price → defaultPrice */
function toCamel(str: string): string {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase())
}

/** Map all snake_case keys in a row to camelCase */
function mapRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(row)) out[toCamel(k)] = v
  return out as T
}

/** Map an array of rows */
function mapRows<T>(rows: unknown[]): T[] {
  return rows.map((r) => mapRow<T>(r as Record<string, unknown>))
}

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
    CREATE TABLE IF NOT EXISTS shops (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      access_token TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS branches (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      shop_id TEXT NOT NULL,
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS tills (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      shop_id TEXT NOT NULL,
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS categories (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      shop_id TEXT NOT NULL,
      FOREIGN KEY (shop_id) REFERENCES shops(id)
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
      shop_id TEXT NOT NULL,
      FOREIGN KEY (category_id) REFERENCES categories(id),
      FOREIGN KEY (shop_id) REFERENCES shops(id)
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
      shop_id TEXT NOT NULL,
      FOREIGN KEY (product_id) REFERENCES products(id),
      FOREIGN KEY (shop_id) REFERENCES shops(id)
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
      shop_id TEXT NOT NULL,
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (till_id) REFERENCES tills(id),
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS shifts (
      id TEXT PRIMARY KEY,
      till_id TEXT NOT NULL,
      opening_cash REAL NOT NULL,
      closing_cash REAL,
      expected_cash REAL,
      opened_at TEXT NOT NULL,
      closed_at TEXT,
      shop_id TEXT NOT NULL,
      FOREIGN KEY (till_id) REFERENCES tills(id),
      FOREIGN KEY (shop_id) REFERENCES shops(id)
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
      synced INTEGER NOT NULL DEFAULT 0,
      shop_id TEXT NOT NULL,
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      message TEXT NOT NULL,
      rating INTEGER,
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      shop_id TEXT NOT NULL,
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    );

    CREATE TABLE IF NOT EXISTS held_carts (
      id TEXT PRIMARY KEY,
      label TEXT NOT NULL,
      items TEXT NOT NULL,
      total REAL NOT NULL,
      held_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS returns (
      id TEXT PRIMARY KEY,
      sale_id TEXT NOT NULL,
      branch_id TEXT NOT NULL,
      till_id TEXT NOT NULL,
      shift_id TEXT,
      items TEXT NOT NULL,        -- JSON array of refunded SaleItem
      total REAL NOT NULL,
      refund_amount REAL NOT NULL,
      payment_method TEXT NOT NULL DEFAULT 'cash',
      created_at TEXT NOT NULL,
      synced INTEGER NOT NULL DEFAULT 0,
      shop_id TEXT NOT NULL,
      FOREIGN KEY (branch_id) REFERENCES branches(id),
      FOREIGN KEY (till_id) REFERENCES tills(id),
      FOREIGN KEY (shop_id) REFERENCES shops(id)
    );

    CREATE INDEX IF NOT EXISTS idx_stock_movements_product ON stock_movements(product_id);
    CREATE INDEX IF NOT EXISTS idx_sales_created ON sales(created_at);
    CREATE INDEX IF NOT EXISTS idx_sales_synced ON sales(synced);
    CREATE INDEX IF NOT EXISTS idx_stock_synced ON stock_movements(synced);
    CREATE INDEX IF NOT EXISTS idx_shops_token ON shops(access_token);
  `)

  // Migration: Add shop_id columns if they don't exist (for existing databases)
  migrateToMultiShop()
}

function migrateToMultiShop(): void {
  const tables = [
    'branches',
    'tills',
    'categories',
    'products',
    'stock_movements',
    'sales',
    'shifts',
    'error_logs',
    'feedback',
    'returns'
  ]

  for (const table of tables) {
    try {
      // Check if shop_id column exists
      const pragma = db.pragma(`table_info(${table})`) as Array<{ name: string }>
      const hasShopId = pragma.some(col => col.name === 'shop_id')
      
      if (!hasShopId) {
        console.log(`[db] Adding shop_id column to ${table}`)
        db.exec(`ALTER TABLE ${table} ADD COLUMN shop_id TEXT`)
      }
    } catch (err) {
      console.warn(`[db] Migration check failed for ${table}:`, err)
    }
  }
}

function seedDefaults(): void {
  const now = new Date().toISOString()

  // Ensure we have a shop_id in settings (for new installations)
  const shopId = getSetting('shopId')
  if (!shopId) {
    const newShopId = uuidv4()
    setSetting('shopId', newShopId)
    // Create default shop
    const accessToken = generateAccessToken()
    db.prepare('INSERT INTO shops (id, name, access_token, created_at) VALUES (?, ?, ?, ?)').run(
      newShopId,
      'My Shop',
      accessToken,
      now
    )
  }

  const currentShopId = getSetting('shopId')!

  // Default branch
  const branchCount = db.prepare('SELECT COUNT(*) as c FROM branches').get() as { c: number }
  if (branchCount.c === 0) {
    db.prepare('INSERT INTO branches (id, name, shop_id) VALUES (?, ?, ?)').run(
      'branch-default',
      'Main Branch',
      currentShopId
    )
  }

  // Default till
  const tillCount = db.prepare('SELECT COUNT(*) as c FROM tills').get() as { c: number }
  if (tillCount.c === 0) {
    db.prepare('INSERT INTO tills (id, name, branch_id, shop_id) VALUES (?, ?, ?, ?)').run(
      'till-1',
      'Till 1',
      'branch-default',
      currentShopId
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
      'INSERT INTO categories (id, name, sort_order, shop_id) VALUES (?, ?, ?, ?)'
    )
    cats.forEach((c) => insertCat.run(c.id, c.name, c.sort, currentShopId))

    // Seed products + initial stock
    const insertProduct = db.prepare(
      `INSERT INTO products (id, name, category_id, sku, barcode, unit_type, default_price, low_stock_threshold, created_at, shop_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    const insertMovement = db.prepare(
      `INSERT INTO stock_movements (id, product_id, category, change_amount, reason, created_at, synced, shop_id)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?)`
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
        now,
        currentShopId
      )
      insertMovement.run(
        uuidv4(),
        pid,
        'initial',
        p.stock,
        'Initial stock',
        now,
        currentShopId
      )
    }
  }
}

function generateAccessToken(): string {
  // Generate a random 32-character hex string for access token
  const crypto = require('crypto')
  return crypto.randomBytes(16).toString('hex')
}

// ---------- Products / Categories ----------

export function getProducts(categoryId?: string): Product[] {
  if (categoryId) {
    return mapRows<Product>(db.prepare('SELECT * FROM products WHERE category_id = ? ORDER BY name').all(categoryId))
  }
  return mapRows<Product>(db.prepare('SELECT * FROM products ORDER BY name').all())
}

export function getCategories(): Category[] {
  return mapRows<Category>(db.prepare('SELECT * FROM categories ORDER BY sort_order, name').all())
}

export function createCategory(name: string, sortOrder = 0): Category {
  const id = uuidv4()
  const shopId = getSetting('shopId')!
  db.prepare('INSERT INTO categories (id, name, sort_order, shop_id) VALUES (?, ?, ?, ?)').run(id, name, sortOrder, shopId)
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
  const shopId = getSetting('shopId')!
  db.prepare(
    `INSERT INTO products (id, name, category_id, sku, barcode, unit_type, default_price, low_stock_threshold, created_at, shop_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.categoryId,
    input.sku ?? null,
    input.barcode ?? null,
    input.unitType,
    input.defaultPrice,
    input.lowStockThreshold ?? 5,
    now,
    shopId
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

export function updateProduct(id: string, patch: Partial<{
  name: string
  categoryId: string
  unitType: 'piece' | 'thaan'
  defaultPrice: number
  barcode: string | null
  sku: string | null
  lowStockThreshold: number
}>): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.name !== undefined) { fields.push('name = ?'); values.push(patch.name) }
  if (patch.categoryId !== undefined) { fields.push('category_id = ?'); values.push(patch.categoryId) }
  if (patch.unitType !== undefined) { fields.push('unit_type = ?'); values.push(patch.unitType) }
  if (patch.defaultPrice !== undefined) { fields.push('default_price = ?'); values.push(patch.defaultPrice) }
  if (patch.barcode !== undefined) { fields.push('barcode = ?'); values.push(patch.barcode) }
  if (patch.sku !== undefined) { fields.push('sku = ?'); values.push(patch.sku) }
  if (patch.lowStockThreshold !== undefined) { fields.push('low_stock_threshold = ?'); values.push(patch.lowStockThreshold) }
  if (fields.length === 0) return
  values.push(id)
  db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function deleteProduct(id: string): void {
  db.prepare('DELETE FROM products WHERE id = ?').run(id)
}

// ---------- Held Carts ----------

export function holdCart(label: string, items: SaleItem[], total: number): HeldCart {
  const id = uuidv4()
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO held_carts (id, label, items, total, held_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, label, JSON.stringify(items), total, now)
  return { id, label, items, total, heldAt: now }
}

export function getHeldCarts(): HeldCart[] {
  const rows = mapRows<{ id: string; label: string; items: string; total: number; heldAt: string }>(
    db.prepare('SELECT * FROM held_carts ORDER BY held_at DESC').all()
  )
  return rows.map((r) => ({ ...r, items: JSON.parse(r.items) as SaleItem[] }))
}

export function recallCart(id: string): HeldCart | null {
  const row = db.prepare('SELECT * FROM held_carts WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  const mapped = mapRow<{ id: string; label: string; items: string; total: number; heldAt: string }>(row)
  // Remove from held after recall
  db.prepare('DELETE FROM held_carts WHERE id = ?').run(id)
  return { ...mapped, items: JSON.parse(mapped.items) as SaleItem[] }
}

export function deleteHeldCart(id: string): void {
  db.prepare('DELETE FROM held_carts WHERE id = ?').run(id)
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
  const shopId = getSetting('shopId')!
  db.prepare(
    `INSERT INTO stock_movements (id, product_id, category, change_amount, reason, created_at, synced, shop_id)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
  ).run(id, input.productId, input.category, input.changeAmount, input.reason, now, shopId)
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
  const shopId = getSetting('shopId')!

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sales (id, branch_id, till_id, shift_id, items, total, actual_paid_price, payment_method, created_at, synced, shop_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(
      id,
      input.branchId,
      input.tillId,
      input.shiftId,
      JSON.stringify(input.items),
      input.total,
      input.actualPaidPrice,
      input.paymentMethod,
      now,
      shopId
    )

    // Write a stock movement per line item
    const moveStmt = db.prepare(
      `INSERT INTO stock_movements (id, product_id, category, change_amount, reason, created_at, synced, shop_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    )
    for (const item of input.items) {
      moveStmt.run(
        uuidv4(),
        item.productId,
        'sale',
        -Math.abs(item.quantity),
        `Sale ${id} - ${item.name}`,
        now,
        shopId
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
  const rows = mapRows<{ id: string; branch_id: string; till_id: string; shift_id: string; items: string; total: number; actual_paid_price: number; payment_method: string; created_at: string; synced: number }>(
    db.prepare('SELECT * FROM sales ORDER BY created_at DESC LIMIT ?').all(limit)
  )
  return rows.map((r) => ({ ...mapRow<Sale>(r), items: JSON.parse(r.items) as SaleItem[] }))
}

export function getLastSale(): Sale | null {
  const row = db
    .prepare('SELECT * FROM sales ORDER BY created_at DESC LIMIT 1')
    .get() as Record<string, unknown> | undefined
  if (!row) return null
  const mapped = mapRow<{ items: string }>(row)
  return { ...mapRow<Sale>(row), items: JSON.parse(mapped.items) as SaleItem[] }
}

export function getSale(id: string): Sale | null {
  const row = db.prepare('SELECT * FROM sales WHERE id = ?').get(id) as Record<string, unknown> | undefined
  if (!row) return null
  const mapped = mapRow<{ items: string }>(row)
  return { ...mapRow<Sale>(row), items: JSON.parse(mapped.items) as SaleItem[] }
}

// ---------- Returns / refunds ----------
// A refund REVERSES stock (adds it back) and is recorded atomically with the
// return row. Never let a partial failure leave the DB inconsistent.
export function createReturn(input: {
  saleId: string
  branchId: string
  tillId: string
  shiftId: string | null
  items: SaleItem[]
  total: number
  refundAmount: number
  paymentMethod: 'cash' | 'digital'
}): SaleReturn {
  const id = uuidv4()
  const now = new Date().toISOString()
  const shopId = getSetting('shopId')!

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO returns (id, sale_id, branch_id, till_id, shift_id, items, total, refund_amount, payment_method, created_at, synced, shop_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(
      id,
      input.saleId,
      input.branchId,
      input.tillId,
      input.shiftId,
      JSON.stringify(input.items),
      input.total,
      input.refundAmount,
      input.paymentMethod,
      now,
      shopId
    )

    const moveStmt = db.prepare(
      `INSERT INTO stock_movements (id, product_id, category, change_amount, reason, created_at, synced, shop_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    )
    for (const item of input.items) {
      moveStmt.run(
        uuidv4(),
        item.productId,
        'refund',
        Math.abs(item.quantity),
        `Refund ${id} (sale ${input.saleId}) - ${item.name}`,
        now,
        shopId
      )
    }
  })

  tx()

  return {
    id,
    saleId: input.saleId,
    branchId: input.branchId,
    tillId: input.tillId,
    shiftId: input.shiftId,
    items: input.items,
    total: input.total,
    refundAmount: input.refundAmount,
    paymentMethod: input.paymentMethod,
    createdAt: now,
    synced: 0
  }
}

export function getReturns(limit = 100): SaleReturn[] {
  const rows = mapRows<{ id: string; sale_id: string; branch_id: string; till_id: string; shift_id: string; items: string; total: number; refund_amount: number; payment_method: string; created_at: string; synced: number }>(
    db.prepare('SELECT * FROM returns ORDER BY created_at DESC LIMIT ?').all(limit)
  )
  return rows.map((r) => ({
    id: r.id,
    saleId: r.sale_id,
    branchId: r.branch_id,
    tillId: r.till_id,
    shiftId: r.shift_id,
    items: JSON.parse(r.items) as SaleItem[],
    total: r.total,
    refundAmount: r.refund_amount,
    paymentMethod: r.payment_method as 'cash' | 'digital',
    createdAt: r.created_at,
    synced: r.synced as 0 | 1
  }))
}

// ---------- Shifts ----------

export function getOpenShift(tillId: string): Shift | null {
  const row = db
    .prepare('SELECT * FROM shifts WHERE till_id = ? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1')
    .get(tillId) as Record<string, unknown> | undefined
  return row ? mapRow<Shift>(row) : null
}

export function openShift(tillId: string, openingCash: number): Shift {
  // Close any stray open shift on this till first (defensive)
  const existing = getOpenShift(tillId)
  if (existing) {
    throw new Error(`Till ${tillId} already has an open shift (${existing.id})`)
  }
  const id = uuidv4()
  const now = new Date().toISOString()
  const shopId = getSetting('shopId')!
  db.prepare(
    'INSERT INTO shifts (id, till_id, opening_cash, opened_at, shop_id) VALUES (?, ?, ?, ?, ?)'
  ).run(id, tillId, openingCash, now, shopId)
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
  const shift = mapRow<Shift | undefined>(db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as Record<string, unknown>)
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
  return mapRows<Shift>(db.prepare('SELECT * FROM shifts ORDER BY opened_at DESC LIMIT ?').all(limit))
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
  return mapRows<Branch>(db.prepare('SELECT * FROM branches').all())
}

export function getTills(): Till[] {
  return mapRows<Till>(db.prepare('SELECT * FROM tills').all())
}

export function createBranch(name: string): Branch {
  const id = uuidv4()
  const shopId = getSetting('shopId')!
  db.prepare('INSERT INTO branches (id, name, shop_id) VALUES (?, ?, ?)').run(id, name, shopId)
  return { id, name }
}

export function createTill(name: string, branchId: string): Till {
  const id = uuidv4()
  const shopId = getSetting('shopId')!
  db.prepare('INSERT INTO tills (id, name, branch_id, shop_id) VALUES (?, ?, ?, ?)').run(
    id,
    name,
    branchId,
    shopId
  )
  return { id, name, branchId }
}

// ---------- Error logs / Feedback ----------

export function logError(input: { message: string; stack?: string; context?: string }): void {
  const shopId = getSetting('shopId')!
  db.prepare(
    'INSERT INTO error_logs (id, message, stack, context, created_at, synced, shop_id) VALUES (?, ?, ?, ?, ?, 0, ?)'
  ).run(uuidv4(), input.message, input.stack ?? null, input.context ?? null, new Date().toISOString(), shopId)
}

export function submitFeedback(input: { message: string; rating?: number }): void {
  const shopId = getSetting('shopId')!
  db.prepare(
    'INSERT INTO feedback (id, message, rating, created_at, synced, shop_id) VALUES (?, ?, ?, ?, 0, ?)'
  ).run(uuidv4(), input.message, input.rating ?? null, new Date().toISOString(), shopId)
}

// ---------- Reports ----------

export function getShop(): { id: string; name: string; accessToken: string } | null {
  const shopId = getSetting('shopId')
  if (!shopId) return null
  const row = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId) as Record<string, unknown> | undefined
  return row ? mapRow<{ id: string; name: string; accessToken: string }>(row) : null
}

export function getDashboard(): {
  todaySales: { total: number; count: number }
  cashDigitalSplit: { cash: number; digital: number }
  bestCategory: { name: string; total: number } | null
  lowStock: Array<{ id: string; name: string; stock: number; threshold: number }>
} {
  const todayStart = new Date()
  todayStart.setHours(0, 0, 0, 0)
  const todayIso = todayStart.toISOString()
  const shopId = getSetting('shopId')!

  const todayRow = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
       FROM sales WHERE created_at >= ? AND shop_id = ?`
    )
    .get(todayIso, shopId) as { total: number; count: number }

  const splitRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_method='cash' THEN actual_paid_price ELSE 0 END), 0) as cash,
         COALESCE(SUM(CASE WHEN payment_method='digital' THEN actual_paid_price ELSE 0 END), 0) as digital
       FROM sales WHERE created_at >= ? AND shop_id = ?`
    )
    .get(todayIso, shopId) as { cash: number; digital: number }

  // Best category by revenue today
  const bestCatRow = db
    .prepare(
      `SELECT c.name as name, COALESCE(SUM(s.total), 0) as total
       FROM sales s, json_each(s.items) as je
       JOIN products p ON p.id = json_extract(je.value, '$.productId')
       JOIN categories c ON c.id = p.category_id
       WHERE s.created_at >= ? AND s.shop_id = ?
       GROUP BY c.id
       ORDER BY total DESC
       LIMIT 1`
    )
    .get(todayIso, shopId) as { name: string; total: number } | undefined

  // Low stock: products whose computed stock < threshold
  const stockRows = db
    .prepare(
      `SELECT p.id, p.name, p.low_stock_threshold as threshold,
              COALESCE((SELECT SUM(change_amount) FROM stock_movements WHERE product_id = p.id), 0) as stock
       FROM products p
       WHERE p.shop_id = ?`
    )
    .all(shopId) as Array<{ id: string; name: string; stock: number; threshold: number }>
  const lowStock = stockRows.filter((r) => r.stock < r.threshold)

  return {
    todaySales: { total: todayRow.total, count: todayRow.count },
    cashDigitalSplit: { cash: splitRow.cash, digital: splitRow.digital },
    bestCategory: bestCatRow && bestCatRow.total > 0 ? bestCatRow : null,
    lowStock
  }
}

export function getSalesReport(from: string, to: string): Sale[] {
  const shopId = getSetting('shopId')!
  const rows = mapRows<{ items: string }>(
    db.prepare('SELECT * FROM sales WHERE created_at >= ? AND created_at <= ? AND shop_id = ? ORDER BY created_at DESC')
      .all(from, to, shopId)
  )
  return rows.map((r) => ({ ...mapRow<Sale>(r), items: JSON.parse(r.items) as SaleItem[] }))
}

// ---------- Stock report ----------

export function getStockReport(): Array<{
  id: string
  name: string
  category: string
  unitType: string
  defaultPrice: number
  stock: number
  lowStockThreshold: number
}> {
  const shopId = getSetting('shopId')!
  const rows = db
    .prepare(
      `SELECT p.id, p.name, c.name as category, p.unit_type as unitType,
              p.default_price as defaultPrice, p.low_stock_threshold as lowStockThreshold,
              COALESCE((SELECT SUM(change_amount) FROM stock_movements WHERE product_id = p.id), 0) as stock
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.shop_id = ?
       ORDER BY p.name`
    )
    .all(shopId) as Array<Record<string, unknown>>
  return rows.map((r) => mapRow<{
    id: string
    name: string
    category: string
    unitType: string
    defaultPrice: number
    stock: number
    lowStockThreshold: number
  }>(r))
}

// ---------- Cash report (daily cash sales within range) ----------

export function getCashReport(from: string, to: string): Array<{
  date: string
  count: number
  total: number
}> {
  const shopId = getSetting('shopId')!
  const rows = db
    .prepare(
      `SELECT DATE(created_at) as date, COUNT(*) as count, COALESCE(SUM(actual_paid_price), 0) as total
       FROM sales
       WHERE payment_method = 'cash' AND created_at >= ? AND created_at <= ? AND shop_id = ?
       GROUP BY DATE(created_at)
       ORDER BY date`
    )
    .all(from, to, shopId) as Array<Record<string, unknown>>
  return rows.map((r) =>
    mapRow<{ date: string; count: number; total: number }>(r)
  )
}

// ---------- Sync helpers ----------

export function getUnsyncedRows(): {
  sales: Array<{ id: string; data: Record<string, unknown> }>
  stockMovements: Array<{ id: string; data: Record<string, unknown> }>
  returns: Array<{ id: string; data: Record<string, unknown> }>
  errorLogs: Array<{ id: string; data: Record<string, unknown> }>
  feedback: Array<{ id: string; data: Record<string, unknown> }>
} {
  const shopId = getSetting('shopId')!

  const sales = db.prepare('SELECT * FROM sales WHERE synced = 0 AND shop_id = ?').all(shopId) as Record<string, unknown>[]
  const stockMovements = db.prepare('SELECT * FROM stock_movements WHERE synced = 0 AND shop_id = ?').all(shopId) as Record<string, unknown>[]
  const returns = db.prepare('SELECT * FROM returns WHERE synced = 0 AND shop_id = ?').all(shopId) as Record<string, unknown>[]
  const errorLogs = db.prepare('SELECT * FROM error_logs WHERE synced = 0 AND shop_id = ?').all(shopId) as Record<string, unknown>[]
  const feedback = db.prepare('SELECT * FROM feedback WHERE synced = 0 AND shop_id = ?').all(shopId) as Record<string, unknown>[]

  return {
    sales: sales.map(row => ({ id: row.id as string, data: mapRow(row) })),
    stockMovements: stockMovements.map(row => ({ id: row.id as string, data: mapRow(row) })),
    returns: returns.map(row => ({ id: row.id as string, data: mapRow(row) })),
    errorLogs: errorLogs.map(row => ({ id: row.id as string, data: mapRow(row) })),
    feedback: feedback.map(row => ({ id: row.id as string, data: mapRow(row) }))
  }
}

export function markAsSynced(
  table: 'sales' | 'stock_movements' | 'returns' | 'error_logs' | 'feedback',
  ids: string[]
): void {
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`UPDATE ${table} SET synced = 1 WHERE id IN (${placeholders})`).run(...ids)
}

export function getPendingSyncCount(): number {
  const shopId = getSetting('shopId')!
  const salesCount = db.prepare('SELECT COUNT(*) as c FROM sales WHERE synced = 0 AND shop_id = ?').get(shopId) as { c: number }
  const stockCount = db.prepare('SELECT COUNT(*) as c FROM stock_movements WHERE synced = 0 AND shop_id = ?').get(shopId) as { c: number }
  const returnsCount = db.prepare('SELECT COUNT(*) as c FROM returns WHERE synced = 0 AND shop_id = ?').get(shopId) as { c: number }
  const errorCount = db.prepare('SELECT COUNT(*) as c FROM error_logs WHERE synced = 0 AND shop_id = ?').get(shopId) as { c: number }
  const feedbackCount = db.prepare('SELECT COUNT(*) as c FROM feedback WHERE synced = 0 AND shop_id = ?').get(shopId) as { c: number }
  return salesCount.c + stockCount.c + returnsCount.c + errorCount.c + feedbackCount.c
}

// ---------- Backup ----------

export function getDbPath(): string {
  return join(app.getPath('userData'), 'pos.db')
}
