'use client'
import { create } from 'zustand'
import type { SaleItem, Product } from '@/lib/pos-mock'

export type CartLine = SaleItem & { stock: number; categoryColor?: string }

interface CartState {
  lines: CartLine[]
  paymentMethod: 'cash' | 'digital'
  paidAmount: string
  cartDiscount: number // percentage 0-100
  customerName: string
  notes: string
  addToCart: (product: Product, stock: number) => void
  updateLine: (productId: string, patch: Partial<CartLine>) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void
  setPaymentMethod: (m: 'cash' | 'digital') => void
  setPaidAmount: (a: string) => void
  setCartDiscount: (d: number) => void
  setCustomerName: (n: string) => void
  setNotes: (n: string) => void
  loadHeld: (items: SaleItem[], stockMap: Record<string, number>) => void
}

const round = (n: number) => Math.round(n * 100) / 100

export const useCart = create<CartState>((set, get) => ({
  lines: [],
  paymentMethod: 'cash',
  paidAmount: '',
  cartDiscount: 0,
  customerName: '',
  notes: '',
  addToCart: (product, stock) => {
    set((s) => {
      const existing = s.lines.find((l) => l.productId === product.id)
      if (existing) {
        if (existing.quantity >= stock) return s
        return {
          lines: s.lines.map((l) =>
            l.productId === product.id
              ? { ...l, quantity: l.quantity + 1, lineTotal: round((l.quantity + 1) * l.price * (1 - (l.discount ?? 0) / 100)) }
              : l
          )
        }
      }
      const line: CartLine = {
        productId: product.id,
        name: product.name,
        unitType: product.unitType,
        price: product.defaultPrice,
        quantity: 1,
        cutLength: product.unitType === 'thaan' ? 1 : undefined,
        discount: 0,
        lineTotal: round(product.defaultPrice),
        stock
      }
      return { lines: [...s.lines, line] }
    })
  },
  updateLine: (productId, patch) => {
    set((s) => ({
      lines: s.lines.map((l) => {
        if (l.productId !== productId) return l
        const next = { ...l, ...patch }
        next.lineTotal = round(next.quantity * next.price * (1 - (next.discount ?? 0) / 100))
        return next
      })
    }))
  },
  removeFromCart: (productId) => set((s) => ({ lines: s.lines.filter((l) => l.productId !== productId) })),
  clearCart: () => set({ lines: [], paidAmount: '', cartDiscount: 0, customerName: '', notes: '' }),
  setPaymentMethod: (m) => set({ paymentMethod: m }),
  setPaidAmount: (a) => set({ paidAmount: a }),
  setCartDiscount: (d) => set({ cartDiscount: Math.max(0, Math.min(100, d)) }),
  setCustomerName: (n) => set({ customerName: n }),
  setNotes: (n) => set({ notes: n }),
  loadHeld: (items, stockMap) => {
    set({
      lines: items.map((it) => ({ ...it, stock: stockMap[it.productId] ?? 0 })),
      paidAmount: '',
      cartDiscount: 0,
      customerName: '',
      notes: ''
    })
  }
}))

export function computeTotals(lines: CartLine[], cartDiscount: number, taxRate = 0) {
  const subtotal = round(lines.reduce((s, l) => s + l.lineTotal, 0))
  const afterCartDiscount = round(subtotal * (1 - cartDiscount / 100))
  const tax = round(afterCartDiscount * (taxRate / 100))
  const total = round(afterCartDiscount + tax)
  return { subtotal, discount: round(subtotal - afterCartDiscount), tax, total }
}
