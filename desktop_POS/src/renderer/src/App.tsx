import { useEffect, useState } from 'react'
import './styles.css'
import { useTranslation } from 'react-i18next'
import i18n from './i18n'
import {
  ShoppingCart, Package, BarChart3,
  Settings as SettingsIcon, Store, Languages, Wifi, WifiOff,
  AlertTriangle, ShieldCheck, ShieldAlert, Clock, History, RefreshCw
} from 'lucide-react'
import { useToasts } from './hooks/useToasts'
import { BillingScreen } from './components/BillingScreen'
import { SettingsScreen } from './components/SettingsScreen'
import { DashboardScreen } from './components/DashboardScreen'
import { ShiftsScreen } from './components/ShiftsScreen'
import { InventoryScreen } from './components/InventoryScreen'
import { ReturnsScreen } from './components/ReturnsScreen'
import { SetupWizard } from './components/SetupWizard'
import { ToastContainer } from './components/ToastContainer'
import { LicenseLockout } from './components/LicenseLockout'
import { ThemeToggle } from './components/theme-toggle'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuItem
} from './components/ui/dropdown-menu'
import type { SyncStatus } from '@shared/types'
import { MULTI_TENANT } from '@shared/config'

type Tab = 'billing' | 'inventory' | 'returns' | 'settings' | 'dashboard' | 'shifts'

const NAV: Array<{ id: Tab; labelKey: string; icon: typeof ShoppingCart; key: string }> = [
  { id: 'billing', labelKey: 'app.billing', icon: ShoppingCart, key: 'F1' },
  { id: 'inventory', labelKey: 'app.inventory', icon: Package, key: 'F2' },
  { id: 'returns', labelKey: 'app.history', icon: History, key: 'F3' },
  { id: 'dashboard', labelKey: 'app.dashboard', icon: BarChart3, key: 'F4' },
  { id: 'shifts', labelKey: 'app.shifts', icon: Clock, key: 'F6' },
  { id: 'settings', labelKey: 'app.settings', icon: SettingsIcon, key: 'F7' },
]

