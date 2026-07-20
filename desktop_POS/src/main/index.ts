// Main process entry point.
// Creates the BrowserWindow, registers IPC, opens the DB, sets up auto-update.
import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { initDatabase } from './db'
import { registerDbIpc } from './ipc'
import { registerPrinterIpc } from './printer'
import { registerLicenseIpc } from './license'
import { registerBackupIpc, startAutoBackup } from './backup'
import { startSyncEngine, stopSyncEngine } from './sync'
import { registerDashboardQrIpc } from './dashboardQr'

// electron-updater ships as CommonJS. This project is ESM ("type": "module"),
// so a bare `import` triggers the ESM→CJS interop that crashes with
// "Cannot read properties of undefined (reading 'exports')". Load it through
// createRequire, the same shim used for better-sqlite3 and @supabase/supabase-js.
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { autoUpdater } = require('electron-updater') as typeof import('electron-updater')

function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    title: 'POS App',
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

async function initErrorReporting(): Promise<void> {
  // Optional. Set SENTRY_DSN in the launch environment to enable crash reporting.
  // Without a DSN, error reporting stays disabled (no network calls).
  const dsn = process.env['SENTRY_DSN']
  if (!dsn) return
  try {
    const Sentry = (await import('@sentry/electron')) as unknown as {
      init: (opts: Record<string, unknown>) => void
    }
    Sentry.init({
      dsn,
      environment: is.dev ? 'development' : 'production',
      tracesSampleRate: 0.1
    })
    console.log('[sentry] error reporting enabled')
  } catch (err) {
    console.error('[sentry] init failed:', err)
  }
}

app.whenReady().then(async () => {
  // Set app user model id for Windows notifications
  electronApp.setAppUserModelId('com.pos.app')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Initialize error reporting as early as possible (no-op without SENTRY_DSN).
  await initErrorReporting()

  // Initialize the SQLite database BEFORE registering IPC, so handlers can query.
  initDatabase()

  // Register all IPC handlers.
  registerDbIpc()
  registerPrinterIpc()
  registerLicenseIpc()
  registerBackupIpc()
  registerDashboardQrIpc()

  // Start scheduled auto-backup (no-op unless autoBackup setting enabled)
  startAutoBackup()

  // Register auto-update IPC handlers
  ipcMain.handle('updater:check', async () => {
    return autoUpdater.checkForUpdates()
  })
  ipcMain.handle('updater:restart', async () => {
    return autoUpdater.quitAndInstall()
  })

  // Start sync engine (no-op until Supabase URL/key configured in Settings)
  startSyncEngine()

  // Setup auto-updater
  await setupAutoUpdater()

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  stopSyncEngine()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// Auto-updater setup
async function setupAutoUpdater(): Promise<void> {
  // Skip update check in dev mode
  if (is.dev) {
    console.log('[auto-update] Skipping update check in dev mode')
    return
  }

  // Check for updates every 4 hours
  setInterval(() => {
    void autoUpdater.checkForUpdates()
  }, 4 * 60 * 60 * 1000)

  // Initial check
  void autoUpdater.checkForUpdates()

  autoUpdater.on('update-available', (info: any) => {
    console.log('[auto-update] Update available:', info.version)
  })

  autoUpdater.on('update-not-available', (info: any) => {
    console.log('[auto-update] No update available, current version:', info.version)
  })

  autoUpdater.on('update-downloaded', (info: any) => {
    console.log('[auto-update] Update downloaded:', info.version)
    // The update will be installed on next restart
  })

  autoUpdater.on('error', (err: any) => {
    console.error('[auto-update] Update error:', err)
  })
}
