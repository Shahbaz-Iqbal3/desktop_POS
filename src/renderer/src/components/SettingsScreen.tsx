import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { useToasts } from '../hooks/useToasts'

type Toasts = ReturnType<typeof useToasts>

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      className={`toggle ${on ? 'on' : ''}`}
      onClick={onClick}
      role="switch"
      aria-checked={on}
    />
  )
}

export function SettingsScreen({
  toasts,
  onSettingsChanged
}: {
  toasts: Toasts
  onSettingsChanged: () => void | Promise<void>
}) {
  const { t, i18n } = useTranslation()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [machineId, setMachineId] = useState('')
  const [licenseStatus, setLicenseStatus] = useState<
    | { state: 'valid'; shopName: string; expiry: string; daysRemaining: number }
    | { state: 'grace'; shopName: string; expiry: string; daysRemaining: number }
    | { state: 'expired'; shopName: string; expiry: string }
    | { state: 'none' }
  | null>(null)
  const [licenseKey, setLicenseKey] = useState('')
  const [feedback, setFeedback] = useState('')

  const refresh = async () => {
    const s = await window.pos.getSettings()
    setSettings(s)
    setLicenseKey('')
    const [mid, status] = await Promise.all([
      window.pos.getMachineId(),
      window.pos.getLicenseStatus()
    ])
    setMachineId(mid)
    setLicenseStatus(status)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const updateSetting = async (key: string, value: string) => {
    await window.pos.setSetting(key, value)
    setSettings((prev) => ({ ...prev, [key]: value }))
    if (key === 'language') {
      await i18n.changeLanguage(value)
      document.documentElement.dir = value === 'ur' ? 'rtl' : 'ltr'
    }
    toasts.success(t('settings.saved'))
    await onSettingsChanged()
  }

  const handleBackup = async () => {
    const result = await window.pos.backupDatabase()
    if (result.ok) toasts.success(`Backup saved: ${result.path}`)
    else if (result.error !== 'Backup cancelled') toasts.error(result.error ?? 'Backup failed')
  }

  const handleActivate = async () => {
    if (!licenseKey.trim()) {
      toasts.error('Enter a license key')
      return
    }
    const result = await window.pos.activateLicense(licenseKey.trim())
    if (result.ok) {
      toasts.success(t('license.activated'))
      setLicenseKey('')
      await refresh()
      await onSettingsChanged()
    } else {
      toasts.error(t('license.invalid', { error: result.error }))
    }
  }

  const handleFeedback = async () => {
    if (!feedback.trim()) return
    await window.pos.submitFeedback({ message: feedback, rating: 5 })
    toasts.success('Feedback submitted. Thank you!')
    setFeedback('')
  }

  return (
    <div className="panel">
      <div className="panel-section">
        <h3>🏪 {t('settings.shopName')}</h3>
        <div className="form-row">
          <label>{t('settings.shopName')}</label>
          <input
            className="form-input"
            value={settings.shopName ?? ''}
            onChange={(e) => setSettings({ ...settings, shopName: e.target.value })}
            onBlur={(e) => updateSetting('shopName', e.target.value)}
          />
        </div>
      </div>

      <div className="panel-section">
        <h3>🌐 {t('settings.language')}</h3>
        <div className="form-row">
          <label>{t('settings.language')}</label>
          <select
            className="form-input"
            value={settings.language ?? 'en'}
            onChange={(e) => updateSetting('language', e.target.value)}
          >
            <option value="en">English</option>
            <option value="ur">اردو (Urdu)</option>
          </select>
        </div>
      </div>

      <div className="panel-section">
        <h3>⚙️ Toggles</h3>
        <div className="form-row">
          <label>{t('settings.barcode')}</label>
          <Toggle
            on={settings.barcodeEnabled === 'true'}
            onClick={() => updateSetting('barcodeEnabled', settings.barcodeEnabled === 'true' ? 'false' : 'true')}
          />
        </div>
        <div className="form-row">
          <label>{t('settings.tillReconciliation')}</label>
          <Toggle
            on={settings.tillReconciliationEnabled === 'true'}
            onClick={() => updateSetting('tillReconciliationEnabled', settings.tillReconciliationEnabled === 'true' ? 'false' : 'true')}
          />
        </div>
      </div>

      <div className="panel-section">
        <h3>🖨️ {t('settings.printer')}</h3>
        <div className="form-row">
          <label>{t('settings.printer')}</label>
          <input
            className="form-input"
            placeholder="e.g. EPSON_TM_T20"
            value={settings.printerName ?? ''}
            onChange={(e) => setSettings({ ...settings, printerName: e.target.value })}
            onBlur={(e) => updateSetting('printerName', e.target.value)}
          />
        </div>
      </div>

      <div className="panel-section">
        <h3>💾 {t('settings.backup')}</h3>
        <div className="form-row">
          <label>{t('settings.autoBackup')}</label>
          <Toggle
            on={settings.autoBackup === 'true'}
            onClick={() => updateSetting('autoBackup', settings.autoBackup === 'true' ? 'false' : 'true')}
          />
        </div>
        <div className="form-row">
          <label></label>
          <button className="btn btn-primary" onClick={handleBackup}>
            {t('settings.backupNow')}
          </button>
        </div>
      </div>

      <div className="panel-section">
        <h3>🔑 {t('settings.license')}</h3>
        <div className="form-row">
          <label>{t('settings.machineId')}</label>
          <code style={{ fontSize: 11, wordBreak: 'break-all', color: 'var(--text-muted)' }}>
            {machineId}
          </code>
        </div>
        <div className="form-row">
          <label>{t('settings.licenseStatus')}</label>
          <div style={{ fontSize: 13 }}>
            {licenseStatus?.state === 'valid' && (
              <span style={{ color: 'var(--success)' }}>
                {t('license.valid', {
                  date: new Date(licenseStatus.expiry).toLocaleDateString(),
                  days: licenseStatus.daysRemaining
                })}
              </span>
            )}
            {licenseStatus?.state === 'grace' && (
              <span style={{ color: 'var(--accent)' }}>
                {t('license.grace', {
                  date: new Date(licenseStatus.expiry).toLocaleDateString(),
                  days: licenseStatus.daysRemaining
                })}
              </span>
            )}
            {licenseStatus?.state === 'expired' && (
              <span style={{ color: 'var(--danger)' }}>
                {t('license.expired', { date: new Date(licenseStatus.expiry).toLocaleDateString() })}
              </span>
            )}
            {licenseStatus?.state === 'none' && (
              <span style={{ color: 'var(--text-muted)' }}>{t('license.none')}</span>
            )}
          </div>
        </div>
        <div className="form-row">
          <label>{t('settings.licenseKey')}</label>
          <textarea
            className="form-input"
            rows={2}
            placeholder="paste license key..."
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label></label>
          <button className="btn btn-primary" onClick={handleActivate}>
            {t('settings.activateLicense')}
          </button>
        </div>
      </div>

      <div className="panel-section">
        <h3>💬 {t('settings.feedback')}</h3>
        <div className="form-row">
          <label>{t('settings.feedback')}</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder={t('settings.feedbackPlaceholder')}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
        </div>
        <div className="form-row">
          <label></label>
          <button className="btn" onClick={handleFeedback} disabled={!feedback.trim()}>
            {t('common.submit')}
          </button>
        </div>
      </div>
    </div>
  )
}
