// Backup & export — runs in the MAIN PROCESS.
// Backup = file copy of the SQLite database to a user-chosen folder/USB.
// Export = xlsx report generation.
// Backup & export — runs in the MAIN PROCESS.
// Backup = file copy of the SQLite database to a user-chosen folder/USB.
// Export = xlsx report generation.
import { app, dialog, ipcMain } from 'electron'
import { copyFileSync, existsSync, mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getDbPath, getSetting, getSalesReport, getStockReport, getCashReport, getSales, type SalesQuery } from './db'

export async function backupDatabase(): Promise<{ ok: boolean; path?: string; error?: string }> {
  const result = await dialog.showOpenDialog({
    title: 'Choose backup destination folder',
    properties: ['openDirectory', 'createDirectory']
  })
  if (result.canceled || result.filePaths.length === 0) {
    return { ok: false, error: 'Backup cancelled' }
  }
  const destDir = result.filePaths[0]
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

  const src = getDbPath()
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(destDir, `pos-backup-${stamp}.db`)
  try {
    copyFileSync(src, dest)
    return { ok: true, path: dest }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

export async function exportReport(input: {
  type: 'sales' | 'stock' | 'cash'
  from: string
  to: string
}): Promise<{ ok: boolean; path?: string; error?: string }> {
  const result = await dialog.showSaveDialog({
    title: 'Save report',
    defaultPath: `report-${input.type}-${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel', extensions: ['xlsx'] }]
  })
  if (result.canceled || !result.filePath) {
    return { ok: false, error: 'Export cancelled' }
  }

  // Lazy import xlsx (keeps startup fast)
  const XLSX = require('xlsx')
  const wb = XLSX.utils.book_new()

  if (input.type === 'sales') {
    const sales = getSalesReport(input.from, input.to)
    const rows = sales.flatMap((s) =>
      s.items.map((it) => ({
        SaleId: s.id,
        Date: s.createdAt,
        Product: it.name,
        UnitType: it.unitType,
        Quantity: it.quantity,
        Price: it.price,
        LineTotal: it.lineTotal,
        PaymentMethod: s.paymentMethod,
        SaleTotal: s.total,
        Paid: s.actualPaidPrice
      }))
    )
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Sales')
  }

  if (input.type === 'stock') {
    const stock = getStockReport()
    const rows = stock.map((p) => ({
      Product: p.name,
      Category: p.category,
      UnitType: p.unitType,
      Price: p.defaultPrice,
      Stock: p.stock,
      LowStockThreshold: p.lowStockThreshold,
      Status: p.stock <= 0 ? 'Out' : p.stock <= p.lowStockThreshold ? 'Low' : 'OK'
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Stock')
  }

  if (input.type === 'cash') {
    const cash = getCashReport(input.from, input.to)
    const rows = cash.map((c) => ({
      Date: c.date,
      Transactions: c.count,
      CashCollected: c.total
    }))
    const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Date: '', Transactions: 0, CashCollected: 0 }])
    XLSX.utils.book_append_sheet(wb, ws, 'Cash')
  }

  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  try {
    writeFileSync(result.filePath, out)
    return { ok: true, path: result.filePath }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

// Export the currently-filtered sales list as a CSV (one row per sale line,
// like the xlsx sales export) so the History tab can download filtered reports.
export async function exportSalesCsv(query: SalesQuery): Promise<{ ok: boolean; path?: string; error?: string }> {
  const result = await dialog.showSaveDialog({
    title: 'Save sales report',
    defaultPath: `sales-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  })
  if (result.canceled || !result.filePath) {
    return { ok: false, error: 'Export cancelled' }
  }

  const sales = getSales({ ...query, limit: 100000, offset: 0 })
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const header = ['Sale ID', 'Date', 'Product', 'Unit Type', 'Quantity', 'Price', 'Discount %', 'Line Total', 'Payment Method', 'Sale Total', 'Paid']
  const lines = [header.join(',')]
  for (const s of sales) {
    for (const it of s.items) {
      lines.push([
        s.id,
        s.createdAt,
        it.name,
        it.unitType,
        it.quantity,
        it.price,
        it.discount ?? 0,
        it.lineTotal,
        s.paymentMethod,
        s.total,
        s.actualPaidPrice
      ].map(esc).join(','))
    }
  }

  try {
    writeFileSync(result.filePath, lines.join('\n'), 'utf8')
    return { ok: true, path: result.filePath }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

export function registerBackupIpc(): void {
  ipcMain.handle('db:backup', () => backupDatabase())
  ipcMain.handle('db:export-report', (_e, input) => exportReport(input))
  ipcMain.handle('db:export-sales-csv', (_e, query) => exportSalesCsv(query))
}

export function getAppDataPath(): string {
  return app.getPath('userData')
}

// ---------- Auto-backup ----------

const AUTO_BACKUP_PREFIX = 'pos-auto-'
const AUTO_BACKUP_KEEP = 30

function performAutoBackup(): string | null {
  const src = getDbPath()
  let destDir = getSetting('backupPath')
  if (!destDir) {
    destDir = join(app.getPath('userData'), 'backups')
  }
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true })

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const dest = join(destDir, `${AUTO_BACKUP_PREFIX}${stamp}.db`)
  copyFileSync(src, dest)
  pruneAutoBackups(destDir)
  return dest
}

function pruneAutoBackups(dir: string): void {
  try {
    const files = readdirSync(dir)
      .filter((f) => f.startsWith(AUTO_BACKUP_PREFIX) && f.endsWith('.db'))
      .sort() // timestamp-based names sort chronologically
    const excess = files.length - AUTO_BACKUP_KEEP
    for (let i = 0; i < excess; i++) {
      try {
        unlinkSync(join(dir, files[i]))
      } catch {
        // ignore individual prune failures
      }
    }
  } catch {
    // ignore
  }
}

let autoBackupTimer: NodeJS.Timeout | null = null

export function startAutoBackup(): void {
  const run = () => {
    try {
      if (getSetting('autoBackup') !== 'true') return
      const dest = performAutoBackup()
      if (dest) console.log('[backup] auto-backup written to', dest)
    } catch (err) {
      console.error('[backup] auto-backup failed:', err)
    }
  }

  // First run ~1 min after launch (gives settings time to load), then daily.
  setTimeout(run, 60_000)
  autoBackupTimer = setInterval(run, 24 * 60 * 60 * 1000)

  // React to settings toggles (autoBackup / backupPath changes).
  ipcMain.on('settings-changed', run)
}

export function stopAutoBackup(): void {
  if (autoBackupTimer) {
    clearInterval(autoBackupTimer)
    autoBackupTimer = null
  }
}
