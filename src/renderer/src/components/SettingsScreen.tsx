import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import i18n from '../i18n'
import {
  Store, Languages, Printer, Barcode, Calculator, Database,
  RefreshCw, Building2, KeyRound, MessageSquare, ShieldCheck
} from 'lucide-react'
import type { useToasts } from '../hooks/useToasts'
import type { Branch, Till } from '@shared/types'
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

  const refresh = async () => {
    const s = await window.pos.getSettings()
    setSettings(s)
    setLicenseKey('')
    const [mid, status, br, tl] = await Promise.all([
      window.pos.getMachineId(),
      window.pos.getLicenseStatus(),
      window.pos.getBranches(),
      window.pos.getTills()
    ])
    setMachineId(mid)
    setLicenseStatus(status)
    setBranches(br)
    setTills(tl)
    setTillBranch(s.currentBranchId || br[0]?.id || '')
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
    <div className="h-full overflow-y-auto pos-scroll bg-slate-950 text-slate-100">
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">

        {/* ===== Shop ===== */}
        <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <Store className="w-4 h-4 text-teal-400" />
              {t('settings.shopName')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            <Label className="text-slate-400">{t('settings.shopName')}</Label>
            <Input
              className="bg-slate-950 border-slate-700 text-sm"
              value={settings.shopName ?? ''}
              onChange={(e) => setSettings({ ...settings, shopName: e.target.value })}
              onBlur={(e) => updateSetting('shopName', e.target.value)}
            />
          </CardContent>
        </Card>

        {/* ===== Language ===== */}
        <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <Languages className="w-4 h-4 text-teal-400" />
              {t('settings.language')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            <Label className="text-slate-400">{t('settings.language')}</Label>
            <Select
              value={settings.language ?? 'en'}
              onValueChange={(v) => updateSetting('language', v)}
            >
              <SelectTrigger className="bg-slate-950 border-slate-700 w-56 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                <SelectItem value="en">English</SelectItem>
                <SelectItem value="ur">اردو (Urdu)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* ===== Toggles ===== */}
        <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <Barcode className="w-4 h-4 text-teal-400" />
              {t('settings.barcode')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5 pt-0">
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
              <Label className="text-slate-300">{t('settings.barcode')}</Label>
              <Switch
                checked={settings.barcodeEnabled === 'true'}
                onCheckedChange={(v) => updateSetting('barcodeEnabled', v ? 'true' : 'false')}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-800 bg-slate-950/40 px-3 py-2.5">
              <Label className="flex items-center gap-1.5 text-slate-300">
                <Calculator className="w-3.5 h-3.5 text-slate-500" />
                {t('settings.tillReconciliation')}
              </Label>
              <Switch
                checked={settings.tillReconciliationEnabled === 'true'}
                onCheckedChange={(v) => updateSetting('tillReconciliationEnabled', v ? 'true' : 'false')}
              />
            </div>
          </CardContent>
        </Card>

        {/* ===== Printer ===== */}
        <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <Printer className="w-4 h-4 text-teal-400" />
              {t('settings.printer')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5 pt-0">
            <Label className="text-slate-400">{t('settings.printer')}</Label>
            <Input
              className="bg-slate-950 border-slate-700 text-sm"
              placeholder="e.g. EPSON_TM_T20"
              value={settings.printerName ?? ''}
              onChange={(e) => setSettings({ ...settings, printerName: e.target.value })}
              onBlur={(e) => updateSetting('printerName', e.target.value)}
            />
          </CardContent>
        </Card>

        {/* ===== Backup ===== */}
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
                onCheckedChange={(v) => updateSetting('autoBackup', v ? 'true' : 'false')}
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

        {/* ===== Auto-Update ===== */}
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

        {/* ===== Store (branches & tills) ===== */}
        <Card className="bg-slate-900/60 border border-slate-800 rounded-lg">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base text-slate-100">
              <Building2 className="w-4 h-4 text-teal-400" />
              {t('store.title')}
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

        {/* ===== License ===== */}
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

        {/* ===== Feedback ===== */}
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
    </div>
  )
}
