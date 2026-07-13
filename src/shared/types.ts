// Shared types and constants used by both main and renderer processes.
// This file MUST NOT import anything from 'electron', 'better-sqlite3', or any
// process-specific dependency — it is pure types and constants only.

export type UnitType = 'piece' | 'thaan'

export type PaymentMethod = 'cash' | 'digital'

export type SaleItem = {
  productId: string
  name: string
  unitType: UnitType
  price: number        // negotiated unit price (per piece or per meter)
  quantity: number      // pieces, or meters for thaan
  cutLength?: number    // for thaan: meters cut from the roll
  discount?: number     // line-level discount percentage 0-100
  lineTotal: number
}

export type HeldCart = {
  id: string
  label: string
  items: SaleItem[]
  total: number
  heldAt: string
}

export type Sale = {
  id: string
  branchId: string
  tillId: string
  shiftId: string | null
  items: SaleItem[]
  total: number
  actualPaidPrice: number
  paymentMethod: PaymentMethod
  createdAt: string     // ISO string
  synced: 0 | 1
}

export type StockMovement = {
  id: string
  productId: string
  category: string       // 'sale' | 'restock' | 'adjustment' | 'initial'
  changeAmount: number   // + / -
  reason: string
  createdAt: string
  synced: 0 | 1
}

export type Product = {
  id: string
  name: string
  categoryId: string
  sku: string | null
  barcode: string | null
  unitType: UnitType
  defaultPrice: number
  lowStockThreshold: number
  createdAt: string
}

export type Category = {
  id: string
  name: string
  sortOrder: number
}

export type Branch = {
  id: string
  name: string
}

export type Till = {
  id: string
  name: string
  branchId: string
}

export type Shift = {
  id: string
  tillId: string
  openingCash: number
  closingCash: number | null
  expectedCash: number | null
  openedAt: string
  closedAt: string | null
}

export type Setting = {
  key: string
  value: string
}

// Known setting keys (typed for safety in renderer)
export const SETTING_KEYS = {
  shopName: 'shopName',
  barcodeEnabled: 'barcodeEnabled',
  tillReconciliationEnabled: 'tillReconciliationEnabled',
  language: 'language',
  printerName: 'printerName',
  backupPath: 'backupPath',
  autoBackup: 'autoBackup',
  setupComplete: 'setupComplete',
  licenseKey: 'licenseKey',
  licenseExpiry: 'licenseExpiry',
  machineId: 'machineId'
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

export type Language = 'en' | 'ur'

// IPC channel names — single source of truth shared with preload + main.
export const IPC_CHANNELS = {
  // Products / categories
  GET_PRODUCTS: 'pos:get-products',
  GET_CATEGORIES: 'pos:get-categories',
  CREATE_CATEGORY: 'pos:create-category',
  CREATE_PRODUCT: 'pos:create-product',
  UPDATE_PRODUCT: 'pos:update-product',
  DELETE_PRODUCT: 'pos:delete-product',

  // Sales
  CREATE_SALE: 'pos:create-sale',
  GET_SALES: 'pos:get-sales',
  GET_LAST_SALE: 'pos:get-last-sale',

  // Held carts (park/recall)
  HOLD_CART: 'pos:hold-cart',
  GET_HELD_CARTS: 'pos:get-held-carts',
  RECALL_CART: 'pos:recall-cart',
  DELETE_HELD_CART: 'pos:delete-held-cart',

  // Stock
  GET_STOCK_LEVEL: 'pos:get-stock-level',
  GET_STOCK_LEVELS: 'pos:get-stock-levels',
  ADD_STOCK_MOVEMENT: 'pos:add-stock-movement',

  // Shifts
  GET_OPEN_SHIFT: 'pos:get-open-shift',
  OPEN_SHIFT: 'pos:open-shift',
  CLOSE_SHIFT: 'pos:close-shift',
  GET_SHIFTS: 'pos:get-shifts',

  // Settings
  GET_SETTINGS: 'pos:get-settings',
  GET_SETTING: 'pos:get-setting',
  SET_SETTING: 'pos:set-setting',
  SET_SETTINGS: 'pos:set-settings',

  // Printer
  GET_PRINTERS: 'printer:get-printers',
  PRINT_RECEIPT: 'printer:print-receipt',
  REPRINT_RECEIPT: 'printer:reprint-receipt',
  PRINT_BARCODE_LABEL: 'printer:print-barcode-label',

  // License
  GET_MACHINE_ID: 'license:get-machine-id',
  ACTIVATE_LICENSE: 'license:activate-license',
  GET_LICENSE_STATUS: 'license:get-license-status',

  // Backup / export
  BACKUP_DATABASE: 'db:backup',
  EXPORT_REPORT: 'db:export-report',

  // Error / feedback
  LOG_ERROR: 'telemetry:log-error',
  SUBMIT_FEEDBACK: 'telemetry:submit-feedback',

  // Reports
  GET_DASHBOARD: 'reports:get-dashboard',
  GET_SALES_REPORT: 'reports:get-sales-report'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
