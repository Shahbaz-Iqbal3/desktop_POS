import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Printer, Receipt } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export type ReceiptSettings = {
  shopName?: string
  receiptShowLogo?: string
  receiptTagline?: string
  shopAddress?: string
  shopPhone?: string
  receiptFooter?: string
}

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  settings: ReceiptSettings
  logo: string | null
  onPrint: () => void | Promise<void>
  children: React.ReactNode
}

// Shared "thermal roll" preview used by every print flow (sale, reprint, refund).
// The body (children) is provided by the caller so sale and refund layouts can
// each mirror their exact ESC/POS format.
export function PrintPreviewDialog({ open, onOpenChange, settings, logo, onPrint, children }: Props) {
  const { t } = useTranslation()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-slate-900 border-slate-800 max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-teal-400" /> {t('billing.receiptPreview')}
          </DialogTitle>
          <DialogDescription className="text-slate-400">
            {settings.shopName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex justify-center py-1">
          <div className="w-[300px] bg-white text-black rounded-sm shadow-lg p-4 font-mono text-[11px] leading-[1.35]">
            {settings.receiptShowLogo === 'true' && logo && (
              <div className="flex justify-center mb-1">
                <img src={logo} alt="logo" className="max-h-16 object-contain" />
              </div>
            )}
            <div className="text-center font-bold text-base tracking-wide">
              {(settings.shopName || t('app.title')).toUpperCase()}
            </div>
            {settings.receiptTagline && (
              <div className="text-center">{settings.receiptTagline}</div>
            )}
            {settings.shopAddress && (
              <div className="text-center">{settings.shopAddress}</div>
            )}
            {settings.shopPhone && (
              <div className="text-center">{settings.shopPhone}</div>
            )}
            {children}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="border-slate-700 text-slate-300"
            onClick={() => onOpenChange(false)}
          >
            {t('billing.skipPrint')}
          </Button>
          <Button
            className="bg-teal-500 text-teal-950 hover:bg-teal-400"
            onClick={onPrint}
          >
            <Printer className="w-4 h-4 mr-1.5" /> {t('billing.printReceipt')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
