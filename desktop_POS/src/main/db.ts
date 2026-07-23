// SQLite data layer — runs in the MAIN PROCESS only.
// The renderer NEVER touches SQLite directly; it goes through IPC.
import Database from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, copyFileSync, unlinkSync, readFileSync } from 'fs'
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
  ShiftQuery,
  ShiftSummary,
  Setting,
  HeldCart
} from '@shared/types'
import { computeLineTotal, round } from '@shared/pure'
import { PAIRING_CODE_TTL_MINUTES } from '@shared/config'

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

const fsUnlink = (p: string) => unlinkSync(p)
const copyFileSyncSafe = (s: string, d: string) => copyFileSync(s, d)

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
  migrateProductActive()
  migrateSalesBookmarked()
  migrateSyncWatermarks()
  migrateShopPairingCode()
  seedDefaults()
}

// Add `updated_at` to the two-way-synced tables so the desktop can pull changes
// newer than its last-sync watermark (last-write-wins conflict resolution).
function migrateSyncWatermarks(): void {
  const tables = ['shops', 'categories', 'products', 'stock_movements']
  for (const table of tables) {
    try {
      const pragma = db.pragma(`table_info(${table})`) as Array<{ name: string }>
      if (!pragma.some((col) => col.name === 'updated_at')) {
        console.log(`[db] Adding updated_at column to ${table}`)
        db.exec(`ALTER TABLE ${table} ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))`)
      }
    } catch (err) {
      console.warn(`[db] Migration (updated_at) failed for ${table}:`, err)
    }
  }
}

function createSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS shops (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      access_token TEXT NOT NULL UNIQUE,
      pairing_code TEXT UNIQUE,
      pairing_code_expires_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      user_id TEXT,
      auth_password TEXT
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
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
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
      active INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
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
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
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
      order_discount REAL NOT NULL DEFAULT 0,  -- order-level discount % (0-100) applied to grand total
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

// Add the `active` column to products for soft-deletion (deactivation) of
// products that have sales/movement history, preserving past records.
function migrateProductActive(): void {
  try {
    const pragma = db.pragma('table_info(products)') as Array<{ name: string }>
    if (!pragma.some(col => col.name === 'active')) {
      console.log('[db] Adding active column to products')
      db.exec('ALTER TABLE products ADD COLUMN active INTEGER NOT NULL DEFAULT 1')
    }
    // Optional product image, copied into userData/product-images.
    if (!pragma.some(col => col.name === 'image_path')) {
      console.log('[db] Adding image_path column to products')
      db.exec('ALTER TABLE products ADD COLUMN image_path TEXT')
    }
    // Default discount (%) applied to the cart line when this product is added.
    if (!pragma.some(col => col.name === 'default_discount')) {
      console.log('[db] Adding default_discount column to products')
      db.exec('ALTER TABLE products ADD COLUMN default_discount REAL NOT NULL DEFAULT 0')
    }
  } catch (err) {
    console.warn('[db] Migration (products columns) failed:', err)
  }
}

// Add the `bookmarked` column to sales so users can flag important sales in the
// History tab (star toggle + "bookmarked only" filter).
function migrateSalesBookmarked(): void {
  try {
    const pragma = db.pragma('table_info(sales)') as Array<{ name: string }>
    if (!pragma.some(col => col.name === 'bookmarked')) {
      console.log('[db] Adding bookmarked column to sales')
      db.exec('ALTER TABLE sales ADD COLUMN bookmarked INTEGER NOT NULL DEFAULT 0')
    }
    if (!pragma.some(col => col.name === 'order_discount')) {
      console.log('[db] Adding order_discount column to sales')
      db.exec('ALTER TABLE sales ADD COLUMN order_discount REAL NOT NULL DEFAULT 0')
    }
  } catch (err) {
    console.warn('[db] Migration (sales.bookmarked) failed:', err)
  }
}

// Add the `pairing_code` columns to shops for DBs created before they existed.
// We only add the columns/indexes — we do NOT auto-generate a code, because the
// pairing code is now created explicitly by the user (Generate / Refresh), which
// also starts its expiry timer.
function migrateShopPairingCode(): void {
  try {
    const pragma = db.pragma('table_info(shops)') as Array<{ name: string }>
    if (!pragma.some(col => col.name === 'pairing_code')) {
      console.log('[db] Adding pairing_code column to shops')
      db.exec('ALTER TABLE shops ADD COLUMN pairing_code TEXT')
    }
    // Index + uniqueness are created here (not in createSchema) so they only
    // apply once the column actually exists, avoiding "no such column" on DBs
    // created before pairing_code was introduced.
    db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_shops_pairing ON shops(pairing_code)')
    const pragma2 = db.pragma('table_info(shops)') as Array<{ name: string }>
    if (!pragma2.some(col => col.name === 'pairing_code_expires_at')) {
      console.log('[db] Adding pairing_code_expires_at column to shops')
      db.exec('ALTER TABLE shops ADD COLUMN pairing_code_expires_at TEXT')
    }
    if (!pragma2.some(col => col.name === 'user_id')) {
      console.log('[db] Adding user_id column to shops')
      db.exec('ALTER TABLE shops ADD COLUMN user_id TEXT')
    }
    if (!pragma2.some(col => col.name === 'auth_password')) {
      console.log('[db] Adding auth_password column to shops')
      db.exec('ALTER TABLE shops ADD COLUMN auth_password TEXT')
    }
  } catch (err) {
    console.warn('[db] Migration (shops.pairing_code) failed:', err)
  }
}

// Copy a user-chosen image file into a stable location inside userData so the
// stored path survives the source file being moved/deleted. Returns the
// destination path, or null when no source is provided. Uses a UUID filename to
// avoid collisions; the original extension is preserved.
const PRODUCT_IMAGES_DIR = 'product-images'
export function saveProductImage(srcPath: string | null | undefined, existingPath?: string | null): string | null {
  const base = app.getPath('userData')
  const dir = join(base, PRODUCT_IMAGES_DIR)
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  // A "remove image" sentinel (empty string) clears the stored image.
  if (srcPath === '') {
    if (existingPath) {
      try { fsUnlink(existingPath) } catch { /* ignore */ }
    }
    return null
  }

  // No new image chosen (null/undefined) — keep whatever is already stored.
  if (!srcPath) return existingPath ?? null

  const ext = srcPath.includes('.') ? srcPath.slice(srcPath.lastIndexOf('.')).toLowerCase() : ''
  const dest = join(dir, `${uuidv4()}${ext}`)
  try {
    copyFileSyncSafe(srcPath, dest)
    // Remove the previous image for this product to avoid orphaned files.
    if (existingPath && existingPath !== dest) {
      try { fsUnlink(existingPath) } catch { /* ignore */ }
    }
    return dest
  } catch (err) {
    console.warn('[db] Failed to copy product image:', err)
    return existingPath ?? null
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
    shopAddress: '',
    shopPhone: '',
    shopEmail: '',
    shopTaxId: '',
    shopCurrency: 'Rs',
    shopTagline: '',
    barcodeEnabled: 'false',
    tillReconciliationEnabled: 'false',
    confirmSaleBeforePrint: 'true',
    language: 'en',
    printerName: '',
    barcodePrinterName: '',
    backupPath: '',
    autoBackup: 'false',
    setupComplete: 'false',
    receiptTagline: '',
    receiptFooter: '',
    receiptLogoPath: '',
    receiptShowLogo: 'false',
    trialStart: now
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

// Generate a short, human-readable pairing code in the form XXXX-XXXX, used by
// the dashboard PWA as a manual fallback and embedded in the QR URL. Uppercase
// Crockford-ish alphabet (no I/L/O/U) to avoid confusion when read aloud.
function generatePairingCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTVWXYZ23456789'
  const crypto = require('crypto')
  const pick = () => alphabet[crypto.randomInt(0, alphabet.length)]
  const block = () => Array.from({ length: 4 }, pick).join('')
  return `${block()}-${block()}`
}

// Get the current shop's pairing code (and its expiry), generating a fresh
// code+expiry if missing. Returns null if no shop is configured.
export function getShopPairingCode(): string | null {
  return getShopPairingCodeWithExpiry()?.code ?? null
}

export type PairingCodeInfo = {
  code: string
  expiresAt: string | null // ISO timestamp, or null if never set
}

export function getShopPairingCodeWithExpiry(): PairingCodeInfo | null {
  const shopId = getSetting('shopId')
  if (!shopId) return null
  const row = db
    .prepare('SELECT pairing_code, pairing_code_expires_at FROM shops WHERE id = ?')
    .get(shopId) as
    | { pairing_code: string | null; pairing_code_expires_at: string | null }
    | undefined
  if (!row) return null
  // No auto-creation: a code only exists after the user explicitly generates one
  // (which also starts its 5-minute expiry). Until then the PWA cannot connect.
  if (!row.pairing_code) return null
  return { code: row.pairing_code, expiresAt: row.pairing_code_expires_at ?? null }
}

// Whether the stored pairing code is currently valid (exists and not expired).
export function isPairingCodeValid(): boolean {
  const info = getShopPairingCodeWithExpiry()
  if (!info || !info.code) return false
  if (!info.expiresAt) return true
  return new Date(info.expiresAt).getTime() > Date.now()
}

// Regenerate the shop's pairing code with a fresh expiry (called on every online
// connect, and on demand via the "refresh code" button) so old codes can't be
// reused. Returns null if no shop is configured.
export function refreshShopPairingCode(): string | null {
  const shopId = getSetting('shopId')
  if (!shopId) return null
  const code = generatePairingCode()
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MINUTES * 60_000).toISOString()
  db.prepare('UPDATE shops SET pairing_code = ?, pairing_code_expires_at = ? WHERE id = ?').run(
    code,
    expiresAt,
    shopId
  )
  return code
}

// ---------- Products / Categories ----------

// Generate a CODE128-friendly, shop-wide unique barcode. We use a numeric
// scheme ("20" prefix + zero-padded counter derived from a fast monotonic
// source) and loop against the DB until we find a free value. CODE128 encodes
// any ASCII, so numeric strings work fine.
export function generateBarcode(): string {
  const shopId = getSetting('shopId')!
  const base = `20${shopId.replace(/-/g, '').replace(/[^0-9]/g, '').slice(0, 6).padStart(6, '0')}`
  for (let attempt = 0; attempt < 100; attempt++) {
    const suffix = String(Date.now() % 1_000_000).padStart(6, '0') +
      String(Math.floor(Math.random() * 1000)).padStart(3, '0')
    const candidate = (base + suffix).slice(0, 20)
    if (!isBarcodeTaken(candidate)) return candidate
  }
  // Extremely unlikely fallback: rely on time + random alone.
  return `20${Date.now()}${Math.floor(Math.random() * 100000)}`
}

// Returns true if a product (other than `exceptProductId`) already uses this barcode.
export function isBarcodeTaken(barcode: string, exceptProductId?: string): boolean {
  if (!barcode) return false
  if (exceptProductId) {
    const row = db
      .prepare('SELECT COUNT(*) as c FROM products WHERE barcode = ? AND id != ? AND shop_id = ?')
      .get(barcode, exceptProductId, getSetting('shopId')!) as { c: number }
    return row.c > 0
  }
  const row = db
    .prepare('SELECT COUNT(*) as c FROM products WHERE barcode = ? AND shop_id = ?')
    .get(barcode, getSetting('shopId')!) as { c: number }
  return row.c > 0
}

export function getProducts(categoryId?: string, includeInactive = false): Product[] {
  const activeFilter = includeInactive ? '' : 'AND active = 1 '
  if (categoryId) {
    return mapRows<Product>(db.prepare(`SELECT * FROM products WHERE category_id = ? ${activeFilter}ORDER BY name`).all(categoryId))
  }
  const where = includeInactive ? '' : 'WHERE active = 1 '
  return mapRows<Product>(db.prepare(`SELECT * FROM products ${where}ORDER BY name`).all())
}

// A product is "in use" if it has any stock movements or appears in any sale.
// Such products must never be hard-deleted — doing so would orphan sale line
// items and break sales reports. They are deactivated instead.
export function isProductInUse(id: string): boolean {
  const mv = db.prepare('SELECT COUNT(*) as c FROM stock_movements WHERE product_id = ?').get(id) as { c: number }
  if (mv.c > 0) return true
  const saleRows = db.prepare('SELECT items FROM sales').all() as Array<{ items: string }>
  for (const row of saleRows) {
    try {
      const items = JSON.parse(row.items) as Array<{ productId?: string }>
      if (items.some((it) => it.productId === id)) return true
    } catch {
      /* skip malformed row */
    }
  }
  return false
}

export function setProductActive(id: string, active: boolean): void {
  db.prepare('UPDATE products SET active = ? WHERE id = ?').run(active ? 1 : 0, id)
}

// Read a product image from disk and return it as a base64 data URL so the
// renderer can display it without file:// access (blocked by CSP). Returns null
// when the product has no image or the file is missing.
export function getProductImageDataUrl(productId: string): string | null {
  const row = db.prepare('SELECT image_path FROM products WHERE id = ?').get(productId) as
    | { image_path: string | null }
    | undefined
  const p = row?.image_path
  if (!p) return null
  try {
    const buf = readFileSync(p)
    const mime = p.toLowerCase().endsWith('.png')
      ? 'image/png'
      : p.toLowerCase().match(/\.(jpe?g)$/)
        ? 'image/jpeg'
        : p.toLowerCase().endsWith('.webp')
          ? 'image/webp'
          : p.toLowerCase().endsWith('.gif')
            ? 'image/gif'
            : 'application/octet-stream'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
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

export function updateCategory(id: string, name: string, sortOrder?: number): void {
  const fields: string[] = ['name = ?']
  const values: unknown[] = [name]
  if (sortOrder !== undefined) {
    fields.push('sort_order = ?')
    values.push(sortOrder)
  }
  values.push(id)
  db.prepare(`UPDATE categories SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

export function getCategoryCount(): number {
  const row = db.prepare('SELECT COUNT(*) as c FROM categories').get() as { c: number }
  return row.c
}

// Delete a category. Products in it are reassigned to `reassignToId` (caller
// must pass a different, existing category). Refusing deletion when it's the
// only category keeps every product attached to a valid category.
export function deleteCategory(id: string, reassignToId: string): void {
  const count = getCategoryCount()
  if (count <= 1) {
    throw new Error('Cannot delete the only category')
  }
  if (id === reassignToId) {
    throw new Error('Choose a different category to move products into')
  }
  db.prepare('UPDATE products SET category_id = ? WHERE category_id = ?').run(reassignToId, id)
  db.prepare('DELETE FROM categories WHERE id = ?').run(id)
}

export function createProduct(input: {
  name: string
  categoryId: string
  unitType: 'piece' | 'thaan'
  defaultPrice: number
  defaultDiscount?: number
  barcode?: string | null
  sku?: string | null
  lowStockThreshold?: number
  initialStock?: number
  imageSrc?: string | null   // path of a chosen image to copy (or '' to clear)
}): Product {
  const id = uuidv4()
  const now = new Date().toISOString()
  const shopId = getSetting('shopId')!
  // Auto-generate a unique barcode if none provided.
  const barcode = input.barcode && input.barcode.trim() ? input.barcode.trim() : generateBarcode()
  const imagePath = saveProductImage(input.imageSrc)
  db.prepare(
    `INSERT INTO products (id, name, category_id, sku, barcode, unit_type, default_price, default_discount, low_stock_threshold, created_at, shop_id, image_path, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    input.name,
    input.categoryId,
    input.sku ?? null,
    barcode,
    input.unitType,
    input.defaultPrice,
    input.defaultDiscount ?? 0,
    input.lowStockThreshold ?? 5,
    now,
    shopId,
    imagePath,
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

export function updateProduct(id: string, patch: Partial<{
  name: string
  categoryId: string
  unitType: 'piece' | 'thaan'
  defaultPrice: number
  defaultDiscount: number
  barcode: string | null
  sku: string | null
  lowStockThreshold: number
  imageSrc?: string | null   // path of a chosen image to copy (or '' to clear)
}>): void {
  const fields: string[] = []
  const values: unknown[] = []
  if (patch.name !== undefined) { fields.push('name = ?'); values.push(patch.name) }
  if (patch.categoryId !== undefined) { fields.push('category_id = ?'); values.push(patch.categoryId) }
  if (patch.unitType !== undefined) { fields.push('unit_type = ?'); values.push(patch.unitType) }
  if (patch.defaultPrice !== undefined) { fields.push('default_price = ?'); values.push(patch.defaultPrice) }
  if (patch.defaultDiscount !== undefined) { fields.push('default_discount = ?'); values.push(patch.defaultDiscount) }
  if (patch.barcode !== undefined) { fields.push('barcode = ?'); values.push(patch.barcode) }
  if (patch.sku !== undefined) { fields.push('sku = ?'); values.push(patch.sku) }
  if (patch.lowStockThreshold !== undefined) { fields.push('low_stock_threshold = ?'); values.push(patch.lowStockThreshold) }
  // Image handling: copy the chosen file into userData and store the new path.
  if (patch.imageSrc !== undefined) {
    const current = db.prepare('SELECT image_path FROM products WHERE id = ?').get(id) as { image_path: string | null } | undefined
    const imagePath = saveProductImage(patch.imageSrc, current?.image_path)
    fields.push('image_path = ?')
    values.push(imagePath)
  }
  if (fields.length === 0) return
  fields.push('updated_at = ?')
  values.push(new Date().toISOString())
  values.push(id)
  db.prepare(`UPDATE products SET ${fields.join(', ')} WHERE id = ?`).run(...values)
}

// Delete (or deactivate) a product.
// - If the product has sales or stock-movement history, it is DEACTIVATED
//   (active = 0) rather than removed, so past sales/reports stay intact.
// - Otherwise it is hard-deleted (its stock_movements rows go with it).
// Returns 'deleted' | 'deactivated' so the UI can show the right message.
export function deleteProduct(id: string): 'deleted' | 'deactivated' {
  const imagePathRow = db.prepare('SELECT image_path FROM products WHERE id = ?').get(id) as
    | { image_path: string | null }
    | undefined
  if (isProductInUse(id)) {
    setProductActive(id, false)
    return 'deactivated'
  }
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM stock_movements WHERE product_id = ?').run(id)
    db.prepare('DELETE FROM products WHERE id = ?').run(id)
  })
  tx()
  // Remove the product's image from disk to avoid orphaned files.
  if (imagePathRow?.image_path) {
    try { fsUnlink(imagePathRow.image_path) } catch { /* ignore */ }
  }
  return 'deleted'
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
    `INSERT INTO stock_movements (id, product_id, category, change_amount, reason, created_at, synced, shop_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`
  ).run(id, input.productId, input.category, input.changeAmount, input.reason, now, shopId, now)
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
  orderDiscount?: number
}): Sale {
  const id = uuidv4()
  const now = new Date().toISOString()
  const shopId = getSetting('shopId')!
  const orderDiscount = input.orderDiscount ?? 0

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sales (id, branch_id, till_id, shift_id, items, total, order_discount, actual_paid_price, payment_method, created_at, synced, shop_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
    ).run(
      id,
      input.branchId,
      input.tillId,
      input.shiftId,
      JSON.stringify(input.items),
      input.total,
      orderDiscount,
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
    orderDiscount,
    actualPaidPrice: input.actualPaidPrice,
    paymentMethod: input.paymentMethod,
    createdAt: now,
    synced: 0,
    bookmarked: false
  }
}

export type SalesQuery = {
  range?: 'all' | 'today' | '7d' | '30d'
  payment?: 'all' | 'cash' | 'digital'
  search?: string
  bookmarkedOnly?: boolean
  offset?: number
  limit?: number
}

// Build the WHERE clause + bind params for a filtered/paginated sales query.
function buildSaleWhere(q: SalesQuery): { clause: string; params: unknown[] } {
  const shopId = getSetting('shopId')!
  // Legacy sales inserted before multi-shop migration have shop_id = NULL;
  // treat those as belonging to the current shop so they remain visible.
  const clauses: string[] = ['(shop_id = ? OR shop_id IS NULL)']
  const params: unknown[] = [shopId]

  if (q.range && q.range !== 'all') {
    const now = new Date()
    let from: Date
    if (q.range === 'today') {
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    } else {
      const days = q.range === '7d' ? 7 : 30
      from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (days - 1), 0, 0, 0, 0)
    }
    clauses.push('created_at >= ?')
    params.push(from.toISOString())
  }

  if (q.payment && q.payment !== 'all') {
    clauses.push('payment_method = ?')
    params.push(q.payment)
  }

  if (q.bookmarkedOnly) {
    clauses.push('bookmarked = 1')
  }

  if (q.search) {
    // Match the sale id and any product name inside the items JSON blob.
    clauses.push('(id LIKE ? OR items LIKE ?)')
    const like = `%${q.search}%`
    params.push(like, like)
  }

  const clause = `WHERE ${clauses.join(' AND ')}`
  return { clause, params }
}

export function getSales(q: SalesQuery = {}): Sale[] {
  const { clause, params } = buildSaleWhere(q)
  const limit = q.limit ?? 100
  const offset = q.offset ?? 0
  const rows = mapRows<{ id: string; branch_id: string; till_id: string; shift_id: string; items: string; total: number; actual_paid_price: number; payment_method: string; created_at: string; synced: number; bookmarked: number }>(
    db.prepare(`SELECT * FROM sales ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)
  )
  return rows.map((r) => ({ ...mapRow<Sale>(r), items: JSON.parse(r.items) as SaleItem[] }))
}

// Total count matching the same filters — used for pagination controls.
export function getSalesCount(q: SalesQuery = {}): number {
  const { clause, params } = buildSaleWhere(q)
  const row = db.prepare(`SELECT COUNT(*) as c FROM sales ${clause}`).get(...params) as { c: number }
  return row.c
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

// Toggle/set the bookmarked flag on a sale (star in the History tab).
export function setSaleBookmarked(id: string, bookmarked: boolean): void {
  db.prepare('UPDATE sales SET bookmarked = ? WHERE id = ?').run(bookmarked ? 1 : 0, id)
}

// ---------- Returns / refunds ----------
// A refund REVERSES stock (adds it back) and is recorded atomically with the
// return row. Never let a partial failure leave the DB inconsistent.

// Sum of already-returned quantities per productId for a given sale.
export function getRefundedForSale(saleId: string): Record<string, number> {
  const rows = db
    .prepare('SELECT items FROM returns WHERE sale_id = ?')
    .all(saleId) as { items: string }[]
  const byProduct: Record<string, number> = {}
  for (const r of rows) {
    try {
      const items = JSON.parse(r.items) as SaleItem[]
      for (const it of items) {
        byProduct[it.productId] = (byProduct[it.productId] ?? 0) + (it.quantity || 0)
      }
    } catch {
      /* ignore malformed return rows */
    }
  }
  return byProduct
}

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

  // Server-side over-refund guard: clamp each item to its sellable remainder
  // (sold quantity minus what has already been returned for this sale).
  const sale = getSale(input.saleId)
  if (!sale) throw new Error('Sale not found')
  const soldByProduct: Record<string, number> = {}
  for (const it of sale.items) soldByProduct[it.productId] = (soldByProduct[it.productId] ?? 0) + (it.quantity || 0)
  const alreadyReturned = getRefundedForSale(input.saleId)

  const guardedItems: SaleItem[] = []
  for (const it of input.items) {
    if (!it.quantity || it.quantity <= 0) continue
    const sold = soldByProduct[it.productId] ?? 0
    const remainder = Math.max(0, sold - (alreadyReturned[it.productId] ?? 0))
    if (remainder <= 0) continue
    const clamped = Math.min(it.quantity, remainder)
    guardedItems.push({ ...it, quantity: clamped })
  }
  if (guardedItems.length === 0) throw new Error('This sale has already been fully refunded')

  const guardedTotal = round(
    guardedItems.reduce((sum, it) => sum + computeLineTotal(it.price, it.quantity, it.discount, it.unitType === 'thaan' ? it.cutLength : undefined), 0)
  )

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
      JSON.stringify(guardedItems),
      guardedTotal,
      guardedTotal,
      input.paymentMethod,
      now,
      shopId
    )

    const moveStmt = db.prepare(
      `INSERT INTO stock_movements (id, product_id, category, change_amount, reason, created_at, synced, shop_id)
       VALUES (?, ?, ?, ?, ?, ?, 0, ?)`
    )
    for (const item of guardedItems) {
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
    items: guardedItems,
    total: guardedTotal,
    refundAmount: guardedTotal,
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

export function getOpenShift(tillId?: string): Shift | null {
  const byTill = db
    .prepare('SELECT * FROM shifts WHERE till_id = ? AND closed_at IS NULL ORDER BY opened_at DESC LIMIT 1')
    .get(tillId) as Record<string, unknown> | undefined
  if (byTill) return mapRow<Shift>(byTill)
  // Fallback: if no open shift matches the requested till (e.g. the open shift is on
  // the default till while currentTillId points elsewhere, or a single-till setup),
  // return the most recent open shift overall so the UI can still offer "Close".
  const any = db
    .prepare('SELECT * FROM shifts WHERE closed_at IS NULL ORDER BY opened_at DESC LIMIT 1')
    .get() as Record<string, unknown> | undefined
  return any ? mapRow<Shift>(any) : null
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

export function getShifts(query: ShiftQuery = {}): Shift[] {
  const { tillId, from, to, limit = 50, offset = 0 } = query
  const clauses: string[] = []
  const params: unknown[] = []
  if (tillId) {
    clauses.push('till_id = ?')
    params.push(tillId)
  }
  if (from) {
    clauses.push('opened_at >= ?')
    params.push(from)
  }
  if (to) {
    clauses.push('opened_at <= ?')
    params.push(to)
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')} ` : ''
  params.push(limit, offset)
  return mapRows<Shift>(
    db.prepare(`SELECT * FROM shifts ${where}ORDER BY opened_at DESC LIMIT ? OFFSET ?`).all(...params)
  )
}

// Read-only reconciliation breakdown for a single shift. Mirrors closeShift's
// expected-cash math (opening + net cash sales) but does not mutate the row.
export function getShiftSummary(shiftId: string): ShiftSummary | null {
  const shift = mapRow<Shift | undefined>(
    db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId) as Record<string, unknown>
  )
  if (!shift) return null

  const shopId = getSetting('shopId')
  const shopFilterPlain = `(shop_id = ? OR shop_id IS NULL)`

  const salesRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END), 0) as cash,
         COALESCE(SUM(CASE WHEN payment_method='digital' THEN total ELSE 0 END), 0) as digital,
         COUNT(*) as count
       FROM sales WHERE shift_id = ? AND ${shopFilterPlain}`
    )
    .get(shiftId, shopId) as { cash: number; digital: number; count: number }

  const refundRow = db
    .prepare(
      `SELECT COALESCE(SUM(refund_amount), 0) as refunds
       FROM returns WHERE shift_id = ? AND payment_method = 'cash' AND ${shopFilterPlain}`
    )
    .get(shiftId, shopId) as { refunds: number }

  const expectedCash =
    shift.closingCash !== null ? shift.expectedCash : shift.openingCash + salesRow.cash
  const variance =
    shift.closingCash !== null && shift.expectedCash !== null
      ? shift.closingCash - shift.expectedCash
      : null

  return {
    shiftId: shift.id,
    tillId: shift.tillId,
    openingCash: shift.openingCash,
    closingCash: shift.closingCash,
    expectedCash,
    variance,
    cashSales: salesRow.cash,
    digitalSales: salesRow.digital,
    cashRefunds: refundRow.refunds,
    salesCount: salesRow.count,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt
  }
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

export function updateShopAuthPassword(shopId: string, password: string): void {
  db.prepare('UPDATE shops SET auth_password = ? WHERE id = ?').run(password, shopId)
}

export function updateShopUserId(shopId: string, userId: string): void {
  db.prepare('UPDATE shops SET user_id = ? WHERE id = ?').run(userId, shopId)
}

export function getShop(): { id: string; name: string; accessToken: string; userId: string | null; authPassword: string | null } | null {
  const shopId = getSetting('shopId')
  if (!shopId) return null
  const row = db.prepare('SELECT * FROM shops WHERE id = ?').get(shopId) as Record<string, unknown> | undefined
  return row ? mapRow<{ id: string; name: string; accessToken: string; userId: string | null; authPassword: string | null }>(row) : null
}

export function getDashboard(range: 'today' | '7d' | '30d' = 'today'): {
  todaySales: { total: number; count: number }
  cashDigitalSplit: { cash: number; digital: number }
  cashInTill: number
  openingCash: number
  bestCategory: { name: string; total: number } | null
  lowStock: Array<{ id: string; name: string; stock: number; threshold: number }>
  hourlyTrend: Array<{ hour: string; total: number }>
  topProducts: Array<{ name: string; qty: number; total: number }>
} {
  const shopId = getSetting('shopId')!
  const now = new Date()

  // Compute the "from" boundary for the selected range.
  let fromIso: string
  let dayCount = 1
  if (range === 'today') {
    const t = new Date(now)
    t.setHours(0, 0, 0, 0)
    fromIso = t.toISOString()
  } else {
    dayCount = range === '7d' ? 7 : 30
    const t = new Date(now)
    t.setDate(t.getDate() - (dayCount - 1))
    t.setHours(0, 0, 0, 0)
    fromIso = t.toISOString()
  }

  // Legacy sales created before the multi-shop migration have shop_id = NULL.
  // Treat NULL shop_id as belonging to the current shop so those rows aren't dropped.
  const shopFilter = `(s.shop_id = ? OR s.shop_id IS NULL)`
  const shopFilterPlain = `(shop_id = ? OR shop_id IS NULL)`

  const salesRow = db
    .prepare(
      `SELECT COALESCE(SUM(total), 0) as total, COUNT(*) as count
       FROM sales WHERE created_at >= ? AND ${shopFilterPlain}`
    )
    .get(fromIso, shopId) as { total: number; count: number }

  // Cash vs digital split is based on the NET sale total (s.total), NOT the
  // amount physically handed over (actual_paid_price). Change returned to the
  // customer is not part of the till, so it must not inflate the cash figure.
  const splitRow = db
    .prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END), 0) as cash,
         COALESCE(SUM(CASE WHEN payment_method='digital' THEN total ELSE 0 END), 0) as digital
        FROM sales WHERE created_at >= ? AND ${shopFilterPlain}`
    )
    .get(fromIso, shopId) as { cash: number; digital: number }

  // Cash actually in the till = opening cash of the open shift
  //   + net cash sales during that shift  - cash refunds given back.
  // This excludes any overpayment/change returned to the customer.
  const openShift = getOpenShift()
  const openingCash = openShift?.openingCash ?? 0
  let cashInTill = openingCash
  if (openShift) {
    const shiftCash = db
      .prepare(
        `SELECT
           COALESCE(SUM(CASE WHEN payment_method='cash' THEN total ELSE 0 END), 0) as sales
         FROM sales WHERE shift_id = ? AND ${shopFilterPlain}`
      )
      .get(openShift.id, shopId) as { sales: number }
    const refundRow = db
      .prepare(
        `SELECT COALESCE(SUM(refund_amount), 0) as refunds
         FROM returns WHERE shift_id = ? AND payment_method = 'cash' AND ${shopFilterPlain}`
      )
      .get(openShift.id, shopId) as { refunds: number }
    // Cash in the till = opening cash + cash sales value. The amount handed over
    // over-and-above the sale total (changeOut) is returned to the customer and
    // must NOT be counted as till cash; refunds paid out are subtracted.
    cashInTill = openingCash + shiftCash.sales - refundRow.refunds
  }

  // Best category by revenue in range
  const bestCatRow = db
    .prepare(
      `SELECT c.name as name, COALESCE(SUM(s.total), 0) as total
       FROM sales s, json_each(s.items) as je
       JOIN products p ON p.id = json_extract(je.value, '$.productId')
       JOIN categories c ON c.id = p.category_id
       WHERE s.created_at >= ? AND ${shopFilter}
       GROUP BY c.id
       ORDER BY total DESC
       LIMIT 1`
    )
    .get(fromIso, shopId) as { name: string; total: number } | undefined

  // Top products by revenue in range
  const topRows = db
    .prepare(
      `SELECT p.name as name,
              COALESCE(SUM(CAST(json_extract(je.value, '$.quantity') AS REAL)), 0) as qty,
              COALESCE(SUM(CAST(json_extract(je.value, '$.lineTotal') AS REAL)), 0) as total
       FROM sales s, json_each(s.items) as je
       JOIN products p ON p.id = json_extract(je.value, '$.productId')
       WHERE s.created_at >= ? AND ${shopFilter}
       GROUP BY p.id
       ORDER BY total DESC
       LIMIT 5`
    )
    .all(fromIso, shopId) as Array<{ name: string; qty: number; total: number }>

  // Trend buckets (hourly for today, daily for 7d/30d)
  let hourlyTrend: Array<{ hour: string; total: number }>
  if (range === 'today') {
    const buckets = Array.from({ length: 15 }, (_, i) => 8 + i).map((h) => {
      const padded = String(h).padStart(2, '0')
      return { hour: `${padded}:00`, key: padded, total: 0 }
    })
    // created_at is stored in UTC (e.g. "…Z"), so strftime('%H', …) would yield
    // the UTC hour and mis-bucket sales in non-UTC timezones. Compute the LOCAL
    // hour in JS instead so the buckets line up with the store's local day.
    const rows = db
      .prepare(`SELECT created_at, total FROM sales WHERE created_at >= ? AND ${shopFilterPlain}`)
      .all(fromIso, shopId) as Array<{ created_at: string; total: number }>
    const map: Record<string, number> = {}
    for (const r of rows) {
      const localHour = new Date(r.created_at).getHours()
      const key = String(localHour).padStart(2, '0')
      map[key] = (map[key] ?? 0) + r.total
    }
    hourlyTrend = buckets.map((b) => ({ hour: b.hour, total: map[b.key] ?? 0 }))
  } else {
    const buckets: Array<{ date: string; label: string }> = []
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(now)
      d.setDate(d.getDate() - i)
      d.setHours(0, 0, 0, 0)
      buckets.push({ date: d.toISOString().slice(0, 10), label: d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) })
    }
    // Bucket by the LOCAL calendar date (created_at is UTC), so a sale just
    // after local midnight isn't attributed to the previous UTC day.
    const rows = db
      .prepare(`SELECT created_at, total FROM sales WHERE created_at >= ? AND ${shopFilterPlain}`)
      .all(fromIso, shopId) as Array<{ created_at: string; total: number }>
    const map: Record<string, number> = {}
    for (const r of rows) {
      const localDate = new Date(r.created_at).toISOString().slice(0, 10)
      map[localDate] = (map[localDate] ?? 0) + r.total
    }
    hourlyTrend = buckets.map((b) => ({ hour: b.label, total: map[b.date] ?? 0 }))
  }

  // Low stock: products whose computed stock < threshold.
  // Include legacy products that predate the multi-shop migration (NULL shop_id).
  const stockRows = db
    .prepare(
      `SELECT p.id, p.name, p.low_stock_threshold as threshold,
              COALESCE((SELECT SUM(change_amount) FROM stock_movements WHERE product_id = p.id), 0) as stock
       FROM products p
       WHERE (p.shop_id = ? OR p.shop_id IS NULL)`
    )
    .all(shopId) as Array<{ id: string; name: string; stock: number; threshold: number }>
  const lowStock = stockRows.filter((r) => r.stock < r.threshold)

  return {
    todaySales: { total: salesRow.total, count: salesRow.count },
    cashDigitalSplit: { cash: splitRow.cash, digital: splitRow.digital },
    cashInTill,
    openingCash,
    bestCategory: bestCatRow && bestCatRow.total > 0 ? bestCatRow : null,
    lowStock,
    hourlyTrend,
    topProducts: topRows
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
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`UPDATE ${table} SET synced = 1 WHERE id IN (${placeholders})`).run(...ids)
}

