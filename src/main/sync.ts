// Sync engine — runs in the MAIN PROCESS.
// Handles background sync to Supabase, network monitoring, and manual sync triggers.
//
// NOTE on module loading: @supabase/supabase-js ships as CommonJS (main: dist/index.cjs).
// This project is ESM ("type": "module" in package.json). Importing a CJS dep with a
// bare `import { createClient }` triggers Node's ESM→CJS interop, which crashes on
// supabase's internal module.exports pattern ("Cannot read properties of undefined
// (reading 'exports')"). We avoid this by loading it through createRequire, the same
// shim electron-vite already injects for better-sqlite3 and xlsx.
import { createRequire } from 'node:module'
import { ipcMain } from 'electron'
import { getShop, getUnsyncedRows, markAsSynced, getPendingSyncCount } from './db'
import { SUPABASE_URL, SUPABASE_ANON_KEY, isSupabaseConfigured } from './supabase-config'

const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { createClient } = require('@supabase/supabase-js') as typeof import('@supabase/supabase-js')

// Minimal WebSocket stub used only to satisfy supabase-js RealtimeClient
// construction under Electron's Node (no native WebSocket). We never open a
// realtime channel, so this is never actually connected.
class NoopWebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3
  readyState = 3
  url = ''
  protocol = ''
  onopen: ((this: unknown, ev: Event) => unknown) | null = null
  onmessage: ((this: unknown, ev: MessageEvent) => unknown) | null = null
  onclose: ((this: unknown, ev: CloseEvent) => unknown) | null = null
  onerror: ((this: unknown, ev: Event) => unknown) | null = null
  binaryType: string = 'blob'
  bufferedAmount = 0
  extensions = ''
  constructor(_address: string | URL, _subprotocols?: string | string[]) {}
  close(): void {}
  send(): void {}
  addEventListener(): void {}
  removeEventListener(): void {}
  dispatchEvent(): boolean {
    return false
  }
}

// Convert a string from camelCase to snake_case
function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);
}

// Convert all keys in an object from camelCase to snake_case
function camelKeysToSnake<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = toSnakeCase(key);
    result[snakeKey] = value;
  }
  return result;
}

let supabaseClient: ReturnType<typeof createClient> | null = null
let syncInterval: NodeJS.Timeout | null = null
let isOnline = true
let lastSyncTime: string | null = null
let syncError: string | null = null

type SyncStatus = {
  isOnline: boolean
  pendingCount: number
  lastSyncTime: string | null
  syncError: string | null
  isSyncing: boolean
}

let currentSyncStatus: SyncStatus = {
  isOnline: true,
  pendingCount: 0,
  lastSyncTime: null,
  syncError: null,
  isSyncing: false
}

// Notify renderer of status changes
function notifyStatus(): void {
  ipcMain.emit('sync:status-changed', currentSyncStatus)
}

function initSupabase(): void {
  if (!isSupabaseConfigured()) {
    supabaseClient = null
    console.warn('[sync] Supabase not configured — set SUPABASE_URL / SUPABASE_ANON_KEY (see supabase-config.ts)')
    return
  }

  try {
    // We only use REST inserts for sync (no realtime subscriptions), but
    // supabase-js still constructs a RealtimeClient at init time. In Electron's
    // bundled Node (pre-22) there is no native WebSocket, so RealtimeClient's
    // `getWebSocketConstructor()` throws
    // "Node.js detected but native WebSocket not found."
    // Supplying a `transport` short-circuits that lookup (see realtime-js
    // RealtimeClient line: transport = options.transport ?? getWebSocketConstructor()),
    // and since we never open a channel the stub is never actually connected.
    supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      realtime: { transport: NoopWebSocket as never },
      auth: { persistSession: false, autoRefreshToken: false }
    })
    console.log('[sync] Supabase client initialized')
  } catch (err) {
    console.error('[sync] Failed to initialize Supabase client:', err)
    supabaseClient = null
  }
}

// Register this shop in the cloud `shops` table on first sync (multi-tenant).
// The local shop_id is generated once in db.ts initDatabase, so every shop
// installation has a stable, unique id that separates its rows in Supabase.
async function registerShop(): Promise<void> {
  if (!supabaseClient) return
  const shop = getShop()
  if (!shop) return
  try {
    await supabaseClient
      .from('shops')
      .upsert({ id: shop.id, name: shop.name, access_token: shop.accessToken, created_at: new Date().toISOString() } as any)
    console.log('[sync] Shop registered in Supabase:', shop.id)
  } catch (err) {
    console.error('[sync] Failed to register shop:', err)
  }
}

function updateOnlineStatus(online: boolean): void {
  if (isOnline !== online) {
    isOnline = online
    currentSyncStatus.isOnline = online
    console.log(`[sync] Network status changed: ${online ? 'online' : 'offline'}`)
    notifyStatus()
    
    // Trigger sync immediately when coming back online
    if (online) {
      void triggerSync()
    }
  }
}

