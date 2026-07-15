'use client'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Product } from '@/lib/pos-mock'

interface RecentState {
  recents: Array<{ id: string; name: string; defaultPrice: number; unitType: 'piece' | 'thaan'; addedAt: string }>
  addRecent: (product: Product) => void
  clearRecents: () => void
}

export const useRecents = create<RecentState>()(
  persist(
    (set, get) => ({
      recents: [],
      addRecent: (product) => {
        const existing = get().recents.filter((r) => r.id !== product.id)
        const entry = {
          id: product.id,
          name: product.name,
          defaultPrice: product.defaultPrice,
          unitType: product.unitType,
          addedAt: new Date().toISOString()
        }
        set({ recents: [entry, ...existing].slice(0, 8) }) // keep last 8
      },
      clearRecents: () => set({ recents: [] })
    }),
    { name: 'pos-recents' }
  )
)
