// Backup & export — runs in the MAIN PROCESS.
// Backup = file copy of the SQLite database to a user-chosen folder/USB.
// Export = xlsx report generation.
import { app, dialog, ipcMain } from 'electron'
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getDbPath, getSalesReport } from './db'

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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
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

  const out = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
  try {
    writeFileSync(result.filePath, out)
    return { ok: true, path: result.filePath }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

export function registerBackupIpc(): void {
  ipcMain.handle('db:backup', () => backupDatabase())
  ipcMain.handle('db:export-report', (_e, input) => exportReport(input))
}

export function getAppDataPath(): string {
  return app.getPath('userData')
}
