// Preload script — runs in an isolated context with Node access, but exposes
// ONLY a curated API to the renderer via contextBridge. The renderer NEVER has
// direct Node access.
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/types'

const api = {
  // Products / categories
  getProducts: (categoryId?: string, includeInactive = false) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PRODUCTS, categoryId, includeInactive),
  getCategories: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CATEGORIES),
  createCategory: (name: string, sortOrder = 0) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_CATEGORY, name, sortOrder),
  updateCategory: (id: string, name: string, sortOrder?: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.UPDATE_CATEGORY, id, name, sortOrder),
  deleteCategory: (id: string, reassignToId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.DELETE_CATEGORY, id, reassignToId),
  createProduct: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_PRODUCT, input),
  updateProduct: (id: string, patch: unknown) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_PRODUCT, id, patch),
  deleteProduct: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_PRODUCT, id),
  setProductActive: (id: string, active: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_PRODUCT_ACTIVE, id, active),
  isBarcodeTaken: (barcode: string, exceptProductId?: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.IS_BARCODE_TAKEN, barcode, exceptProductId),
  generateBarcode: () =>
    ipcRenderer.invoke(IPC_CHANNELS.GENERATE_BARCODE),
  selectProductImage: () =>
    ipcRenderer.invoke(IPC_CHANNELS.SELECT_PRODUCT_IMAGE),
  getProductImage: (productId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_PRODUCT_IMAGE, productId),
  readImageDataUrl: (filePath: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.READ_IMAGE_DATA_URL, filePath),

  // Sales
  createSale: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_SALE, input),
  getSales: (query?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.GET_SALES, query),
  getSalesCount: (query?: unknown) => ipcRenderer.invoke('pos:get-sales-count', query),
  getLastSale: () => ipcRenderer.invoke(IPC_CHANNELS.GET_LAST_SALE),
  getSale: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_SALE, id),
  setSaleBookmarked: (id: string, bookmarked: boolean) =>
    ipcRenderer.invoke(IPC_CHANNELS.SET_SALE_BOOKMARKED, id, bookmarked),

  // Returns / refunds
  createReturn: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_RETURN, input),
  getReturns: (limit = 100) => ipcRenderer.invoke(IPC_CHANNELS.GET_RETURNS, limit),
  getRefundedForSale: (saleId: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_REFUNDED_FOR_SALE, saleId),

  // Branches / Tills
  getBranches: () => ipcRenderer.invoke(IPC_CHANNELS.GET_BRANCHES),
  createBranch: (name: string) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_BRANCH, name),
  getTills: () => ipcRenderer.invoke(IPC_CHANNELS.GET_TILLS),
  createTill: (name: string, branchId: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_TILL, name, branchId),

  // Held carts
  holdCart: (label: string, items: unknown[], total: number) => ipcRenderer.invoke(IPC_CHANNELS.HOLD_CART, label, items, total),
  getHeldCarts: () => ipcRenderer.invoke(IPC_CHANNELS.GET_HELD_CARTS),
  recallCart: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.RECALL_CART, id),
  deleteHeldCart: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_HELD_CART, id),

  // Stock
  getStockLevel: (productId: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_STOCK_LEVEL, productId),
  getStockLevels: () => ipcRenderer.invoke(IPC_CHANNELS.GET_STOCK_LEVELS),
  addStockMovement: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.ADD_STOCK_MOVEMENT, input),

  // Shifts
  getOpenShift: (tillId: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_OPEN_SHIFT, tillId),
  openShift: (tillId: string, openingCash: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.OPEN_SHIFT, tillId, openingCash),
  closeShift: (shiftId: string, countedCash: number) =>
    ipcRenderer.invoke(IPC_CHANNELS.CLOSE_SHIFT, shiftId, countedCash),
  getShifts: (query?: unknown) => ipcRenderer.invoke(IPC_CHANNELS.GET_SHIFTS, query),
  getShiftSummary: (shiftId: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_SHIFT_SUMMARY, shiftId),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  getSetting: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTING, key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.SET_SETTING, key, value),
  setSettings: (values: Record<string, string>) => ipcRenderer.invoke(IPC_CHANNELS.SET_SETTINGS, values),
  selectReceiptLogo: () => ipcRenderer.invoke(IPC_CHANNELS.SELECT_RECEIPT_LOGO),
  getReceiptLogo: () => ipcRenderer.invoke(IPC_CHANNELS.GET_RECEIPT_LOGO),

  // Printer
  getPrinters: () => ipcRenderer.invoke(IPC_CHANNELS.GET_PRINTERS),
  printReceipt: (sale: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINT_RECEIPT, sale),
  reprintReceipt: () => ipcRenderer.invoke(IPC_CHANNELS.REPRINT_RECEIPT),
  printRefund: (ret: unknown) => ipcRenderer.invoke(IPC_CHANNELS.PRINT_REFUND, ret),
  printBarcodeLabel: (product: unknown) =>
    ipcRenderer.invoke(IPC_CHANNELS.PRINT_BARCODE_LABEL, product),

  // License
  getMachineId: () => ipcRenderer.invoke(IPC_CHANNELS.GET_MACHINE_ID),
  activateLicense: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.ACTIVATE_LICENSE, key),
  getLicenseStatus: () => ipcRenderer.invoke(IPC_CHANNELS.GET_LICENSE_STATUS),
  onLicenseBlocked: (cb: () => void) => {
    const listener = () => cb()
    ipcRenderer.on('license:blocked', listener)
    return () => ipcRenderer.removeListener('license:blocked', listener)
  },

  // Dashboard QR
  getDashboardQrCode: () => ipcRenderer.invoke(IPC_CHANNELS.DASHBOARD_GET_QR_CODE),
  refreshDashboardPairCode: () => ipcRenderer.invoke(IPC_CHANNELS.DASHBOARD_REFRESH_PAIR_CODE),

  // Backup / export
  backupDatabase: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DATABASE),
  exportReport: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_REPORT, input),
  exportSalesCsv: (query: unknown) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_SALES_CSV, query),

  // Telemetry
  logError: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.LOG_ERROR, input),
  submitFeedback: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SUBMIT_FEEDBACK, input),

  // Reports
  getDashboard: (range?: 'today' | '7d' | '30d') => ipcRenderer.invoke(IPC_CHANNELS.GET_DASHBOARD, range),
  getSalesReport: (from: string, to: string) =>
    ipcRenderer.invoke(IPC_CHANNELS.GET_SALES_REPORT, from, to),

  // Shop
  getShop: () => ipcRenderer.invoke('shop:get'),

  // Sync
  getSyncStatus: () => ipcRenderer.invoke('sync:get-status'),
  triggerSync: () => ipcRenderer.invoke('sync:trigger-now'),
  reconfigureSync: () => ipcRenderer.invoke('sync:reconfigure'),

  // Auto-update
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  restartAndUpdate: () => ipcRenderer.invoke('updater:restart')
}

export type PosApi = typeof api

// Expose as window.pos
contextBridge.exposeInMainWorld('pos', api)
