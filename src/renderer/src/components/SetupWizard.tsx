import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { useToasts } from '../hooks/useToasts'

type Toasts = ReturnType<typeof useToasts>

export function SetupWizard({
  onComplete
}: {
  onComplete: () => void | Promise<void>
  toasts: Toasts
}) {
  const { t, i18n } = useTranslation()
  const [step, setStep] = useState(0)
  const [shopName, setShopName] = useState('')
  const [language, setLanguage] = useState('en')
  const [printerName, setPrinterName] = useState('')
  const [categories, setCategories] = useState<string[]>([''])
  const [licenseKey, setLicenseKey] = useState('')
  const [barcode, setBarcode] = useState(false)
  const [tillRecon, setTillRecon] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const steps = [
    t('setup.step.shop'),
    t('setup.step.language'),
    t('setup.step.printer'),
    t('setup.step.categories'),
    t('setup.step.license'),
    t('setup.step.toggles')
  ]

  const next = () => setStep((s) => Math.min(steps.length - 1, s + 1))
  const back = () => setStep((s) => Math.max(0, s - 1))

  const handleLanguageChange = (lang: string) => {
    setLanguage(lang)
    void i18n.changeLanguage(lang)
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr'
  }

  const finish = async () => {
    setSubmitting(true)
    try {
      // Save all settings at once
      const validCategories = categories.filter((c) => c.trim())
      for (const cat of validCategories) {
        await window.pos.createCategory(cat.trim())
      }

      // Activate license if provided
      if (licenseKey.trim()) {
        const result = await window.pos.activateLicense(licenseKey.trim())
        if (!result.ok) {
          // Don't block — just warn
          console.warn('License activation failed in wizard:', result.error)
        }
      }

      await window.pos.setSettings({
        shopName: shopName || 'My Shop',
        language,
        printerName,
        barcodeEnabled: String(barcode),
        tillReconciliationEnabled: String(tillRecon),
        setupComplete: 'true'
      })

      await onComplete()
    } catch (err) {
      console.error('Setup failed:', err)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="wizard">
      <div className="wizard-card">
        <h1 style={{ fontSize: 24, marginBottom: 4 }}>{t('setup.title')}</h1>
        <p style={{ color: 'var(--text-muted)', marginBottom: 20 }}>
          {t('setup.subtitle')}
        </p>

        {/* Progress dots */}
        <div className="wizard-progress">
          {steps.map((_, i) => (
            <div
              key={i}
              className={`wizard-step-dot ${i === step ? 'active' : i < step ? 'done' : ''}`}
            />
          ))}
        </div>

        {step === 0 && (
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
              {t('setup.step.shop')}
            </label>
            <input
              className="form-input"
              placeholder={t('setup.shopPlaceholder')}
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              autoFocus
            />
          </div>
        )}

        {step === 1 && (
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
              {t('setup.step.language')}
            </label>
            <select
              className="form-input"
              value={language}
              onChange={(e) => handleLanguageChange(e.target.value)}
            >
              <option value="en">English</option>
              <option value="ur">اردو (Urdu)</option>
            </select>
          </div>
        )}

        {step === 2 && (
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
              {t('setup.step.printer')}
            </label>
            <input
              className="form-input"
              placeholder="EPSON_TM_T20"
              value={printerName}
              onChange={(e) => setPrinterName(e.target.value)}
            />
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
              {t('setup.printerHint')}
            </p>
          </div>
        )}

        {step === 3 && (
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
              {t('setup.step.categories')}
            </label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              {t('setup.categoryHint')}
            </p>
            {categories.map((c, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <input
                  className="form-input"
                  placeholder={`Category ${i + 1}`}
                  value={c}
                  onChange={(e) => {
                    const next = [...categories]
                    next[i] = e.target.value
                    setCategories(next)
                  }}
                />
                {categories.length > 1 && (
                  <button
                    className="btn"
                    onClick={() => setCategories(categories.filter((_, idx) => idx !== i))}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
            <button
              className="btn"
              onClick={() => setCategories([...categories, ''])}
            >
              + {t('setup.addCategory')}
            </button>
          </div>
        )}

        {step === 4 && (
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 8 }}>
              {t('setup.step.license')}
            </label>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
              {t('setup.licenseHint')}
            </p>
            <textarea
              className="form-input"
              rows={3}
              placeholder="paste license key..."
              value={licenseKey}
              onChange={(e) => setLicenseKey(e.target.value)}
            />
          </div>
        )}

        {step === 5 && (
          <div>
            <label style={{ fontSize: 13, color: 'var(--text-muted)', display: 'block', marginBottom: 12 }}>
              {t('setup.step.toggles')}
            </label>
            <div className="form-row">
              <label>{t('setup.toggleBarcode')}</label>
              <button
                className={`toggle ${barcode ? 'on' : ''}`}
                onClick={() => setBarcode(!barcode)}
                role="switch"
                aria-checked={barcode}
              />
            </div>
            <div className="form-row">
              <label>{t('setup.toggleTill')}</label>
              <button
                className={`toggle ${tillRecon ? 'on' : ''}`}
                onClick={() => setTillRecon(!tillRecon)}
                role="switch"
                aria-checked={tillRecon}
              />
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 24 }}>
          {step > 0 && (
            <button className="btn" onClick={back}>
              {t('common.back')}
            </button>
          )}
          {step < steps.length - 1 ? (
            <button className="btn btn-primary" onClick={next}>
              {t('common.next')}
            </button>
          ) : (
            <button className="btn btn-primary" onClick={finish} disabled={submitting}>
              {submitting ? t('common.loading') : t('common.finish')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
