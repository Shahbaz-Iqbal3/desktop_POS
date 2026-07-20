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

export type SaleReturn = {
  id: string
  saleId: string
  branchId: string
  tillId: string
  shiftId: string | null
  items: SaleItem[] // refunded items (subset of the original sale)
  total: number // sum of refunded line totals
  refundAmount: number
  paymentMethod: PaymentMethod
  createdAt: string // ISO string
  synced: 0 | 1
}

export type Sale = {
  id: string
  branchId: string
  tillId: string
  shiftId: string | null
  items: SaleItem[]
  total: number
  orderDiscount: number  // order-level discount percentage (0-100) applied to grand total
  actualPaidPrice: number
  paymentMethod: PaymentMethod
  createdAt: string     // ISO string
  synced: 0 | 1
  bookmarked: boolean
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
  defaultDiscount: number
  lowStockThreshold: number
  createdAt: string
  active: boolean
  imagePath: string | null
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

export type ShiftSummary = {
  shiftId: string
  tillId: string
  openingCash: number
  closingCash: number | null
  expectedCash: number | null
  variance: number | null
  cashSales: number
  digitalSales: number
  cashRefunds: number
  salesCount: number
  openedAt: string
  closedAt: string | null
}

export type ShiftQuery = {
  tillId?: string
  from?: string
  to?: string
  limit?: number
  offset?: number
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
  barcodePrinterName: 'barcodePrinterName',
  backupPath: 'backupPath',
  autoBackup: 'autoBackup',
  setupComplete: 'setupComplete',
  licenseKey: 'licenseKey',
  licenseExpiry: 'licenseExpiry',
  machineId: 'machineId',
  shopId: 'shopId'
} as const

export type SettingKey = (typeof SETTING_KEYS)[keyof typeof SETTING_KEYS]

export type Language = 'en' | 'ur'

// Sync status type
export type SyncStatus = {
  isOnline: boolean
  pendingCount: number
  lastSyncTime: string | null
  syncError: string | null
  isSyncing: boolean
}

// Shop type
export type Shop = {
  id: string
  name: string
  accessToken: string
}

// IPC channel names — single source of truth shared with preload + main.
export const IPC_CHANNELS = {
  // Products / categories
  GET_PRODUCTS: 'pos:get-products',
  GET_CATEGORIES: 'pos:get-categories',
  CREATE_CATEGORY: 'pos:create-category',
  UPDATE_CATEGORY: 'pos:update-category',
  DELETE_CATEGORY: 'pos:delete-category',
  CREATE_PRODUCT: 'pos:create-product',
  UPDATE_PRODUCT: 'pos:update-product',
  DELETE_PRODUCT: 'pos:delete-product',
  SET_PRODUCT_ACTIVE: 'pos:set-product-active',
  IS_BARCODE_TAKEN: 'pos:is-barcode-taken',
  GENERATE_BARCODE: 'pos:generate-barcode',
  SET_SALE_BOOKMARKED: 'pos:set-sale-bookmarked',
  SELECT_PRODUCT_IMAGE: 'pos:select-product-image',
  GET_PRODUCT_IMAGE: 'pos:get-product-image',
  READ_IMAGE_DATA_URL: 'pos:read-image-data-url',

  // Sales
  CREATE_SALE: 'pos:create-sale',
  GET_SALES: 'pos:get-sales',
  GET_LAST_SALE: 'pos:get-last-sale',
  GET_SALE: 'pos:get-sale',

  // Returns / refunds
  CREATE_RETURN: 'pos:create-return',
  GET_RETURNS: 'pos:get-returns',
  GET_REFUNDED_FOR_SALE: 'pos:get-refunded-for-sale',

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
  GET_SHIFT_SUMMARY: 'pos:get-shift-summary',

  // Settings
  GET_SETTINGS: 'pos:get-settings',
  GET_SETTING: 'pos:get-setting',
  SET_SETTING: 'pos:set-setting',
  SET_SETTINGS: 'pos:set-settings',
  SELECT_RECEIPT_LOGO: 'pos:select-receipt-logo',
  GET_RECEIPT_LOGO: 'pos:get-receipt-logo',

  // Printer
  GET_PRINTERS: 'printer:get-printers',
  PRINT_RECEIPT: 'printer:print-receipt',
  REPRINT_RECEIPT: 'printer:reprint-receipt',
  PRINT_REFUND: 'printer:print-refund',
  PRINT_BARCODE_LABEL: 'printer:print-barcode-label',

  // License
  GET_MACHINE_ID: 'license:get-machine-id',
  ACTIVATE_LICENSE: 'license:activate-license',
  GET_LICENSE_STATUS: 'license:get-license-status',

  // Dashboard QR
  DASHBOARD_GET_QR_CODE: 'dashboard:get-qr-code',
  DASHBOARD_REFRESH_PAIR_CODE: 'dashboard:refresh-pair-code',

  // Backup / export
  BACKUP_DATABASE: 'db:backup',
  EXPORT_REPORT: 'db:export-report',
  EXPORT_SALES_CSV: 'db:export-sales-csv',

  // Error / feedback
  LOG_ERROR: 'telemetry:log-error',
  SUBMIT_FEEDBACK: 'telemetry:submit-feedback',

  // Branches / Tills
  GET_BRANCHES: 'pos:get-branches',
  CREATE_BRANCH: 'pos:create-branch',
  GET_TILLS: 'pos:get-tills',
  CREATE_TILL: 'pos:create-till',

  // Reports
  GET_DASHBOARD: 'reports:get-dashboard',
  GET_SALES_REPORT: 'reports:get-sales-report',

  // Shop
  GET_SHOP: 'shop:get',

  // Sync
  GET_SYNC_STATUS: 'sync:get-status',
  TRIGGER_SYNC: 'sync:trigger-now',
  RECONFIGURE_SYNC: 'sync:reconfigure'

  // Auto-update (disabled for now)
  // CHECK_UPDATES: 'updater:check',
  // RESTART_AND_UPDATE: 'updater:restart'
} as const

export type IpcChannel = (typeof IPC_CHANNELS)[keyof typeof IPC_CHANNELS]
