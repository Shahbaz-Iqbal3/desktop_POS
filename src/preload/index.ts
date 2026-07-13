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

  // Sales
  createSale: (input: unknown) => ipcRenderer.invoke(IPC_CHANNELS.CREATE_SALE, input),
  getSales: (limit = 100) => ipcRenderer.invoke(IPC_CHANNELS.GET_SALES, limit),
  getLastSale: () => ipcRenderer.invoke(IPC_CHANNELS.GET_LAST_SALE),

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
    ipcRenderer.invoke(IPC_CHANNELS.GET_SALES_REPORT, from, to)
}

export type PosApi = typeof api

// Expose as window.pos
contextBridge.exposeInMainWorld('pos', api)