export default function App() {
  const { t } = useTranslation()
  const toasts = useToasts()
  const [tab, setTab] = useState<Tab>('billing')
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [licenseStatus, setLicenseStatus] = useState<
    | { state: 'valid'; shopName: string; expiry: string; daysRemaining: number }
    | { state: 'grace'; shopName: string; expiry: string; daysRemaining: number }
    | { state: 'trial'; daysRemaining: number; expiry: string }
    | { state: 'expired'; shopName: string; expiry: string }
    | { state: 'none' }
  | null>(null)
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null)
  const [manualSyncing, setManualSyncing] = useState(false)
  const [clock, setClock] = useState(new Date())

  const refreshSettings = async () => {
    const s = await window.pos.getSettings()
    setSettings(s)
    setSetupComplete(s.setupComplete === 'true')
    if (s.language && s.language !== i18n.language) {
      void i18n.changeLanguage(s.language)
      document.documentElement.dir = s.language === 'ur' ? 'rtl' : 'ltr'
    }
  }

  const refreshLicense = async () => {
    const status = await window.pos.getLicenseStatus()
    setLicenseStatus(status)
  }

  const refreshSyncStatus = async () => {
    const status = await window.pos.getSyncStatus()
    setSyncStatus(status)
  }

  const handleManualSync = async () => {
    setManualSyncing(true)
    try {
      await window.pos.triggerSync()
    } catch (err) {
      console.error('Manual sync failed:', err)
    } finally {
      setManualSyncing(false)
      void refreshSyncStatus()
    }
  }

  useEffect(() => {
    void refreshSettings()
    void refreshLicense()
    void refreshSyncStatus()

    const unsub = window.pos.onLicenseBlocked(() => {
      void refreshLicense()
    })

    const interval = setInterval(() => {
      void refreshSyncStatus()
    }, 10000)
    const clockTimer = setInterval(() => setClock(new Date()), 1000)
    return () => {
      unsub()
      clearInterval(interval)
      clearInterval(clockTimer)
    }
  }, [])

  // Global error handler — logs to main process for telemetry
  useEffect(() => {
    const handler = (event: ErrorEvent) => {
      void window.pos.logError({
        message: event.message,
        stack: event.error?.stack,
        context: JSON.stringify({ filename: event.filename, lineno: event.lineno })
      })
    }
    window.addEventListener('error', handler)
    return () => window.removeEventListener('error', handler)
  }, [])

  // Keyboard shortcuts for navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const map: Record<string, Tab> = {
        F1: 'billing', F2: 'inventory', F3: 'returns', F4: 'dashboard',
        F6: 'shifts', F7: 'settings'
      }
      if (map[e.key]) {
        e.preventDefault()
        if (setupComplete && licenseStatus?.state !== 'expired') setTab(map[e.key])
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setupComplete, licenseStatus])

  if (setupComplete === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-500/30 border-t-teal-500 rounded-full animate-spin mx-auto mb-4" />
          <p className="text-slate-400 text-sm">Loading POS…</p>
        </div>
      </div>
    )
  }

  if (!setupComplete) {
    return (
      <>
        <SetupWizard
          toasts={toasts}
          onComplete={async () => {
            await refreshSettings()
            await refreshLicense()
          }}
        />
        <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      </>
    )
  }

  // License lockout: expired past grace, or trial elapsed → only activate reachable
  if (licenseStatus?.state === 'expired' || licenseStatus?.state === 'trial' && licenseStatus.daysRemaining <= 0) {
    return (
      <>
        <LicenseLockout
          status={licenseStatus}
          toasts={toasts}
          onActivated={async () => {
            await refreshLicense()
          }}
        />
        <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismiss} />
      </>
    )
  }

  const tillLabel = settings.currentTillId || 'Till 1'
  const branchLabel = MULTI_TENANT ? settings.currentBranchId || 'Main Branch' : null

  return (
    <div className="h-screen bg-slate-950 text-slate-100 flex flex-col overflow-hidden" dir={i18n.language === 'ur' ? 'rtl' : 'ltr'}>
      {/* ===== Header ===== */}
      <header className="border-b border-slate-800 bg-slate-900/80 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 h-14 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/20 shrink-0">
              <Store className="w-5 h-5 text-teal-950" />
            </div>
            <div className="min-w-0">
              <div className="font-semibold text-sm leading-tight truncate">
                {settings.shopName || t('app.title')}
              </div>
              <div className="text-[10px] text-slate-500 leading-tight">
                {branchLabel ? `${tillLabel} · ${branchLabel}` : tillLabel}
              </div>
            </div>
          </div>

          <nav className="flex items-center gap-0.5 overflow-x-auto pos-scroll-hide">
            {NAV.filter((n) => n.id !== 'shifts' || settings.tillReconciliationEnabled === 'true').map((n) => {
              const Icon = n.icon
              const active = tab === n.id
              return (
                <button
                  key={n.id}
                  onClick={() => setTab(n.id)}
                  className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                    active
                      ? 'bg-teal-500/15 text-teal-300 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`}
                  title={`${t(n.labelKey)} (${n.key})`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="hidden lg:inline">{t(n.labelKey)}</span>
                </button>
              )
            })}
          </nav>

          <div className="flex items-center gap-1.5 text-xs shrink-0">
            {/* Language toggle */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 px-2 py-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors" title="Language">
                  <Languages className="w-4 h-4" />
                  <span className="hidden md:inline text-[10px] uppercase">{i18n.language}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="bg-slate-900 border-slate-700">
                <DropdownMenuLabel className="text-slate-400 text-xs">Language / زبان</DropdownMenuLabel>
                <DropdownMenuSeparator className="bg-slate-800" />
                <DropdownMenuItem
                  onClick={() => { void i18n.changeLanguage('en'); document.documentElement.dir = 'ltr' }}
                  className={i18n.language === 'en' ? 'bg-teal-500/10 text-teal-300' : 'text-slate-200'}
                >
                  English {i18n.language === 'en' && <ShieldCheck className="w-3 h-3 ml-auto" />}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => { void i18n.changeLanguage('ur'); document.documentElement.dir = 'rtl' }}
                  className={i18n.language === 'ur' ? 'bg-teal-500/10 text-teal-300' : 'text-slate-200'}
                >
                  اردو (Urdu) {i18n.language === 'ur' && <ShieldCheck className="w-3 h-3 ml-auto" />}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Sync status — clickable wifi icon triggers a manual sync */}
            {syncStatus && (
              <button
                type="button"
                onClick={handleManualSync}
                disabled={manualSyncing || syncStatus.isSyncing}
                className="flex items-center gap-1 px-2 py-1.5 rounded-md transition-colors hover:bg-slate-800/60 disabled:opacity-60"
                style={{ color: syncStatus.isOnline ? '#34d399' : '#f87171' }}
                title={
                  manualSyncing || syncStatus.isSyncing
                    ? 'Syncing…'
                    : syncStatus.isOnline
                      ? 'Online — click to sync now'
                      : 'Offline'
                }
              >
                {manualSyncing || syncStatus.isSyncing ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : syncStatus.isOnline ? (
                  <Wifi className="w-4 h-4" />
                ) : (
                  <WifiOff className="w-4 h-4" />
                )}
                {syncStatus.pendingCount > 0 && (
                  <span className="text-[10px] font-medium">{syncStatus.pendingCount} pending</span>
                )}
              </button>
            )}

            {/* License pill */}
            {licenseStatus?.state === 'trial' && (
              <span className="hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-md text-amber-400" title="Trial mode">
                <ShieldAlert className="w-4 h-4" />
                <span className="text-[10px] font-medium">{licenseStatus.daysRemaining}d</span>
              </span>
            )}
            {licenseStatus?.state === 'grace' && (
              <span className="hidden sm:flex items-center gap-1 px-2 py-1.5 rounded-md text-amber-400" title="Grace period">
                <AlertTriangle className="w-4 h-4" />
                <span className="text-[10px] font-medium">{licenseStatus.daysRemaining}d</span>
              </span>
            )}

            <ThemeToggle />

            <div className="text-right hidden md:block ml-1 px-1">
              <div className="font-mono font-medium text-slate-200 text-xs">
                {clock.toLocaleTimeString('en-GB')}
              </div>
              <div className="text-[10px] text-slate-500">
                {clock.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
              </div>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-500 pos-pulse" title="Online" />
          </div>
        </div>
      </header>

      {/* ===== License banners ===== */}
      {licenseStatus?.state === 'grace' && (
        <div className="bg-amber-500 text-amber-950 px-4 py-1.5 text-xs font-semibold text-center">
          {t('license.grace', {
            date: new Date(licenseStatus.expiry).toLocaleDateString(),
            days: licenseStatus.daysRemaining
          })}
        </div>
      )}
      {licenseStatus?.state === 'trial' && (
        <div className="bg-amber-500 text-amber-950 px-4 py-1.5 text-xs font-semibold text-center">
          {t('license.trial', {
            days: licenseStatus.daysRemaining,
            date: new Date(licenseStatus.expiry).toLocaleDateString()
          })}
        </div>
      )}

      {/* ===== Body ===== */}
      <main className="flex-1 overflow-y-auto min-h-0">
        {tab === 'billing' && <BillingScreen toasts={toasts} />}
        {tab === 'inventory' && <InventoryScreen toasts={toasts} />}
        {tab === 'returns' && <ReturnsScreen toasts={toasts} />}
        {tab === 'dashboard' && <DashboardScreen toasts={toasts} />}
        {tab === 'shifts' && <ShiftsScreen toasts={toasts} onShiftChanged={refreshLicense} />}
        {tab === 'settings' && (
          <SettingsScreen
            toasts={toasts}
            onSettingsChanged={async () => {
              await refreshSettings()
              await refreshLicense()
            }}
          />
        )}
      </main>

      <ToastContainer toasts={toasts.toasts} onDismiss={toasts.dismiss} />
    </div>
  )
}
