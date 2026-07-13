import { useEffect, useState } from 'react'
import './i18n'
import { useTranslation } from 'react-i18next'
import { useToasts } from './hooks/useToasts'
import { BillingScreen } from './components/BillingScreen'
import { SettingsScreen } from './components/SettingsScreen'
import { ReportsScreen } from './components/ReportsScreen'
import { DashboardScreen } from './components/DashboardScreen'
import { ShiftsScreen } from './components/ShiftsScreen'
import { SetupWizard } from './components/SetupWizard'
import { ToastContainer } from './components/ToastContainer'
import { LicenseLockout } from './components/LicenseLockout'

type Tab = 'billing' | 'reports' | 'settings' | 'dashboard' | 'shifts'

export default function App() {
  const { t, i18n } = useTranslation()
  const toasts = useToasts()
  const [tab, setTab] = useState<Tab>('billing')
  const [setupComplete, setSetupComplete] = useState<boolean | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [licenseStatus, setLicenseStatus] = useState<
    | { state: 'valid'; shopName: string; expiry: string; daysRemaining: number }
    | { state: 'grace'; shopName: string; expiry: string; daysRemaining: number }
    | { state: 'expired'; shopName: string; expiry: string }
    | { state: 'none' }
  | null>(null)

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

  useEffect(() => {
    void refreshSettings()
    void refreshLicense()
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

  if (setupComplete === null) {
    return <div className="panel"><p>Loading...</p></div>
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

  // License lockout: expired past grace → only settings (activate) reachable
  if (licenseStatus?.state === 'expired') {
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>{settings.shopName || t('app.title')}</h1>
        <div className="shop-info">
          <span>{new Date().toLocaleDateString(i18n.language)}</span>
          {licenseStatus?.state === 'grace' && (
            <span style={{ color: 'var(--accent)' }}>
              ⚠ {licenseStatus.daysRemaining}d grace
            </span>
          )}
          {licenseStatus?.state === 'none' && (
            <span style={{ color: 'var(--accent)' }}>Trial</span>
          )}
        </div>
      </header>

      {licenseStatus?.state === 'grace' && (
        <div className="license-banner">
          {t('license.grace', {
            date: new Date(licenseStatus.expiry).toLocaleDateString(),
            days: licenseStatus.daysRemaining
          })}
        </div>
      )}
      {licenseStatus?.state === 'none' && (
        <div className="license-banner">No license — 7-day trial active</div>
      )}

      <nav className="tab-bar">
        <button className={`tab ${tab === 'billing' ? 'active' : ''}`} onClick={() => setTab('billing')}>
          {t('app.billing')}
        </button>
        <button className={`tab ${tab === 'dashboard' ? 'active' : ''}`} onClick={() => setTab('dashboard')}>
          {t('app.dashboard')}
        </button>
        <button className={`tab ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>
          {t('app.reports')}
        </button>
        {settings.tillReconciliationEnabled === 'true' && (
          <button className={`tab ${tab === 'shifts' ? 'active' : ''}`} onClick={() => setTab('shifts')}>
            {t('app.shifts')}
          </button>
        )}
        <button className={`tab ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
          {t('app.settings')}
        </button>
      </nav>

      <main className="app-body">
        {tab === 'billing' && <BillingScreen toasts={toasts} />}
        {tab === 'dashboard' && <DashboardScreen />}
        {tab === 'reports' && <ReportsScreen toasts={toasts} />}
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