// Return the local row IDs that are marked synced=1 for a given shop. Used by the
// sync reconciliation pass to detect "stranded" rows (marked synced locally but
// absent in the cloud) and reset them so they get re-pushed on the next sync.
export function getSyncedIds(
  table: 'sales' | 'stock_movements' | 'returns' | 'error_logs' | 'feedback',
  shopId: string
): string[] {
  const rows = db
    .prepare(`SELECT id FROM ${table} WHERE synced = 1 AND shop_id = ?`)
    .all(shopId) as Array<{ id: string }>
  return rows.map((r) => r.id)
}

// Reset specific rows back to synced=0 so they are picked up by the next push.
// `ids` are matched by primary key for the given table.
export function resetSynced(
  table: 'sales' | 'stock_movements' | 'returns' | 'error_logs' | 'feedback',
  ids: string[]
): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(',')
  db.prepare(`UPDATE ${table} SET synced = 0 WHERE id IN (${placeholders})`).run(...ids)
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

// ---------- Two-way sync: pull watermark + local upsert ----------

// Per-shop watermark of the last time we pulled cloud changes. Stored as a
// setting so it survives restarts. Keyed by shop to stay correct if the shop id
// ever changes.
export function getLastSyncPull(): string | null {
  return getSetting('lastSyncPull')
}

