// IPC registration — wires main-process DB functions to renderer-process calls.
// The renderer NEVER imports better-sqlite3; it calls window.pos.* which
// routes through these handlers.
import { ipcMain } from 'electron'
import {
  getProducts,
  getCategories,
  createCategory,
  createProduct,
  updateProduct,
  deleteProduct,
  createSale,
  getSales,
  getLastSale,
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
  getSettings,
  getSetting,
  setSetting,
  setSettings,
  logError,
  submitFeedback,
  getDashboard,
  getSalesReport
} from './db'

export function registerDbIpc(): void {
  // Products / categories
  ipcMain.handle('pos:get-products', (_e, categoryId?: string) => getProducts(categoryId))
  ipcMain.handle('pos:get-categories', () => getCategories())
  ipcMain.handle('pos:create-category', (_e, name: string, sortOrder = 0) =>
    createCategory(name, sortOrder)
  )
  ipcMain.handle('pos:create-product', (_e, input) => createProduct(input))
  ipcMain.handle('pos:update-product', (_e, id: string, patch) => updateProduct(id, patch))
  ipcMain.handle('pos:delete-product', (_e, id: string) => deleteProduct(id))

  // Sales
  ipcMain.handle('pos:create-sale', (_e, input) => createSale(input))
  ipcMain.handle('pos:get-sales', (_e, limit = 100) => getSales(limit))
  ipcMain.handle('pos:get-last-sale', () => getLastSale())

  // Held carts
  ipcMain.handle('pos:hold-cart', (_e, label: string, items, total: number) => holdCart(label, items, total))
  ipcMain.handle('pos:get-held-carts', () => getHeldCarts())
  ipcMain.handle('pos:recall-cart', (_e, id: string) => recallCart(id))
  ipcMain.handle('pos:delete-held-cart', (_e, id: string) => deleteHeldCart(id))

  // Stock
  ipcMain.handle('pos:get-stock-level', (_e, productId: string) => getStockLevel(productId))
  ipcMain.handle('pos:get-stock-levels', () => getStockLevels())
  ipcMain.handle('pos:add-stock-movement', (_e, input) => addStockMovement(input))

  // Shifts
  ipcMain.handle('pos:get-open-shift', (_e, tillId: string) => getOpenShift(tillId))
  ipcMain.handle('pos:open-shift', (_e, tillId: string, openingCash: number) =>
    openShift(tillId, openingCash)
  )
  ipcMain.handle('pos:close-shift', (_e, shiftId: string, countedCash: number) =>
    closeShift(shiftId, countedCash)
  )
  ipcMain.handle('pos:get-shifts', (_e, limit = 50) => getShifts(limit))

  // Settings
  ipcMain.handle('pos:get-settings', () => getSettings())
  ipcMain.handle('pos:get-setting', (_e, key: string) => getSetting(key))
  ipcMain.handle('pos:set-setting', (_e, key: string, value: string) => setSetting(key, value))
  ipcMain.handle('pos:set-settings', (_e, values) => setSettings(values))

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
  ipcMain.handle('reports:get-dashboard', () => getDashboard())
  ipcMain.handle('reports:get-sales-report', (_e, from: string, to: string) =>
    getSalesReport(from, to)
  )
}
