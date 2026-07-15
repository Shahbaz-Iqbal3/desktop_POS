// Preload script — runs in an isolated context with Node access, but exposes
// ONLY a curated API to the renderer via contextBridge. The renderer NEVER has
// direct Node access.
import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS } from '@shared/types'

const api = {
  // Products / categories
  getProducts: (categoryId?: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_PRODUCTS, categoryId),
  getCategories: () => ipcRenderer.invoke(IPC_CHANNELS.GET_CATEGORIES),
  createCategory: (name: string, sortOrder = 0) =>
    ipcRenderer.invoke(IPC_CHANNELS.CREATE_CATEGORY, name, sortOrder),
  createProduct: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_PRODUCT, input),
  updateProduct: (id: string, patch: unknown) => ipcRenderer.invoke(IPC_CHANNELS.UPDATE_PRODUCT, id, patch),
  deleteProduct: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.DELETE_PRODUCT, id),

  // Sales
  createSale: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_SALE, input),
  getSales: (limit = 100) => ipcRenderer.invoke(IPC_CHANNELS.GET_SALES, limit),
  getLastSale: () => ipcRenderer.invoke(IPC_CHANNELS.GET_LAST_SALE),
  getSale: (id: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_SALE, id),

  // Returns / refunds
  createReturn: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_RETURN, input),
  getReturns: (limit = 100) => ipcRenderer.invoke(IPC_CHANNELS.GET_RETURNS, limit),

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
  getShifts: (limit = 50) => ipcRenderer.invoke(IPC_CHANNELS.GET_SHIFTS, limit),

  // Settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTINGS),
  getSetting: (key: string) => ipcRenderer.invoke(IPC_CHANNELS.GET_SETTING, key),
  setSetting: (key: string, value: string) => ipcRenderer.invoke(IPC_CHANNELS.SET_SETTING, key, value),
  setSettings: (values: Record<string, string>) => ipcRenderer.invoke(IPC_CHANNELS.SET_SETTINGS, values),

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

  // Backup / export
  backupDatabase: () => ipcRenderer.invoke(IPC_CHANNELS.BACKUP_DATABASE),
  exportReport: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.EXPORT_REPORT, input),

  // Telemetry
  logError: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.LOG_ERROR, input),
  submitFeedback: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.SUBMIT_FEEDBACK, input),

  // Reports
  getDashboard: () => ipcRenderer.invoke(IPC_CHANNELS.GET_DASHBOARD),
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
