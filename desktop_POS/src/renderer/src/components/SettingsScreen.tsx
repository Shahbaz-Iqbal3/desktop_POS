import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import {
  Store, Printer, Calculator, Database,
  RefreshCw, Building2, KeyRound, MessageSquare, ShieldCheck,
  Receipt, Image as ImageIcon, Settings as SettingsIcon, QrCode
} from 'lucide-react'
import type { useToasts } from '../hooks/useToasts'
import type { Branch, Till } from '@shared/types'
import { MULTI_TENANT } from '@shared/config'
import {
  Card, CardHeader, CardTitle, CardContent
} from './ui/card'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Label } from './ui/label'
import { Badge } from './ui/badge'
import { Switch } from './ui/switch'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from './ui/select'
import { Textarea } from './ui/textarea'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from './ui/table'

type Toasts = ReturnType<typeof useToasts>

// An explicit connection URI (tcp://host:port, serial://..., usb) is used verbatim by the
// printer backend; anything else is treated as an OS printer name.
const isExplicitInterface = (v: string) => /^(tcp|serial|usb):/i.test(v.trim())

type TabId = 'shop' | 'receipt' | 'general' | 'printer' | 'store' | 'license' | 'support'

const TABS: Array<{ id: TabId; labelKey: string; icon: typeof Store; multiTenantOnly?: boolean }> = [
  { id: 'shop', labelKey: 'settings.tabs.shop', icon: Store },
  { id: 'receipt', labelKey: 'settings.tabs.receipt', icon: Receipt },
  { id: 'general', labelKey: 'settings.tabs.general', icon: SettingsIcon },
  { id: 'printer', labelKey: 'settings.tabs.printer', icon: Printer },
  { id: 'store', labelKey: 'settings.tabs.store', icon: Building2, multiTenantOnly: true },
  { id: 'license', labelKey: 'settings.tabs.license', icon: KeyRound },
  { id: 'support', labelKey: 'settings.tabs.support', icon: MessageSquare }
]

