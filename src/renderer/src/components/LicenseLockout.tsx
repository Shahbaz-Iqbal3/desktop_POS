import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { useToasts } from '../hooks/useToasts'

type Toasts = ReturnType<typeof useToasts>

type LicenseStatus =
  | { state: 'valid'; shopName: string; expiry: string; daysRemaining: number }
  | { state: 'grace'; shopName: string; expiry: string; daysRemaining: number }
  | { state: 'expired'; shopName: string; expiry: string }
  | { state: 'none' }

export function LicenseLockout({
  status,
  onActivated
}: {
  status: LicenseStatus
  onActivated: () => void | Promise<void>
  toasts: Toasts
}) {
  const { t } = useTranslation()
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleActivate = async () => {
    setError('')
    if (!key.trim()) {
      setError('Enter a license key')
      return
    }
    setSubmitting(true)
    const result = await window.pos.activateLicense(key.trim())
    setSubmitting(false)
    if (result.ok) {
      await onActivated()
    } else {
      setError(result.error ?? 'Activation failed')
    }
  }

  return (
    <div className="wizard">
      <div className="wizard-card">
        <h2 style={{ color: 'var(--danger)', marginBottom: 8 }}>
          🔒 License Expired
        </h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
          {t('license.expired', {
            date: 'expiry' in status ? new Date(status.expiry).toLocaleDateString() : ''
          })}
        </p>

        <div className="form-row" style={{ gridTemplateColumns: '1fr' }}>
          <label>{t('settings.licenseKey')}</label>
          <textarea
            className="form-input"
            rows={3}
            placeholder="paste license key..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
        </div>

        {error && (
          <p style={{ color: 'var(--danger)', fontSize: 13, marginTop: 8 }}>{error}</p>
        )}

        <div className="modal-actions">
          <button
            className="btn btn-primary"
            onClick={handleActivate}
            disabled={submitting}
          >
            {submitting ? t('common.loading') : t('license.activate')}
          </button>
        </div>

        <div style={{ marginTop: 24, padding: 12, background: 'var(--bg)', borderRadius: 6, fontSize: 12, color: 'var(--text-muted)' }}>
          <p style={{ marginBottom: 4 }}>To get a license key:</p>
          <ol style={{ paddingLeft: 20, lineHeight: 1.6 }}>
            <li>Send your Machine ID to your vendor</li>
            <li>They generate a signed key for your machine</li>
            <li>Paste it above and click Activate</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
