import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
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
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 w-full max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-semibold text-red-400">License Expired</h2>
        </div>
        <p className="text-slate-400 text-sm mb-5">
          {t('license.expired', {
            date: 'expiry' in status ? new Date(status.expiry).toLocaleDateString() : ''
          })}
        </p>

        <div className="space-y-2">
          <Label>{t('settings.licenseKey')}</Label>
          <Textarea
            rows={3}
            placeholder="paste license key..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            className="bg-slate-950 border-slate-700"
          />
        </div>

        {error && (
          <p className="text-red-400 text-[13px] mt-2">{error}</p>
        )}

        <div className="mt-5">
          <Button
            onClick={handleActivate}
            disabled={submitting}
            className="w-full bg-teal-500 text-teal-950 hover:bg-teal-400"
          >
            {submitting ? t('common.loading') : t('license.activate')}
          </Button>
        </div>

        <div className="mt-6 p-3 bg-slate-950 rounded-md text-xs text-slate-400 leading-relaxed">
          <p className="mb-1 font-medium text-slate-300">To get a license key:</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>Send your Machine ID to your vendor</li>
            <li>They generate a signed key for your machine</li>
            <li>Paste it above and click Activate</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