export function SettingsScreen({
  toasts,
  onSettingsChanged
}: {
  toasts: Toasts
  onSettingsChanged: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [machineId, setMachineId] = useState('')
  const [licenseStatus, setLicenseStatus] = useState<
    | { state: 'valid'; shopName: string; expiry: string; daysRemaining: number }
    | { state: 'grace'; shopName: string; expiry: string; daysRemaining: number }
    | { state: 'trial'; daysRemaining: number; expiry: string }
    | { state: 'expired'; shopName: string; expiry: string }
    | { state: 'none' }
    | null>(null)
  const [licenseKey, setLicenseKey] = useState('')
  const [feedback, setFeedback] = useState('')
  const [branches, setBranches] = useState<Branch[]>([])
  const [tills, setTills] = useState<Till[]>([])
  const [newBranch, setNewBranch] = useState('')
  const [newTill, setNewTill] = useState('')
  const [tillBranch, setTillBranch] = useState('')
  const [printers, setPrinters] = useState<string[]>([])
  const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('shop')
  const [openShiftId, setOpenShiftId] = useState<string | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [qrPairCode, setQrPairCode] = useState<string | null>(null)
  const [qrUrl, setQrUrl] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const loadedRef = useRef<Record<string, string>>({})

  const refresh = async () => {
    const s = await window.pos.getSettings()
    setSettings(s)
    loadedRef.current = s
    setLicenseKey('')
    const [mid, status, br, tl, printerList] = await Promise.all([
      window.pos.getMachineId(),
      window.pos.getLicenseStatus(),
      window.pos.getBranches(),
      window.pos.getTills(),
      window.pos.getPrinters()
    ])
    setMachineId(mid)
    setLicenseStatus(status)
    setBranches(br)
    setTills(tl)
    setPrinters((printerList as string[]) ?? [])
    setTillBranch(s.currentBranchId || br[0]?.id || '')
    const tillId = s.currentTillId || 'till-1'
    const openShift = await window.pos.getOpenShift(tillId)
    setOpenShiftId(openShift && !openShift.closedAt ? openShift.id : null)
  }

  useEffect(() => {
    void refresh()
  }, [])

  // Explicit Save: edits are kept in local `settings` state and only persisted
  // when the user clicks Save (instead of auto-saving on every keystroke/blur).
  const dirty = Object.entries(settings).some(
 ([k, v]) => loadedRef.current[k] !== v
  )

  const saveAll = async () => {
    const changed: Record<string, string> = {}
    for (const [k, v] of Object.entries(settings)) {
      if (loadedRef.current[k] !== v) changed[k] = v
    }
    if (Object.keys(changed).length === 0) {
      toasts.info(t('settings.noChanges'))
      return
    }
    if (changed.language && changed.language !== i18n.language) {
      await i18n.changeLanguage(changed.language)
      document.documentElement.dir = changed.language === 'ur' ? 'rtl' : 'ltr'
    }
    await window.pos.setSettings(changed)
    loadedRef.current = { ...loadedRef.current, ...changed }
    await onSettingsChanged()
    toasts.success(t('settings.saved'))
  }

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

  // Generate (or rotate) the pairing code: creates a fresh code, starts its
  // 5-minute expiry, pushes it to Supabase, and renders the QR. This is the
  // only way a code comes into existence — at launch there is none, so the card
  // shows a skeleton until the user clicks "Generate QR Code".
  const handleGeneratePairCode = async () => {
    setQrLoading(true)
    try {
      const result = await window.pos.refreshDashboardPairCode()
      if (result?.ok && result.dataUrl) {
        setQrDataUrl(result.dataUrl)
        setQrPairCode(result.code ?? null)
        setQrUrl(result.url ?? null)
        toasts.success(t('settings.dashboardPairCodeRefreshed'))
      } else {
        setQrDataUrl(null)
        setQrPairCode(null)
        setQrUrl(null)
        toasts.error(result?.error ?? t('settings.dashboardQrError'))
      }
    } catch (err) {
      setQrDataUrl(null)
      setQrPairCode(null)
      setQrUrl(null)
      toasts.error(String(err))
    } finally {
      setQrLoading(false)
    }
  }

  const handleRefreshPairCode = async () => {
    try {
      const result = await window.pos.refreshDashboardPairCode()
      if (result?.ok && result.dataUrl) {
        setQrDataUrl(result.dataUrl)
        setQrPairCode(result.code ?? null)
        setQrUrl(result.url ?? null)
        toasts.success(t('settings.dashboardPairCodeRefreshed'))
      } else {
        toasts.error(result?.error ?? t('settings.dashboardQrError'))
      }
    } catch (err) {
      toasts.error(String(err))
    }
  }

  const handleCopyPairCode = async () => {
    if (!qrPairCode) return
    try {
      await navigator.clipboard.writeText(qrPairCode)
      toasts.success(t('settings.dashboardPairCodeCopied'))
    } catch (err) {
      toasts.error(String(err))
    }
  }

  const ShopSection = (
    <div className="space-y-4">
    <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-slate-100">
          <Store className="w-4 h-4 text-teal-400" />
          {t('settings.shopName')}
        </CardTitle>
      </CardHeader>
        <CardContent className="space-y-1.5 pt-0">
          <div className="space-y-1.5">
            <Label className="text-slate-400">{t('settings.shopName')}</Label>
            <Input
              className="bg-slate-950 border-slate-700 text-sm"
              value={settings.shopName ?? ''}
              onChange={(e) => setSettings({ ...settings, shopName: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400">{t('settings.shopTagline')}</Label>
            <Input
              className="bg-slate-950 border-slate-700 text-sm"
              value={settings.shopTagline ?? ''}
              onChange={(e) => setSettings({ ...settings, shopTagline: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400">{t('settings.shopAddress')}</Label>
            <Input
              className="bg-slate-950 border-slate-700 text-sm"
              value={settings.shopAddress ?? ''}
              onChange={(e) => setSettings({ ...settings, shopAddress: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('settings.shopPhone')}</Label>
              <Input
                className="bg-slate-950 border-slate-700 text-sm"
                value={settings.shopPhone ?? ''}
                onChange={(e) => setSettings({ ...settings, shopPhone: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('settings.shopEmail')}</Label>
              <Input
                className="bg-slate-950 border-slate-700 text-sm"
                value={settings.shopEmail ?? ''}
                onChange={(e) => setSettings({ ...settings, shopEmail: e.target.value })}
   />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('settings.shopTaxId')}</Label>
              <Input
                className="bg-slate-950 border-slate-700 text-sm"
                value={settings.shopTaxId ?? ''}
                onChange={(e) => setSettings({ ...settings, shopTaxId: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('settings.shopCurrency')}</Label>
              <Input
                className="bg-slate-950 border-slate-700 text-sm"
                value={settings.shopCurrency ?? ''}
                onChange={(e) => setSettings({ ...settings, shopCurrency: e.target.value })}
              />
            </div>
          </div>
        </CardContent>
    </Card>

    <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-slate-100">
          <QrCode className="w-4 h-4 text-teal-400" />
          {t('settings.dashboardAccess')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
        <p className="text-xs text-slate-500">{t('settings.dashboardAccessHint')}</p>
        <Button
          variant="outline"
          className="border-slate-700 text-slate-300 hover:bg-slate-800"
          onClick={handleGeneratePairCode}
          disabled={qrLoading}
        >
          <QrCode className="w-4 h-4 mr-1.5" />
          {qrLoading ? t('common.loading') : t('settings.generateDashboardQr')}
        </Button>
        {qrDataUrl ? (
          <div className="flex flex-col items-center gap-2 pt-1">
            <div className="rounded-lg border border-slate-800 bg-white p-3">
              <img
                src={qrDataUrl}
                alt={t('settings.dashboardAccess')}
                className="h-48 w-48"
              />
            </div>
            <p className="text-[11px] text-slate-500">{t('settings.dashboardQrExpiry')}</p>
            {qrPairCode && (
              <div className="w-full space-y-2 pt-2 border-t border-slate-800">
                <div className="flex items-center justify-between gap-2">
                  <Label className="text-slate-400">{t('settings.dashboardPairCodeLabel')}</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 h-7"
                    onClick={handleRefreshPairCode}
                  >
                    {t('settings.dashboardRefreshCode')}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-center text-lg font-mono tracking-widest text-teal-300">
                    {qrPairCode}
                  </code>
                  <Button
                    variant="outline"
                    className="border-slate-700 text-slate-300 hover:bg-slate-800 shrink-0"
                    onClick={handleCopyPairCode}
                  >
                    {t('common.copy')}
                  </Button>
                </div>
                <p className="text-[11px] text-slate-500">{t('settings.dashboardPairCodeHint')}</p>
                {qrUrl && (
                  <p className="text-[11px] text-slate-500 break-all">
                    <span className="text-slate-400">URL: </span>{qrUrl}
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          !qrLoading && (
            <p className="text-[11px] text-slate-500">{t('settings.dashboardQrSkeleton')}</p>
          )
        )}
      </CardContent>
    </Card>
    </div>
  )

  const ReceiptSection = (
    <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-slate-100">
          <Receipt className="w-4 h-4 text-teal-400" />
          {t('settings.receipt')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 pt-0">
          <div className="space-y-1.5">
            <Label className="text-slate-400">{t('settings.shopAddress')}</Label>
            <Input
              className="bg-slate-950 border-slate-700 text-sm"
              value={settings.shopAddress ?? ''}
              onChange={(e) => setSettings({ ...settings, shopAddress: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400">{t('settings.shopPhone')}</Label>
            <Input
              className="bg-slate-950 border-slate-700 text-sm"
              value={settings.shopPhone ?? ''}
              onChange={(e) => setSettings({ ...settings, shopPhone: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400">{t('settings.receiptTagline')}</Label>
            <Input
              className="bg-slate-950 border-slate-700 text-sm"
              value={settings.receiptTagline ?? ''}
              onChange={(e) => setSettings({ ...settings, receiptTagline: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-slate-400">{t('settings.receiptFooter')}</Label>
            <Textarea
              className="bg-slate-950 border-slate-700 text-sm"
              rows={3}
              value={settings.receiptFooter ?? ''}
              onChange={(e) => setSettings({ ...settings, receiptFooter: e.target.value })}
            />
        </div>
        <div className="space-y-2">
          <Label className="text-slate-400">{t('settings.receiptLogo')}</Label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
              onClick={async () => {
                const logoPath = await window.pos.selectReceiptLogo()
                if (logoPath) await updateSetting('receiptLogoPath', logoPath)
              }}
            >
              <ImageIcon className="w-4 h-4 mr-1.5" />
              {t('settings.selectLogo')}
            </Button>
            {settings.receiptLogoPath ? (
              <Button
                variant="ghost"
                className="text-slate-500 hover:text-slate-300"
                onClick={() => updateSetting('receiptLogoPath', '')}
              >
                {t('inventory.remove')}
              </Button>
            ) : null}
          </div>
          {settings.receiptLogoPath ? (
            <p className="text-xs text-slate-500 truncate">{settings.receiptLogoPath}</p>
          ) : null}
          <p className="text-xs text-slate-500">{t('settings.logoHint')}</p>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
            <Label className="text-slate-300">{t('settings.receiptShowLogo')}</Label>
            <Switch
              checked={settings.receiptShowLogo === 'true'}
              onCheckedChange={(v) => setSettings({ ...settings, receiptShowLogo: v ? 'true' : 'false' })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const GeneralSection = (
    <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-slate-100">
          <SettingsIcon className="w-4 h-4 text-teal-400" />
          {t('settings.tabs.general')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-1.5">
          <Label className="text-slate-400">{t('settings.language')}</Label>
          <Select
            value={settings.language ?? 'en'}
            onValueChange={(v) => setSettings({ ...settings, language: v })}
          >
            <SelectTrigger className="bg-slate-950 border-slate-700 w-56 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              <SelectItem value="en">English</SelectItem>
              <SelectItem value="ur">اردو (Urdu)</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2.5 pt-1">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
            <Label className="text-slate-300">{t('settings.barcode')}</Label>
            <Switch
              checked={settings.barcodeEnabled === 'true'}
              onCheckedChange={(v) => setSettings({ ...settings, barcodeEnabled: v ? 'true' : 'false' })}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
 <div className="flex flex-col gap-0.5">
              <Label className="flex items-center gap-1.5 text-slate-300">
                <Calculator className="w-3.5 h-3.5 text-slate-500" />
                {t('settings.tillReconciliation')}
              </Label>
              {openShiftId && settings.tillReconciliationEnabled === 'true' && (
                <span className="text-[10px] text-amber-400">
                  {t('settings.closeShiftToDisable')}
                </span>
              )}
            </div>
            <Switch
              checked={settings.tillReconciliationEnabled === 'true'}
              disabled={!!openShiftId && settings.tillReconciliationEnabled === 'true'}
              onCheckedChange={(v) => {
                if (!v && openShiftId) {
                  toasts.error(t('settings.cannotDisableTillOpen'))
                  return
                }
                setSettings({ ...settings, tillReconciliationEnabled: v ? 'true' : 'false' })
              }}
            />
          </div>
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
            <Label className="flex items-center gap-1.5 text-slate-300">
              <Receipt className="w-3.5 h-3.5 text-slate-500" />
              {t('settings.confirmBeforePrint')}
            </Label>
            <Switch
              checked={settings.confirmSaleBeforePrint === 'true'}
              onCheckedChange={(v) => setSettings({ ...settings, confirmSaleBeforePrint: v ? 'true' : 'false' })}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )

  const PrinterSection = (
    <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-slate-100">
          <Printer className="w-4 h-4 text-teal-400" />
          {t('settings.printer')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1.5 pt-0">
        <Label className="text-slate-400">{t('settings.printer')}</Label>
          <Select
            value={isExplicitInterface(settings.printerName ?? '') ? '__custom__' : (settings.printerName ?? '')}
            onValueChange={(v) => {
              if (v === '__custom__') {
                setSettings({ ...settings, printerName: isExplicitInterface(settings.printerName ?? '')
                  ? (settings.printerName ?? '')
                  : 'tcp://localhost:9100' })
              } else {
                setSettings({ ...settings, printerName: v })
              }
            }}
        >
          <SelectTrigger className="bg-slate-950 border-slate-700 text-sm">
            <SelectValue placeholder={t('settings.selectPrinter')} />
          </SelectTrigger>
          <SelectContent className="bg-slate-900 border-slate-800">
            <SelectItem value="">{t('settings.noPrinter')}</SelectItem>
            {(settings.printerName && !isExplicitInterface(settings.printerName ?? '') && !printers.includes(settings.printerName)
              ? [settings.printerName, ...printers]
              : printers
            ).map((name) => (
              <SelectItem key={name} value={name}>{name}</SelectItem>
            ))}
            <SelectItem value="__custom__">{t('settings.customPrinter')}</SelectItem>
          </SelectContent>
        </Select>

        {isExplicitInterface(settings.printerName ?? '') && (
          <Input
            className="bg-slate-950 border-slate-700 text-sm"
            placeholder="tcp://localhost:9100"
            value={settings.printerName ?? ''}
              onChange={(e) => setSettings({ ...settings, printerName: e.target.value })}
            />
          )}
        <p className="text-xs text-slate-500">{t('settings.printerHint')}</p>

        <div className="space-y-1.5 pt-2 border-t border-slate-800">
          <Label className="text-slate-400">{t('settings.barcodePrinter')}</Label>
          <Select
            value={isExplicitInterface(settings.barcodePrinterName ?? '') ? '__custom__' : (settings.barcodePrinterName ?? '')}
            onValueChange={(v) => {
              if (v === '__custom__') {
                setSettings({ ...settings, barcodePrinterName: isExplicitInterface(settings.barcodePrinterName ?? '')
                  ? (settings.barcodePrinterName ?? '')
                  : 'tcp://localhost:9100' })
              } else {
                setSettings({ ...settings, barcodePrinterName: v })
              }
            }}
          >
            <SelectTrigger className="bg-slate-950 border-slate-700 text-sm">
              <SelectValue placeholder={t('settings.barcodePrinterHint')} />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              <SelectItem value="">{t('settings.barcodePrinterSame')}</SelectItem>
              {(settings.barcodePrinterName && !isExplicitInterface(settings.barcodePrinterName ?? '') && !printers.includes(settings.barcodePrinterName)
                ? [settings.barcodePrinterName, ...printers]
                : printers
              ).map((name) => (
                <SelectItem key={name} value={name}>{name}</SelectItem>
              ))}
              <SelectItem value="__custom__">{t('settings.customPrinter')}</SelectItem>
            </SelectContent>
          </Select>
          {isExplicitInterface(settings.barcodePrinterName ?? '') && (
            <Input
              className="bg-slate-950 border-slate-700 text-sm"
              placeholder="tcp://localhost:9100"
              value={settings.barcodePrinterName ?? ''}
              onChange={(e) => setSettings({ ...settings, barcodePrinterName: e.target.value })}
            />
          )}
          <p className="text-xs text-slate-500">{t('settings.barcodePrinterDesc')}</p>
        </div>
      </CardContent>
    </Card>
  )

  const StoreSection = MULTI_TENANT ? (
    <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-slate-100">
          <Building2 className="w-4 h-4 text-teal-400" />
          {t('settings.tabs.store')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-1.5">
          <Label className="text-slate-400">{t('store.branchName')}</Label>
          <div className="flex gap-2">
            <Input
              className="bg-slate-950 border-slate-700 text-sm"
              value={newBranch}
              onChange={(e) => setNewBranch(e.target.value)}
              placeholder={t('store.branchName')}
            />
            <Button
              className="bg-teal-500 text-teal-950 hover:bg-teal-400 shrink-0"
              disabled={!newBranch.trim()}
              onClick={async () => {
                await window.pos.createBranch(newBranch.trim())
                setNewBranch('')
                await refresh()
                toasts.success('Branch added')
              }}
            >
              {t('store.addBranch')}
            </Button>
          </div>
        </div>

        <div className="space-y-1.5">
          <Label className="text-slate-400">{t('store.newTillFor')}</Label>
          <Select value={tillBranch} onValueChange={(v) => setTillBranch(v)}>
            <SelectTrigger className="bg-slate-950 border-slate-700 w-full text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-900 border-slate-800">
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label className="text-slate-400">{t('store.tillName')}</Label>
          <div className="flex gap-2">
            <Input
              className="bg-slate-950 border-slate-700 text-sm"
              value={newTill}
              onChange={(e) => setNewTill(e.target.value)}
              placeholder={t('store.tillName')}
            />
            <Button
              className="bg-teal-500 text-teal-950 hover:bg-teal-400 shrink-0"
              disabled={!newTill.trim() || !tillBranch}
              onClick={async () => {
                await window.pos.createTill(newTill.trim(), tillBranch)
                setNewTill('')
                await refresh()
                toasts.success('Till added')
              }}
            >
              {t('store.addTill')}
            </Button>
          </div>
        </div>

        <div className="space-y-2.5 pt-1">
          {branches.map((b) => {
            const branchTills = tills.filter((tl) => tl.branchId === b.id)
            const isActiveBranch = (settings.currentBranchId || 'branch-default') === b.id
            return (
              <div
                key={b.id}
                className="rounded-lg border border-slate-800 bg-slate-950/40 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-slate-100">{b.name}</span>
                  {isActiveBranch ? (
                    <Badge className="bg-teal-500/15 text-teal-300 border-teal-500/30 gap-1">
                      <ShieldCheck className="w-3 h-3" />
                      {t('store.active')}
                    </Badge>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="border-slate-700 text-slate-300 hover:bg-slate-800 h-7"
                      onClick={async () => {
                        await window.pos.setSetting('currentBranchId', b.id)
                        await refresh()
                        await onSettingsChanged()
                      }}
                    >
                      {t('store.setActive')}
                    </Button>
                  )}
                </div>

                {branchTills.length === 0 ? (
                  <p className="mt-2 text-xs text-slate-500">{t('store.tills')}: —</p>
                ) : (
                  <div className="mt-2">
                    <Table>
                      <TableHeader>
                        <TableRow className="border-slate-800">
                          <TableHead className="text-slate-500">{t('store.tills')}</TableHead>
                          <TableHead className="text-right text-slate-500">{t('store.active')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {branchTills.map((tl) => {
                          const isActiveTill = (settings.currentTillId || 'till-1') === tl.id
                          return (
                            <TableRow key={tl.id} className="border-slate-800">
                              <TableCell className="text-slate-300">{tl.name}</TableCell>
                              <TableCell className="text-right">
                                {isActiveTill ? (
                                  <Badge className="bg-teal-500/15 text-teal-300 border-teal-500/30 gap-1">
                                    <ShieldCheck className="w-3 h-3" />
                                    {t('store.active')}
                                  </Badge>
                                ) : (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-slate-700 text-slate-300 hover:bg-slate-800 h-7"
                                    onClick={async () => {
                                      await window.pos.setSetting('currentTillId', tl.id)
                                      await refresh()
                                      await onSettingsChanged()
                                    }}
                                  >
                                    {t('store.setActive')}
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  ) : null

  const LicenseSection = (
    <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base text-slate-100">
          <KeyRound className="w-4 h-4 text-teal-400" />
          {t('settings.license')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-1.5">
          <Label className="text-slate-400">{t('settings.machineId')}</Label>
          <code className="block rounded-md border border-slate-800 bg-slate-950/60 px-3 py-2 text-[11px] leading-relaxed text-slate-500 break-all">
            {machineId}
          </code>
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-400">{t('settings.licenseStatus')}</Label>
          <div className="text-sm">
            {licenseStatus?.state === 'valid' && (
              <span className="text-emerald-400">
                {t('license.valid', {
                  date: new Date(licenseStatus.expiry).toLocaleDateString(),
                  days: licenseStatus.daysRemaining
                })}
              </span>
            )}
            {licenseStatus?.state === 'grace' && (
              <span className="text-amber-400">
                {t('license.grace', {
                  date: new Date(licenseStatus.expiry).toLocaleDateString(),
                  days: licenseStatus.daysRemaining
                })}
              </span>
            )}
            {licenseStatus?.state === 'expired' && (
              <span className="text-red-400">
                {t('license.expired', { date: new Date(licenseStatus.expiry).toLocaleDateString() })}
              </span>
            )}
            {licenseStatus?.state === 'trial' && (
              <span className="text-amber-400">
                {t('license.trial', {
                  date: new Date(licenseStatus.expiry).toLocaleDateString(),
                  days: licenseStatus.daysRemaining
                })}
              </span>
            )}
            {licenseStatus?.state === 'none' && (
              <span className="text-slate-500">{t('license.none')}</span>
            )}
          </div>
        </div>
        <div className="space-y-1.5">
          <Label className="text-slate-400">{t('settings.licenseKey')}</Label>
          <Textarea
            className="bg-slate-950 border-slate-700 text-sm"
            rows={2}
            placeholder="paste license key..."
            value={licenseKey}
            onChange={(e) => setLicenseKey(e.target.value)}
          />
        </div>
        <Button
          className="bg-teal-500 text-teal-950 hover:bg-teal-400"
          onClick={handleActivate}
        >
          {t('settings.activateLicense')}
        </Button>
      </CardContent>
    </Card>
  )

  const SupportSection = (
    <>
    <div className="space-y-4">
      <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <Database className="w-4 h-4 text-teal-400" />
            {t('settings.backup')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
            <Label className="text-slate-300">{t('settings.autoBackup')}</Label>
            <Switch
              checked={settings.autoBackup === 'true'}
              onCheckedChange={(v) => setSettings({ ...settings, autoBackup: v ? 'true' : 'false' })}
            />
          </div>
          <Button
            onClick={handleBackup}
            className="bg-teal-500 text-teal-950 hover:bg-teal-400"
          >
            {t('settings.backupNow')}
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <RefreshCw className="w-4 h-4 text-teal-400" />
            Auto-Update
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <p className="text-xs text-slate-500">Updates are checked automatically every 4 hours</p>
          <Button
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={() => window.pos.checkForUpdates()}
          >
            <RefreshCw className="w-4 h-4" />
            Check for Updates
          </Button>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base text-slate-100">
            <MessageSquare className="w-4 h-4 text-teal-400" />
            {t('settings.feedback')}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <Textarea
            className="bg-slate-950 border-slate-700 text-sm"
            rows={3}
            placeholder={t('settings.feedbackPlaceholder')}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
          />
          <Button
            variant="outline"
            className="border-slate-700 text-slate-300 hover:bg-slate-800"
            onClick={handleFeedback}
            disabled={!feedback.trim()}
          >
            {t('common.submit')}
          </Button>
        </CardContent>
      </Card>
      </div>
    </>
  )

  const renderTab = (id: TabId) => {
    switch (id) {
      case 'shop': return ShopSection
      case 'receipt': return ReceiptSection
      case 'general': return GeneralSection
      case 'printer': return PrinterSection
      case 'store': return StoreSection
      case 'license': return LicenseSection
      case 'support': return SupportSection
    }
  }

  return (
    <div className="h-full flex flex-col bg-slate-950 text-slate-100">
      <div className="flex-1 min-h-0 flex">
        {/* ===== Sidebar ===== */}
        <aside className="w-44 shrink-0 border-r border-slate-800 bg-slate-900/40 overflow-y-auto pos-scroll p-2 space-y-1">
          {TABS.filter((tab) => !tab.multiTenantOnly || MULTI_TENANT).map((tab) => {
            const Icon = tab.icon
            const active = activeTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2.5 w-full px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-teal-500/15 text-teal-300'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{t(tab.labelKey)}</span>
              </button>
            )
          })}
        </aside>

        {/* ===== Tab content ===== */}
        <div className="flex-1 min-h-0 overflow-y-auto pos-scroll flex flex-col justify-between">
          <div className="mx-auto max-w-3xl p-4 sm:p-6 pb-24 min-w-175">
            {renderTab(activeTab)}
          </div>
          {/* Sticky Save bar — edits persist only on click */}
          <div className="sticky bottom-0 border-t border-slate-800 bg-slate-950/95 backdrop-blur px-4 py-3 flex items-center justify-between gap-3">
            <span className={`text-xs ${dirty ? 'text-amber-400' : 'text-slate-600'}`}>
              {dirty ? t('settings.unsaved') : t('settings.allSaved')}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                className="text-slate-400 hover:text-slate-200"
                disabled={!dirty}
                onClick={() => { loadedRef.current = settings; setSettings({ ...loadedRef.current }) }}
              >
                {t('common.reset')}
              </Button>
              <Button
                className="bg-teal-500 text-teal-950 hover:bg-teal-400 font-semibold"
                disabled={!dirty}
                onClick={saveAll}
              >
                {t('common.save')}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