export function setLastSyncPull(iso: string): void {
  setSetting('lastSyncPull', iso)
}

// Apply a cloud row into the local DB using last-write-wins on `updated_at`.
//   - products / categories: mutate-only. If the local row is newer, keep it.
//   - stock_movements: append-only (insert or ignore by PK) — no conflict.
// `row` keys are snake_case (matching the cloud columns).
export function upsertSyncedRow(table: 'products' | 'categories' | 'stock_movements', row: Record<string, unknown>): void {
  const id = row.id as string
  if (!id) return

  if (table === 'stock_movements') {
    // Append-only. Cloud is the source for movements created elsewhere (e.g. PWA).
    const exists = db.prepare('SELECT 1 FROM stock_movements WHERE id = ?').get(id)
    if (exists) return
    db.prepare(
      `INSERT OR IGNORE INTO stock_movements
       (id, product_id, category, change_amount, reason, created_at, synced, shop_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
    ).run(
      id,
      row.product_id,
      row.category,
      row.change_amount,
      row.reason,
      row.created_at,
      row.shop_id,
      row.updated_at
    )
    return
  }

  // products / categories: last-write-wins
  const existing = db.prepare(`SELECT updated_at FROM ${table} WHERE id = ?`).get(id) as
    | { updated_at: string }
    | undefined
  if (!existing) {
    if (table === 'products') {
      db.prepare(
        `INSERT OR IGNORE INTO products
         (id, name, category_id, sku, barcode, unit_type, default_price, default_discount, low_stock_threshold, created_at, shop_id, image_path, active, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        row.name,
        row.category_id,
        row.sku ?? null,
        row.barcode ?? null,
        row.unit_type ?? 'piece',
        row.default_price ?? 0,
        row.default_discount ?? 0,
        row.low_stock_threshold ?? 5,
        row.created_at,
        row.shop_id,
        row.image_path ?? null,
        row.active ?? 1,
        row.updated_at
      )
    } else {
      db.prepare(
        `INSERT OR IGNORE INTO categories
         (id, name, sort_order, shop_id, updated_at)
         VALUES (?, ?, ?, ?, ?)`
      ).run(id, row.name, row.sort_order ?? 0, row.shop_id, row.updated_at)
    }
    return
  }

  // Existing row: only overwrite if the cloud version is strictly newer.
  const cloudTs = new Date(row.updated_at as string).getTime()
  const localTs = new Date(existing.updated_at).getTime()
  if (isNaN(cloudTs) || cloudTs <= localTs) return

  if (table === 'products') {
    db.prepare(
      `UPDATE products SET
         name = ?, category_id = ?, sku = ?, barcode = ?, unit_type = ?,
         default_price = ?, default_discount = ?, low_stock_threshold = ?,
         shop_id = ?, active = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      row.name,
      row.category_id,
      row.sku ?? null,
      row.barcode ?? null,
      row.unit_type ?? 'piece',
      row.default_price ?? 0,
      row.default_discount ?? 0,
      row.low_stock_threshold ?? 5,
      row.shop_id,
      row.active ?? 1,
      row.updated_at,
      id
    )
  } else {
    db.prepare(
      `UPDATE categories SET name = ?, sort_order = ?, shop_id = ?, updated_at = ? WHERE id = ?`
    ).run(row.name, row.sort_order ?? 0, row.shop_id, row.updated_at, id)
  }
}

// ---------- Backup ----------

export function getDbPath(): string {
  return join(app.getPath('userData'), 'pos.db')
}
