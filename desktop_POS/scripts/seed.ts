// Seed script — manually re-seeds default data for testing.
// The DB already auto-seeds on first run (see src/main/db.ts seedDefaults()),
// but this is useful for resetting to a known state during development.
import Database from 'better-sqlite3'
import { join } from 'path'

// This script is run with bun directly, so we resolve the db path manually.
const dbPath = process.env.POS_DB_PATH ?? join(process.cwd(), 'pos.db')
console.log('[seed] using db at', dbPath)

const db = new Database(dbPath)
db.pragma('journal_mode = WAL')

// Insert default branch + till if missing
db.exec(`
  CREATE TABLE IF NOT EXISTS branches (id TEXT PRIMARY KEY, name TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS tills (id TEXT PRIMARY KEY, name TEXT NOT NULL, branch_id TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS categories (id TEXT PRIMARY KEY, name TEXT NOT NULL, sort_order INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY, name TEXT NOT NULL, category_id TEXT NOT NULL, sku TEXT, barcode TEXT,
    unit_type TEXT NOT NULL DEFAULT 'piece', default_price REAL NOT NULL DEFAULT 0,
    low_stock_threshold INTEGER NOT NULL DEFAULT 5, created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS stock_movements (
    id TEXT PRIMARY KEY, product_id TEXT NOT NULL, category TEXT NOT NULL, change_amount REAL NOT NULL,
    reason TEXT NOT NULL, created_at TEXT NOT NULL, synced INTEGER NOT NULL DEFAULT 0
  );
`)

const insertBranch = db.prepare('INSERT OR IGNORE INTO branches (id, name) VALUES (?, ?)')
insertBranch.run('branch-default', 'Main Branch')

const insertTill = db.prepare('INSERT OR IGNORE INTO tills (id, name, branch_id) VALUES (?, ?, ?)')
insertTill.run('till-1', 'Till 1', 'branch-default')

console.log('[seed] done')
db.close()
