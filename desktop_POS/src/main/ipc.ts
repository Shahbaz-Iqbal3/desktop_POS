// IPC registration — wires main-process DB functions to renderer-process calls.
// The renderer NEVER imports better-sqlite3; it calls window.pos.* which
// routes through these handlers.
import { ipcMain, dialog, app, BrowserWindow } from 'electron'
import * as fs from 'fs'
import { readFileSync } from 'fs'
import * as path from 'path'
import {
  getProducts,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  createProduct,
  updateProduct,
  deleteProduct,
  setProductActive,
  isBarcodeTaken,
  generateBarcode,
  getProductImageDataUrl,
  createSale,
  getSales,
  getSalesCount,
  getLastSale,
  getSale,
  setSaleBookmarked,
  createReturn,
  getReturns,
  getRefundedForSale,
  holdCart,
  getHeldCarts,
  recallCart,
  deleteHeldCart,
  getStockLevel,
  getStockLevels,
  addStockMovement,
  getOpenShift,
  openShift,
  closeShift,
  getShifts,
  getShiftSummary,
  getSettings,
  getSetting,
  setSetting,
  setSettings,
  logError,
  submitFeedback,
  getDashboard,
  getSalesReport,
  getShop,
  getBranches,
  getTills,
  createBranch,
  createTill
} from './db'
import { registerSyncIpc } from './sync'
import { isOperational, licenseBlockedError } from './license'

// Wrap a handler so it only runs when the license is operational (valid,
// grace, or active trial). Otherwise returns a LICENSE_REQUIRED error so the
// renderer can surface the lockout instead of performing the operation.
function guard<T>(handler: (...args: any[]) => T): (...args: any[]) => T | ReturnType<typeof licenseBlockedError> {
  return (...args: any[]) => {
    if (!isOperational()) {
      ipcMain.emit('license:blocked')
      return licenseBlockedError()
    }
    return handler(...args)
  }
}