async function syncTable(
  tableName: 'sales' | 'stock_movements' | 'returns' | 'error_logs' | 'feedback',
  rows: Array<{ id: string; data: Record<string, unknown> }>
): Promise<{ success: number; failed: number }> {
  if (!supabaseClient || rows.length === 0) {
    return { success: 0, failed: 0 }
  }

  const shop = getShop()
  if (!shop) {
    console.warn('[sync] No shop found, skipping sync')
    return { success: 0, failed: rows.length }
  }

  try {
    // Add shop_id to each row if not present
    const rowsWithShop = rows.map(row => ({
      ...camelKeysToSnake(row.data),
      shop_id: shop.id
    }))

    const { error } = await supabaseClient
      .from(tableName)
      .insert(rowsWithShop as any)

    if (error) {
      console.error(`[sync] Failed to sync ${tableName}:`, error)
      return { success: 0, failed: rows.length }
    }

    // Mark rows as synced on success
    const ids = rows.map(r => r.id)
    markAsSynced(tableName, ids)
    
    console.log(`[sync] Synced ${rows.length} rows to ${tableName}`)
    return { success: rows.length, failed: 0 }
  } catch (err) {
    console.error(`[sync] Exception syncing ${tableName}:`, err)
    return { success: 0, failed: rows.length }
  }
}

async function triggerSync(): Promise<void> {
  if (!supabaseClient) {
    console.log('[sync] No Supabase client, skipping sync')
    return
  }

  if (currentSyncStatus.isSyncing) {
    console.log('[sync] Sync already in progress, skipping')
    return
  }

  currentSyncStatus.isSyncing = true
  syncError = null
  notifyStatus()

  try {
    const unsynced = getUnsyncedRows()
    const totalPending = unsynced.sales.length + unsynced.stockMovements.length + 
                        unsynced.errorLogs.length + unsynced.feedback.length
    
    console.log(`[sync] Starting sync: ${totalPending} pending rows`)

    if (totalPending === 0) {
      console.log('[sync] No pending rows to sync')
      lastSyncTime = new Date().toISOString()
      currentSyncStatus.lastSyncTime = lastSyncTime
      currentSyncStatus.pendingCount = 0
      return
    }

    // Sync each table
    const salesResult = await syncTable('sales', unsynced.sales)
    const stockResult = await syncTable('stock_movements', unsynced.stockMovements)
    const returnsResult = await syncTable('returns', unsynced.returns)
    const errorResult = await syncTable('error_logs', unsynced.errorLogs)
    const feedbackResult = await syncTable('feedback', unsynced.feedback)

    const totalSuccess = salesResult.success + stockResult.success + returnsResult.success +
                        errorResult.success + feedbackResult.success
    const totalFailed = salesResult.failed + stockResult.failed + returnsResult.failed +
                       errorResult.failed + feedbackResult.failed

    if (totalFailed > 0) {
      syncError = `Failed to sync ${totalFailed} rows`
      console.error(`[sync] Sync completed with errors: ${totalFailed} failed`)
    } else {
      console.log(`[sync] Sync completed successfully: ${totalSuccess} rows`)
    }

    lastSyncTime = new Date().toISOString()
    currentSyncStatus.lastSyncTime = lastSyncTime
    currentSyncStatus.syncError = syncError
    currentSyncStatus.pendingCount = getPendingSyncCount()
  } catch (err) {
    syncError = err instanceof Error ? err.message : String(err)
    console.error('[sync] Sync failed:', err)
    currentSyncStatus.syncError = syncError
  } finally {
    currentSyncStatus.isSyncing = false
    notifyStatus()
  }
}

export function startSyncEngine(): void {
  console.log('[sync] Starting sync engine')

  // Initialize Supabase client
  initSupabase()

  // Register this shop + run an initial sync (after shop is known to cloud)
  if (supabaseClient) {
    void registerShop().then(() => {
      currentSyncStatus.pendingCount = getPendingSyncCount()
      if (isOnline) void triggerSync()
    })
  } else {
    currentSyncStatus.pendingCount = getPendingSyncCount()
  }

  // Set up network monitoring (simplified - assume online for now)
  // In production, you might want to use a library like 'is-online'
  const checkNetwork = async (): Promise<void> => {
    try {
      // Simple check - try to fetch a reliable endpoint
      const response = await fetch('https://www.google.com', {
        method: 'HEAD',
        signal: AbortSignal.timeout(5000)
      })
      updateOnlineStatus(response.ok)
    } catch {
      updateOnlineStatus(false)
    }
  }

  // Check network every 30 seconds
  setInterval(checkNetwork, 30000)
  void checkNetwork() // Initial check

  // Set up automatic sync every 3 minutes
  syncInterval = setInterval(() => {
    if (isOnline && supabaseClient) {
      void triggerSync()
    }
  }, 3 * 60 * 1000) // 3 minutes
}

export function stopSyncEngine(): void {
  if (syncInterval) {
    clearInterval(syncInterval)
    syncInterval = null
  }
  console.log('[sync] Sync engine stopped')
}

export function reconfigureSync(): void {
  console.log('[sync] Reconfiguring sync')
  initSupabase()
  if (supabaseClient) {
    void registerShop()
  }
  currentSyncStatus.pendingCount = getPendingSyncCount()
  notifyStatus()
}

export function getSyncStatus(): SyncStatus {
  return { ...currentSyncStatus }
}

export function registerSyncIpc(): void {
  ipcMain.handle('sync:get-status', () => getSyncStatus())
  ipcMain.handle('sync:trigger-now', async () => {
    await triggerSync()
    return getSyncStatus()
  })
  ipcMain.handle('sync:reconfigure', () => {
    reconfigureSync()
    return getSyncStatus()
  })
  
  // Listen for settings changes to reconfigure sync
  ipcMain.on('settings-changed', () => {
    reconfigureSync()
  })
}