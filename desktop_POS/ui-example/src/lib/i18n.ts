'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type Language = 'en' | 'ur'

type I18nState = {
  lang: Language
  dir: 'ltr' | 'rtl'
  setLang: (l: Language) => void
}

// Minimal translation dictionary for the POS UI.
// Full i18next is used in the Electron renderer; this is a lightweight
// version for the web preview.
const dict: Record<Language, Record<string, string>> = {
  en: {
    'nav.billing': 'Billing',
    'nav.dashboard': 'Dashboard',
    'nav.history': 'History',
    'nav.products': 'Products',
    'nav.shifts': 'Shifts',
    'nav.settings': 'Settings',
    'cart.title': 'Current Sale',
    'cart.empty': 'Cart is empty',
    'cart.empty.hint': 'Tap products on the left to add them',
    'cart.hold': 'Hold',
    'cart.recall': 'Recall',
    'cart.clear': 'Clear',
    'cart.subtotal': 'Subtotal',
    'cart.discount': 'Discount',
    'cart.tax': 'Tax',
    'cart.total': 'Total',
    'cart.paid': 'Paid',
    'cart.change': 'Change',
    'cart.customer': 'Customer name (optional)',
    'cart.confirm': 'Confirm Order',
    'cart.processing': 'Processing…',
    'cart.reprint': 'Reprint last receipt',
    'billing.search': 'Search products by name, SKU, or barcode… (press /)',
    'billing.all': 'All',
    'billing.scanner': 'Scanner',
    'item.discount': 'Discount %',
    'item.cutLength': 'Cut length (m)',
    'item.price': 'Price',
    'item.stock': 'Stock',
    'item.perMeter': 'per meter',
    'item.perPiece': 'per piece',
    'stock.out': 'Out',
    'stock.low': 'Low',
    'common.cancel': 'Cancel',
    'common.create': 'Create',
    'common.save': 'Save',
    'common.close': 'Close',
    'common.print': 'Print'
  },
  ur: {
    'nav.billing': 'بلنگ',
    'nav.dashboard': 'ڈیش بورڈ',
    'nav.history': 'تاریخ',
    'nav.products': 'مصنوعات',
    'nav.shifts': 'شفٹس',
    'nav.settings': 'سیٹنگز',
    'cart.title': 'موجودہ فروخت',
    'cart.empty': 'کارٹ خالی ہے',
    'cart.empty.hint': 'اشیاء شامل کرنے کے لیے تھپتھپائیں',
    'cart.hold': 'روکیں',
    'cart.recall': 'دوبارہ کھولیں',
    'cart.clear': 'صاف کریں',
    'cart.subtotal': 'ذیلی کل',
    'cart.discount': 'رعایت',
    'cart.tax': 'ٹیکس',
    'cart.total': 'کل',
    'cart.paid': 'ادائیگی',
    'cart.change': 'تبدیل',
    'cart.customer': 'گاہک کا نام (اختیاری)',
    'cart.confirm': 'آرڈر کی تصدیق کریں',
    'cart.processing': 'عمل جاری ہے…',
    'cart.reprint': 'آخری رسید دوبارہ پرنٹ کریں',
    'billing.search': 'مصنوعات تلاش کریں… ( / دبائیں)',
    'billing.all': 'تمام',
    'billing.scanner': 'اسکینر',
    'item.discount': 'رعایت %',
    'item.cutLength': 'کٹ لمبائی (میٹر)',
    'item.price': 'قیمت',
    'item.stock': 'اسٹاک',
    'item.perMeter': 'فی میٹر',
    'item.perPiece': 'فی پیس',
    'stock.out': 'ختم',
    'stock.low': 'کم',
    'common.cancel': 'منسوخ',
    'common.create': 'بنائیں',
    'common.save': 'محفوظ کریں',
    'common.close': 'بند کریں',
    'common.print': 'پرنٹ'
  }
}

export const useI18n = create<I18nState>()(
  persist(
    (set, get) => ({
      lang: 'en',
      dir: 'ltr',
      setLang: (l) => {
        set({ lang: l, dir: l === 'ur' ? 'rtl' : 'ltr' })
        if (typeof document !== 'undefined') {
          document.documentElement.lang = l
          document.documentElement.dir = l === 'ur' ? 'rtl' : 'ltr'
        }
      }
    }),
    { name: 'pos-i18n' }
  )
)

export function t(key: string): string {
  const { lang } = useI18n.getState()
  return dict[lang]?.[key] ?? dict.en[key] ?? key
}
