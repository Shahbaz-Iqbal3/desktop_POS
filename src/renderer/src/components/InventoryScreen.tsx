import { useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, Plus, Search, Pencil, Trash2, PackagePlus } from 'lucide-react'
import type { useToasts } from '../hooks/useToasts'
import type { Product, Category, UnitType } from '@shared/types'
import {
  Button
} from '@/components/ui/button'
import {
  Input
} from '@/components/ui/input'
import {
  Label
} from '@/components/ui/label'
import {
  Badge
} from '@/components/ui/badge'
import {
  Card, CardHeader, CardTitle, CardAction, CardContent
} from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table'
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter
} from '@/components/ui/dialog'
import {
  ScrollArea
} from '@/components/ui/scroll-area'

type Toasts = ReturnType<typeof useToasts>

type ProductDraft = {
  name: string
  categoryId: string
  unitType: UnitType
  defaultPrice: string
  barcode: string
  sku: string
  lowStockThreshold: string
  initialStock: string
}

type RestockDraft = {
  type: 'restock' | 'adjustment'
  direction: 'add' | 'remove'
  quantity: string
  reason: string
}

const EMPTY_DRAFT: ProductDraft = {
  name: '',
  categoryId: '',
  unitType: 'piece',
  defaultPrice: '',
  barcode: '',
  sku: '',
  lowStockThreshold: '5',
  initialStock: '0'
}