export function registerDbIpc(): void {
  // Products / categories
  ipcMain.handle('pos:get-products', (_e, categoryId?: string) => getProducts(categoryId))
  ipcMain.handle('pos:get-categories', () => getCategories())
  ipcMain.handle('pos:create-category', guard((_e, name: string, sortOrder = 0) =>
    createCategory(name, sortOrder)
  ))
  ipcMain.handle('pos:update-category', guard((_e, id: string, name: string, sortOrder?: number) =>
    updateCategory(id, name, sortOrder)
  ))
  ipcMain.handle('pos:delete-category', guard((_e, id: string, reassignToId: string) =>
    deleteCategory(id, reassignToId)
  ))
  ipcMain.handle('pos:create-product', guard((_e, input) => createProduct(input)))
  ipcMain.handle('pos:update-product', guard((_e, id: string, patch) => updateProduct(id, patch)))
  ipcMain.handle('pos:delete-product', guard((_e, id: string) => deleteProduct(id)))
  ipcMain.handle('pos:set-product-active', guard((_e, id: string, active: boolean) => setProductActive(id, active)))
  ipcMain.handle('pos:is-barcode-taken', (_e, barcode: string, exceptProductId?: string) =>
    isBarcodeTaken(barcode, exceptProductId)
  )
  ipcMain.handle('pos:generate-barcode', () => generateBarcode())

  // Product image — open a native file picker and copy the chosen image into
  // userData/product-images, returning the stable destination path.
  ipcMain.handle('pos:select-product-image', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: 'Select product image',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'gif'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })

  // Read any local image file and return it as a base64 data URL (used to
  // preview a freshly chosen product image before it is copied on save).
  ipcMain.handle('pos:read-image-data-url', (_e, filePath: string) => {
    try {
      const buf = readFileSync(filePath)
      const lower = filePath.toLowerCase()
      const mime = lower.endsWith('.png')
        ? 'image/png'
        : lower.match(/\.(jpe?g)$/)
          ? 'image/jpeg'
          : lower.endsWith('.webp')
            ? 'image/webp'
            : lower.endsWith('.gif')
              ? 'image/gif'
              : 'application/octet-stream'
      return `data:${mime};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })

  // Return a product's image as a base64 data URL for safe display in the renderer.
  ipcMain.handle('pos:get-product-image', (_e, productId: string) => getProductImageDataUrl(productId))

  // Sales
  ipcMain.handle('pos:create-sale', guard((_e, input) => createSale(input)))
  ipcMain.handle('pos:get-sales', (_e, query) => getSales(query ?? {}))
  ipcMain.handle('pos:get-sales-count', (_e, query) => getSalesCount(query ?? {}))
  ipcMain.handle('pos:get-last-sale', () => getLastSale())
  ipcMain.handle('pos:get-sale', (_e, id: string) => getSale(id))
  ipcMain.handle('pos:set-sale-bookmarked', guard((_e, id: string, bookmarked: boolean) => setSaleBookmarked(id, bookmarked)))
  ipcMain.handle('pos:create-return', guard((_e, input) => createReturn(input)))
  ipcMain.handle('pos:get-returns', (_e, limit = 100) => getReturns(limit))
  ipcMain.handle('pos:get-refunded-for-sale', (_e, saleId: string) => getRefundedForSale(saleId))

  // Branches / Tills
  ipcMain.handle('pos:get-branches', () => getBranches())
  ipcMain.handle('pos:create-branch', guard((_e, name: string) => createBranch(name)))
  ipcMain.handle('pos:get-tills', () => getTills())
  ipcMain.handle('pos:create-till', guard((_e, name: string, branchId: string) =>
    createTill(name, branchId)
  ))

  // Held carts
  ipcMain.handle('pos:hold-cart', guard((_e, label: string, items, total: number) => holdCart(label, items, total)))
  ipcMain.handle('pos:get-held-carts', () => getHeldCarts())
  ipcMain.handle('pos:recall-cart', guard((_e, id: string) => recallCart(id)))
  ipcMain.handle('pos:delete-held-cart', guard((_e, id: string) => deleteHeldCart(id)))

  // Stock
  ipcMain.handle('pos:get-stock-level', (_e, productId: string) => getStockLevel(productId))
  ipcMain.handle('pos:get-stock-levels', () => getStockLevels())
  ipcMain.handle('pos:add-stock-movement', guard((_e, input) => addStockMovement(input)))

  // Shifts
  ipcMain.handle('pos:get-open-shift', (_e, tillId: string) => getOpenShift(tillId))
  ipcMain.handle('pos:open-shift', guard((_e, tillId: string, openingCash: number) =>
    openShift(tillId, openingCash)
  ))
  ipcMain.handle('pos:close-shift', guard((_e, shiftId: string, countedCash: number) =>
    closeShift(shiftId, countedCash)
  ))
  ipcMain.handle('pos:get-shifts', (_e, query) => getShifts(query ?? {}))
  ipcMain.handle('pos:get-shift-summary', (_e, shiftId: string) => getShiftSummary(shiftId))

  // Settings
  ipcMain.handle('pos:get-settings', () => getSettings())
  ipcMain.handle('pos:get-setting', (_e, key: string) => getSetting(key))
  ipcMain.handle('pos:set-setting', guard((_e, key: string, value: string) => {
    setSetting(key, value)
    ipcMain.emit('settings-changed')
  }))
  ipcMain.handle('pos:set-settings', guard((_e, values) => {
    setSettings(values)
    ipcMain.emit('settings-changed')
  }))

  // Receipt logo — open a native file picker and copy the chosen PNG into the
  // app's userData so the stored path is stable (independent of the source file).
  ipcMain.handle('pos:select-receipt-logo', async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const result = await dialog.showOpenDialog(win, {
      title: 'Select receipt logo',
      properties: ['openFile'],
      filters: [{ name: 'PNG Image', extensions: ['png'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const src = result.filePaths[0]
    const dest = path.join(app.getPath('userData'), 'receipt-logo.png')
    fs.copyFileSync(src, dest)
    return dest
  })

  // Return the configured receipt logo as a base64 data URL so the renderer can
  // display it in the preview without relying on file:// access (blocked by CSP).
  ipcMain.handle('pos:get-receipt-logo', () => {
    const logoPath = getSetting('receiptLogoPath')
    if (!logoPath) return null
    try {
      const buf = fs.readFileSync(logoPath)
      const ext = logoPath.toLowerCase().endsWith('.png') ? 'png' : 'jpeg'
      return `data:image/${ext};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  })

  // Telemetry
  ipcMain.handle('telemetry:log-error', (_e, input) => {
    logError(input)
    return true
  })
  ipcMain.handle('telemetry:submit-feedback', (_e, input) => {
    submitFeedback(input)
    return true
  })

  // Reports
  ipcMain.handle('reports:get-dashboard', (_e, range?: 'today' | '7d' | '30d') => getDashboard(range))
  ipcMain.handle('reports:get-sales-report', (_e, from: string, to: string) =>
    getSalesReport(from, to)
  )

  // Shop management
  ipcMain.handle('shop:get', () => getShop())

  // Register sync IPC handlers
  registerSyncIpc()
}
