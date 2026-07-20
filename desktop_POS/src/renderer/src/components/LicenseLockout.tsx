import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Lock, Copy, Check } from 'lucide-react'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Label } from './ui/label'
import type { useToasts } from '../hooks/useToasts'

type Toasts = ReturnType<typeof useToasts>

type LicenseStatus =
  | { state: 'valid'; shopName: string; expiry: string; daysRemaining: number }
  | { state: 'grace'; shopName: string; expiry: string; daysRemaining: number }
  | { state: 'trial'; daysRemaining: number; expiry: string }
  | { state: 'expired'; shopName: string; expiry: string }
  | { state: 'none' }

// Landing page for requesting a license key. Exposed via VITE_LANDING_PAGE_URL
// in .env so it can be changed without a rebuild of the renderer bundle.
const LANDING_PAGE_URL = import.meta.env.VITE_LANDING_PAGE_URL as string | undefined

export function LicenseLockout({
  status,
  onActivated,
  toasts
}: {
  status: LicenseStatus
  onActivated: () => void | Promise<void>
  toasts: Toasts
}) {
  const { t } = useTranslation()
  const [key, setKey] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [machineId, setMachineId] = useState<string>('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    window.pos.getMachineId().then(setMachineId).catch(() => { })
  }, [])

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

  const handleCopyMachineId = async () => {
    if (!machineId) return
    try {
      await navigator.clipboard.writeText(machineId)
      setCopied(true)
      toasts.success(t('license.machineIdCopied'))
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-8 w-full max-w-md">
        <div className="flex items-center gap-2 mb-2">
          <Lock className="w-5 h-5 text-red-400" />
          <h2 className="text-lg font-semibold text-red-400">
            {status.state === 'trial' ? t('license.trialEnded') : t('license.expiredTitle')}
          </h2>
        </div>
        <p className="text-slate-400 text-sm mb-5">
          {status.state === 'trial'
            ? t('license.trialEndedBody')
            : t('license.expired', {
              date: 'expiry' in status ? new Date(status.expiry).toLocaleDateString() : ''
            })}
        </p>

        {/* Machine ID — read-only, styled like an input but not editable, with copy */}
        <div className="space-y-2">
          <Label className="text-slate-400">{t('license.machineIdLabel')}</Label>
          <div className="flex items-stretch gap-2">
            <div className="flex-1 flex items-center rounded-md border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-300 select-all overflow-hidden">
              <code className="font-mono truncate">{machineId || '—'}</code>
            </div>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopyMachineId}
              disabled={!machineId}
              title={t('common.copy')}
              className="border-slate-700 text-slate-300 hover:bg-slate-800 shrink-0"
            >
              {copied ? <Check className="w-4 h-4 text-teal-400" /> : <Copy className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        <div className="space-y-2 mt-4">
          <Label className="text-slate-400">{t('settings.licenseKey')}</Label>
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
          <p className="mb-1 font-medium text-slate-300">{t('license.getLicenseTitle')}</p>
          <ul>

            <li>
              <p className='mb-1 ml-2 text-slate-300'> You need a License Key to activate the app</p>

            </li>
            <li>

              <p className='mb-1 ml-2 text-slate-300'> Copy the Machine ID and send it to Developer and get your License Key</p>
            </li>
            <li>
              {LANDING_PAGE_URL ? (
                <>
                <span className='text-slate-300 hover:no-underline'> Visit for Contact:</span>
                <a
                  href={LANDING_PAGE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-400 hover:underline break-all ml-2"
                >
                  {LANDING_PAGE_URL}
                </a></>
              ) : (
                <span className="break-all">Contact to Developer to get a license key</span>
              )}

            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