export function InventoryScreen({ toasts }: { toasts: Toasts }) {
  const { t } = useTranslation()
  const [products, setProducts] = useState<Product[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [stockMap, setStockMap] = useState<Record<string, number>>({})
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState<string | null>(null)

  const [editing, setEditing] = useState<Product | null>(null)
  const [productDraft, setProductDraft] = useState<ProductDraft>(EMPTY_DRAFT)
  const [productModalOpen, setProductModalOpen] = useState(false)

  const [restockTarget, setRestockTarget] = useState<Product | null>(null)
  const [restockDraft, setRestockDraft] = useState<RestockDraft>({
    type: 'restock',
    direction: 'add',
    quantity: '',
    reason: ''
  })

  const refresh = async () => {
    const [ps, cs, sm] = await Promise.all([
      window.pos.getProducts(),
      window.pos.getCategories(),
      window.pos.getStockLevels()
    ])
    setProducts(ps)
    setCategories(cs)
    setStockMap(sm)
  }

  useEffect(() => {
    void refresh()
  }, [])

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (activeCategory && p.categoryId !== activeCategory) return false
      if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false
      return true
    })
  }, [products, activeCategory, search])

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—'

  const stockBadge = (stock: number, threshold: number) => {
    if (stock <= 0)
      return <Badge variant="outline" className="bg-red-500/15 text-red-300 border-red-500/30">{stock}</Badge>
    if (stock <= threshold)
      return <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30">{stock}</Badge>
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">{stock}</Badge>
  }

  // ----- Product modal -----
  const openAdd = () => {
    setEditing(null)
    setProductDraft({ ...EMPTY_DRAFT, categoryId: categories[0]?.id ?? '' })
    setProductModalOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditing(p)
    setProductDraft({
      name: p.name,
      categoryId: p.categoryId,
      unitType: p.unitType,
      defaultPrice: String(p.defaultPrice),
      barcode: p.barcode ?? '',
      sku: p.sku ?? '',
      lowStockThreshold: String(p.lowStockThreshold),
      initialStock: '0'
    })
    setProductModalOpen(true)
  }

  const saveProduct = async () => {
    const name = productDraft.name.trim()
    if (!name) {
      toasts.error('Enter a name')
      return
    }
    if (!productDraft.categoryId) {
      toasts.error('Select a category')
      return
    }
    const price = parseFloat(productDraft.defaultPrice)
    if (isNaN(price) || price < 0) {
      toasts.error('Enter a valid price')
      return
    }
    const threshold = parseInt(productDraft.lowStockThreshold, 10)
    const initial = parseFloat(productDraft.initialStock)

    try {
      if (editing) {
        await window.pos.updateProduct(editing.id, {
          name,
          categoryId: productDraft.categoryId,
          unitType: productDraft.unitType,
          defaultPrice: price,
          barcode: productDraft.barcode.trim() || null,
          sku: productDraft.sku.trim() || null,
          lowStockThreshold: isNaN(threshold) ? 5 : threshold
        })
        toasts.success(t('inventory.productUpdated'))
      } else {
        await window.pos.createProduct({
          name,
          categoryId: productDraft.categoryId,
          unitType: productDraft.unitType,
          defaultPrice: price,
          barcode: productDraft.barcode.trim() || undefined,
          sku: productDraft.sku.trim() || undefined,
          lowStockThreshold: isNaN(threshold) ? 5 : threshold,
          initialStock: isNaN(initial) ? 0 : initial
        })
        toasts.success(t('inventory.productAdded'))
      }
      setProductModalOpen(false)
      await refresh()
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    }
  }

  const deleteProduct = async (p: Product) => {
    if (!window.confirm(t('inventory.confirmDelete'))) return
    try {
      await window.pos.deleteProduct(p.id)
      toasts.success(t('inventory.productDeleted'))
      await refresh()
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    }
  }

  // ----- Restock modal -----
  const openRestock = (p: Product) => {
    setRestockTarget(p)
    setRestockDraft({ type: 'restock', direction: 'add', quantity: '', reason: '' })
  }

  const saveRestock = async () => {
    if (!restockTarget) return
    const qty = parseFloat(restockDraft.quantity)
    if (isNaN(qty) || qty <= 0) {
      toasts.error('Enter a valid quantity')
      return
    }
    const change =
      restockDraft.type === 'restock'
        ? Math.abs(qty)
        : restockDraft.direction === 'add'
          ? Math.abs(qty)
          : -Math.abs(qty)
    const reason =
      restockDraft.reason.trim() ||
      (restockDraft.type === 'restock' ? 'Restock' : 'Adjustment')

    try {
      await window.pos.addStockMovement({
        productId: restockTarget.id,
        category: restockDraft.type,
        changeAmount: change,
        reason
      })
      toasts.success(t('inventory.stockUpdated'))
      setRestockTarget(null)
      await refresh()
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col p-4 gap-4">
      <Card className="bg-slate-900/60 border-slate-800 flex flex-col flex-1 min-h-0">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Package className="w-5 h-5 text-teal-400" />
            {t('inventory.title')}
          </CardTitle>
          <CardAction>
            <Button className="bg-teal-500 text-teal-950 hover:bg-teal-400" onClick={openAdd}>
              <Plus className="w-4 h-4" /> {t('inventory.addProduct')}
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="flex flex-col flex-1 min-h-0 gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <Input
                className="pl-9 bg-slate-950 border-slate-700"
                placeholder={t('inventory.search')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select
              value={activeCategory ?? ''}
              onValueChange={(v) => setActiveCategory(v || null)}
            >
              <SelectTrigger className="w-[200px] bg-slate-950 border-slate-700">
                <SelectValue placeholder={t('inventory.allCategories')} />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-700">
                <SelectItem value="">{t('inventory.allCategories')}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 py-16 text-slate-500">
              <Package className="w-10 h-10 mb-2 opacity-40" />
              <p className="text-sm">{t('inventory.noProducts')}</p>
            </div>
          ) : (
            <ScrollArea className="flex-1 min-h-0 pos-scroll rounded-md border border-slate-800">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent border-slate-800">
                    <TableHead className="text-slate-400">{t('inventory.name')}</TableHead>
                    <TableHead className="text-slate-400">{t('inventory.category')}</TableHead>
                    <TableHead className="text-slate-400">{t('inventory.unitType')}</TableHead>
                    <TableHead className="text-slate-400">{t('inventory.price')}</TableHead>
                    <TableHead className="text-slate-400">{t('inventory.stock')}</TableHead>
                    <TableHead className="text-right text-slate-400">—</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((p) => {
                    const stock = stockMap[p.id] ?? 0
                    const unit = p.unitType === 'thaan' ? t('inventory.m') : t('inventory.pcs')
                    return (
                      <TableRow key={p.id} className="border-slate-800">
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-slate-400">{categoryName(p.categoryId)}</TableCell>
                        <TableCell>
                          {p.unitType === 'thaan' ? t('inventory.thaan') : t('inventory.piece')}
                        </TableCell>
                        <TableCell className="text-teal-400 font-medium">Rs {p.defaultPrice.toFixed(2)}</TableCell>
                        <TableCell>
                          <span className="flex items-center gap-1.5">
                            {stockBadge(stock, p.lowStockThreshold)}
                            <span className="text-slate-500 text-xs">{unit}</span>
                          </span>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center justify-end gap-1.5">
                            <Button size="sm" variant="outline" className="h-8 border-slate-700 text-slate-300" onClick={() => openRestock(p)}>
                              <PackagePlus className="w-3.5 h-3.5" /> {t('inventory.restock')}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 text-slate-300" onClick={() => openEdit(p)}>
                              <Pencil className="w-3.5 h-3.5" /> {t('inventory.edit')}
                            </Button>
                            <Button size="sm" variant="ghost" className="h-8 text-red-400" onClick={() => deleteProduct(p)}>
                              <Trash2 className="w-3.5 h-3.5" /> {t('inventory.delete')}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Product modal */}
      <Dialog open={productModalOpen} onOpenChange={setProductModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-teal-400" />
              {editing ? t('inventory.edit') : t('inventory.addProduct')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 max-h-[70vh] overflow-y-auto pos-scroll">
            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('inventory.name')}</Label>
              <Input
                className="bg-slate-950 border-slate-700"
                value={productDraft.name}
                onChange={(e) => setProductDraft({ ...productDraft, name: e.target.value })}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('inventory.category')}</Label>
              <Select
                value={productDraft.categoryId}
                onValueChange={(v) => setProductDraft({ ...productDraft, categoryId: v })}
              >
                <SelectTrigger className="bg-slate-950 border-slate-700">
                  <SelectValue placeholder={t('inventory.allCategories')} />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('inventory.unitType')}</Label>
              <Select
                value={productDraft.unitType}
                onValueChange={(v) => setProductDraft({ ...productDraft, unitType: v as UnitType })}
              >
                <SelectTrigger className="bg-slate-950 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="piece">{t('inventory.piece')}</SelectItem>
                  <SelectItem value="thaan">{t('inventory.thaan')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('inventory.defaultPrice')}</Label>
              <Input
                className="bg-slate-950 border-slate-700"
                type="number"
                step="0.01"
                value={productDraft.defaultPrice}
                onChange={(e) => setProductDraft({ ...productDraft, defaultPrice: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('inventory.barcode')}</Label>
              <Input
                className="bg-slate-950 border-slate-700"
                value={productDraft.barcode}
                onChange={(e) => setProductDraft({ ...productDraft, barcode: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('inventory.sku')}</Label>
              <Input
                className="bg-slate-950 border-slate-700"
                value={productDraft.sku}
                onChange={(e) => setProductDraft({ ...productDraft, sku: e.target.value })}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('inventory.lowStockThreshold')}</Label>
              <Input
                className="bg-slate-950 border-slate-700"
                type="number"
                value={productDraft.lowStockThreshold}
                onChange={(e) => setProductDraft({ ...productDraft, lowStockThreshold: e.target.value })}
              />
            </div>

            {!editing && (
              <div className="space-y-1.5">
                <Label className="text-slate-400">{t('inventory.initialStock')}</Label>
                <Input
                  className="bg-slate-950 border-slate-700"
                  type="number"
                  step="0.01"
                  value={productDraft.initialStock}
                  onChange={(e) => setProductDraft({ ...productDraft, initialStock: e.target.value })}
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setProductModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button className="bg-teal-500 text-teal-950 hover:bg-teal-400" onClick={saveProduct}>
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Restock modal */}
      <Dialog open={!!restockTarget} onOpenChange={(o) => { if (!o) setRestockTarget(null) }}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <PackagePlus className="w-5 h-5 text-teal-400" />
              {t('inventory.restockTitle')}: {restockTarget?.name}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('inventory.movementType')}</Label>
              <Select
                value={restockDraft.type}
                onValueChange={(v) => setRestockDraft({ ...restockDraft, type: v as 'restock' | 'adjustment' })}
              >
                <SelectTrigger className="bg-slate-950 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  <SelectItem value="restock">{t('inventory.restockType')}</SelectItem>
                  <SelectItem value="adjustment">{t('inventory.adjustmentType')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {restockDraft.type === 'adjustment' && (
              <div className="space-y-1.5">
                <Label className="text-slate-400">{t('inventory.direction')}</Label>
                <Select
                  value={restockDraft.direction}
                  onValueChange={(v) => setRestockDraft({ ...restockDraft, direction: v as 'add' | 'remove' })}
                >
                  <SelectTrigger className="bg-slate-950 border-slate-700">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="add">{t('inventory.add')}</SelectItem>
                    <SelectItem value="remove">{t('inventory.remove')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('inventory.quantity')}</Label>
              <Input
                className="bg-slate-950 border-slate-700"
                type="number"
                step="0.01"
                value={restockDraft.quantity}
                onChange={(e) => setRestockDraft({ ...restockDraft, quantity: e.target.value })}
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('inventory.reason')}</Label>
              <Input
                className="bg-slate-950 border-slate-700"
                value={restockDraft.reason}
                placeholder={t('inventory.reasonPlaceholder')}
                onChange={(e) => setRestockDraft({ ...restockDraft, reason: e.target.value })}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setRestockTarget(null)}>
              {t('common.cancel')}
            </Button>
            <Button className="bg-teal-500 text-teal-950 hover:bg-teal-400" onClick={saveRestock}>
              {t('inventory.confirmRestock')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
