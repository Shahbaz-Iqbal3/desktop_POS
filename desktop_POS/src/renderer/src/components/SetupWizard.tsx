import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import {
  Store, Languages, Printer, Tags, KeyRound, SlidersHorizontal,
  Plus, X, ArrowLeft, ArrowRight, Check, Loader2, ScanLine, Wallet
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter
} from '@/components/ui/card'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import type { useToasts } from '../hooks/useToasts'

type Toasts = ReturnType<typeof useToasts>

// An explicit connection URI (tcp://host:port, serial://..., usb) is used verbatim by the
// printer backend; anything else is treated as an OS printer name.
const isExplicitInterface = (v: string) => /^(tcp|serial|usb):/i.test(v.trim())

export function SetupWizard({
  onComplete
}: {
  onComplete: () => void | Promise<void>
  toasts: Toasts
}) {
  const { t } = useTranslation()
  const [step, setStep] = useState(0)
  const [shopName, setShopName] = useState('')
  const [shopTagline, setShopTagline] = useState('')
  const [shopAddress, setShopAddress] = useState('')
  const [shopPhone, setShopPhone] = useState('')
  const [shopEmail, setShopEmail] = useState('')
  const [shopTaxId, setShopTaxId] = useState('')
  const [shopCurrency, setShopCurrency] = useState('Rs')
  const [language, setLanguage] = useState('en')
  const [printerName, setPrinterName] = useState('')
  const [categories, setCategories] = useState<string[]>([''])
  const [licenseKey, setLicenseKey] = useState('')
  const [barcode, setBarcode] = useState(false)
  const [tillRecon, setTillRecon] = useState(false)
  const [printers, setPrinters] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    window.pos.getPrinters().then((p) => setPrinters((p as string[]) ?? []))
  }, [])

  const steps = [
    t('setup.step.shop'),
    t('setup.step.language'),
    t('setup.step.printer'),
    t('setup.step.categories'),
    t('setup.step.license'),
    t('setup.step.toggles')
  ]

  const stepIcons = [Store, Languages, Printer, Tags, KeyRound, SlidersHorizontal]

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
        shopTagline: shopTagline,
        shopAddress,
        shopPhone,
        shopEmail,
        shopTaxId,
        shopCurrency: shopCurrency || 'Rs',
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

  const StepIcon = stepIcons[step]
  const progress = ((step + 1) / steps.length) * 100

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 p-4">
      <Card className="w-full max-w-lg bg-slate-900/60 border border-slate-800 rounded-xl shadow-2xl">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-lg bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center shadow-lg shadow-teal-500/20 shrink-0">
              <StepIcon className="w-5 h-5 text-teal-950" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-xl text-slate-100">{t('setup.title')}</CardTitle>
              <CardDescription className="text-slate-400">{t('setup.subtitle')}</CardDescription>
            </div>
          </div>

          {/* Progress */}
          <div className="mt-4 space-y-2">
            <Progress value={progress} className="bg-slate-800 [&>div]:bg-teal-500" />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                {steps.map((_, i) => (
                  <span
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === step
                        ? 'w-5 bg-teal-400'
                        : i < step
                          ? 'w-1.5 bg-teal-600'
                          : 'w-1.5 bg-slate-700'
                    }`}
                  />
                ))}
              </div>
              <span className="text-[11px] font-medium text-slate-500">
                {step + 1} / {steps.length}
              </span>
            </div>
          </div>
        </CardHeader>

        <Separator className="bg-slate-800" />

        <CardContent className="min-h-[180px]">
          {step === 0 && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label className="text-slate-300">{t('setup.step.shop')}</Label>
                <Input
                  className="bg-slate-950 border-slate-700 text-slate-100"
                  placeholder={t('setup.shopPlaceholder')}
                  value={shopName}
                  onChange={(e) => setShopName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">{t('settings.shopTagline')}</Label>
                <Input
                  className="bg-slate-950 border-slate-700 text-slate-100"
                  placeholder={t('setup.shopTaglinePlaceholder')}
                  value={shopTagline}
                  onChange={(e) => setShopTagline(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label className="text-slate-300">{t('settings.shopAddress')}</Label>
                <Input
                  className="bg-slate-950 border-slate-700 text-slate-100"
                  placeholder={t('setup.shopAddressPlaceholder')}
                  value={shopAddress}
                  onChange={(e) => setShopAddress(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-slate-300">{t('settings.shopPhone')}</Label>
                  <Input
                    className="bg-slate-950 border-slate-700 text-slate-100"
                    placeholder={t('setup.shopPhonePlaceholder')}
                    value={shopPhone}
                    onChange={(e) => setShopPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">{t('settings.shopEmail')}</Label>
                  <Input
                    className="bg-slate-950 border-slate-700 text-slate-100"
                    placeholder={t('setup.shopEmailPlaceholder')}
                    value={shopEmail}
                    onChange={(e) => setShopEmail(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label className="text-slate-300">{t('settings.shopTaxId')}</Label>
                  <Input
                    className="bg-slate-950 border-slate-700 text-slate-100"
                    placeholder={t('setup.shopTaxIdPlaceholder')}
                    value={shopTaxId}
                    onChange={(e) => setShopTaxId(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-slate-300">{t('settings.shopCurrency')}</Label>
                  <Input
                    className="bg-slate-950 border-slate-700 text-slate-100"
                    placeholder="Rs"
                    value={shopCurrency}
                    onChange={(e) => setShopCurrency(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-2">
              <Label className="text-slate-300">{t('setup.step.language')}</Label>
              <Select value={language} onValueChange={handleLanguageChange}>
                <SelectTrigger className="w-full bg-slate-950 border-slate-700 text-slate-100">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700 text-slate-100">
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="ur">اردو (Urdu)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-2">
              <Label className="text-slate-300">{t('setup.step.printer')}</Label>
              <Select
                value={isExplicitInterface(printerName) ? '__custom__' : printerName}
                onValueChange={(v) => {
                  if (v === '__custom__') {
                    setPrinterName(isExplicitInterface(printerName) ? printerName : 'tcp://localhost:9100')
                  } else {
                    setPrinterName(v)
                  }
                }}
              >
                <SelectTrigger className="bg-slate-950 border-slate-700 text-slate-100">
                  <SelectValue placeholder={t('setup.selectPrinter')} />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="">{t('settings.noPrinter')}</SelectItem>
                  {(printerName && !isExplicitInterface(printerName) && !printers.includes(printerName)
                    ? [printerName, ...printers]
                    : printers
                  ).map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                  <SelectItem value="__custom__">{t('settings.customPrinter')}</SelectItem>
                </SelectContent>
              </Select>

              {isExplicitInterface(printerName) && (
                <Input
                  className="bg-slate-950 border-slate-700 text-slate-100"
                  placeholder="tcp://localhost:9100"
                  value={printerName}
                  onChange={(e) => setPrinterName(e.target.value)}
                />
              )}
              <p className="text-xs text-slate-500">{t('setup.printerHint')}</p>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-2">
              <Label className="text-slate-300">{t('setup.step.categories')}</Label>
              <p className="text-xs text-slate-500">{t('setup.categoryHint')}</p>
              <div className="space-y-2 pt-1">
                {categories.map((c, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <Input
                      className="bg-slate-950 border-slate-700 text-slate-100"
                      placeholder={`Category ${i + 1}`}
                      value={c}
                      onChange={(e) => {
                        const nextCategories = [...categories]
                        nextCategories[i] = e.target.value
                        setCategories(nextCategories)
                      }}
                    />
                    {categories.length > 1 && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-slate-400 hover:text-red-400 hover:bg-slate-800"
                        onClick={() => setCategories(categories.filter((_, idx) => idx !== i))}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Button
                variant="outline"
                size="sm"
                className="mt-1 border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-teal-300"
                onClick={() => setCategories([...categories, ''])}
              >
                <Plus className="w-4 h-4" /> {t('setup.addCategory')}
              </Button>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2">
              <Label className="text-slate-300">{t('setup.step.license')}</Label>
              <p className="text-xs text-slate-500">{t('setup.licenseHint')}</p>
              <Textarea
                className="bg-slate-950 border-slate-700 text-slate-100 font-mono text-xs"
                rows={3}
                placeholder="paste license key..."
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value)}
              />
            </div>
          )}

          {step === 5 && (
            <div className="space-y-3">
              <Label className="text-slate-300">{t('setup.step.toggles')}</Label>
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ScanLine className="w-4 h-4 text-teal-400 shrink-0" />
                  <span className="text-sm text-slate-200 truncate">{t('setup.toggleBarcode')}</span>
                </div>
                <Switch
                  checked={barcode}
                  onCheckedChange={setBarcode}
                  className="data-[state=checked]:bg-teal-500"
                />
              </div>
              <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Wallet className="w-4 h-4 text-teal-400 shrink-0" />
                  <span className="text-sm text-slate-200 truncate">{t('setup.toggleTill')}</span>
                </div>
                <Switch
                  checked={tillRecon}
                  onCheckedChange={setTillRecon}
                  className="data-[state=checked]:bg-teal-500"
                />
              </div>
            </div>
          )}
        </CardContent>

        <Separator className="bg-slate-800" />

        <CardFooter className="justify-between">
          {step > 0 ? (
            <Button
              variant="outline"
              className="border-slate-700 bg-transparent text-slate-300 hover:bg-slate-800 hover:text-slate-100"
              onClick={back}
            >
              <ArrowLeft className="w-4 h-4" /> {t('common.back')}
            </Button>
          ) : (
            <span />
          )}
          {step < steps.length - 1 ? (
            <Button
              className="bg-teal-500 text-teal-950 hover:bg-teal-400 font-semibold"
              onClick={next}
            >
              {t('common.next')} <ArrowRight className="w-4 h-4" />
            </Button>
          ) : (
            <Button
              className="bg-teal-500 text-teal-950 hover:bg-teal-400 font-semibold"
              onClick={finish}
              disabled={submitting}
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> {t('common.loading')}</>
              ) : (
                <><Check className="w-4 h-4" /> {t('common.finish')}</>
              )}
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  )
}
