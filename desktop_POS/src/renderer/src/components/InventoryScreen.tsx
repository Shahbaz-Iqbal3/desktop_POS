import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Package, Plus, Search, Pencil, Trash2, PackagePlus, ChevronUp, ChevronDown, Barcode, Printer, RotateCw } from 'lucide-react'
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
import { renderBarcodeDataUrl } from '@/lib/barcode'

type Toasts = ReturnType<typeof useToasts>

type ProductDraft = {
  name: string
  categoryId: string
  unitType: UnitType
  defaultPrice: string
  defaultDiscount: string
  barcode: string
  sku: string
  lowStockThreshold: string
  initialStock: string
  imageSrc: string | null   // path chosen by user to copy into userData (null = unchanged)
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
  defaultDiscount: '0',
  barcode: '',
  sku: '',
  lowStockThreshold: '5',
  initialStock: '0',
  imageSrc: null
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
  const [productImagePreview, setProductImagePreview] = useState<string | null>(null)

  const [restockTarget, setRestockTarget] = useState<Product | null>(null)
  const [restockDraft, setRestockDraft] = useState<RestockDraft>({
    type: 'restock',
    direction: 'add',
    quantity: '',
    reason: ''
  })

  const [catModalOpen, setCatModalOpen] = useState(false)
  const [editingCat, setEditingCat] = useState<Category | null>(null)
  const [catName, setCatName] = useState('')
  const [deleteCat, setDeleteCat] = useState<Category | null>(null)
  const [reassignTo, setReassignTo] = useState('')
  const [movingId, setMovingId] = useState<string | null>(null)
  const [printingId, setPrintingId] = useState<string | null>(null)
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const flipRects = useRef<Record<string, number>>({})
  const flipNonce = useRef(0)

  const refresh = async () => {
    const [ps, cs, sm] = await Promise.all([
      window.pos.getProducts(undefined, true),
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

  // FLIP animation for category reordering: after the list re-renders in its
  // new order, slide each row from its previous position to the new one.
  const flipApplied = useRef(0)
  useLayoutEffect(() => {
    if (flipNonce.current === 0 || flipNonce.current === flipApplied.current) return
    flipApplied.current = flipNonce.current
    const first = flipRects.current
    for (const id of Object.keys(first)) {
      const el = rowRefs.current[id]
      if (!el) continue
      const delta = first[id] - el.getBoundingClientRect().top
      if (Math.abs(delta) < 1) continue
      el.animate(
        [{ transform: `translateY(${delta}px)` }, { transform: 'translateY(0)' }],
        { duration: 260, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' }
      )
    }
  })

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (activeCategory && p.categoryId !== activeCategory) return false
      if (search.trim() && !p.name.toLowerCase().includes(search.trim().toLowerCase())) return false
      return true
    })
  }, [products, activeCategory, search])

  const categoryName = (id: string) => categories.find((c) => c.id === id)?.name ?? '—'

  // Live CODE128 preview of whatever is currently typed in the barcode field.
  const barcodePreview = useMemo(() => {
    const code = productDraft.barcode.trim()
    return code ? renderBarcodeDataUrl(code) : null
  }, [productDraft.barcode])

  const stockBadge = (stock: number, threshold: number) => {
    if (stock <= 0)
      return <Badge variant="outline" className="bg-red-500/15 text-red-300 border-red-500/30">{stock}</Badge>
    if (stock <= threshold)
      return <Badge variant="outline" className="bg-amber-500/15 text-amber-300 border-amber-500/30">{stock}</Badge>
    return <Badge variant="outline" className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30">{stock}</Badge>
  }

  // Small circular thumbnail for a product. Shows the product's image when one
  // is set, otherwise falls back to a generic product icon.
  const ProductThumbnail = ({ product }: { product: Product }) => {
    const [url, setUrl] = useState<string | null>(null)
    useEffect(() => {
      let alive = true
      if (!product.imagePath) { setUrl(null); return }
      window.pos.getProductImage(product.id).then((u) => { if (alive) setUrl(u ?? null) }).catch(() => {})
      return () => { alive = false }
    }, [product.id, product.imagePath])
    return (
      <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-md bg-slate-800 text-slate-400">
        {url ? (
          <img src={url} alt={product.name} className="h-full w-full object-cover" />
        ) : (
          <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 7L6 4H9C9 4.39397 9.0776 4.78407 9.22836 5.14805C9.37913 5.51203 9.6001 5.84274 9.87868 6.12132C10.1573 6.3999 10.488 6.62087 10.8519 6.77164C11.2159 6.9224 11.606 7 12 7C12.394 7 12.7841 6.9224 13.1481 6.77164C13.512 6.62087 13.8427 6.3999 14.1213 6.12132C14.3999 5.84274 14.6209 5.51203 14.7716 5.14805C14.9224 4.78407 15 4.39397 15 4H18L21 7L20.5 12L18 10.5V20H6V10.5L3.5 12L3 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="square" strokeLinejoin="round" />
          </svg>
        )}
      </span>
    )
  }

  // ----- Product modal -----
  const openAdd = () => {
    setEditing(null)
    setProductDraft({ ...EMPTY_DRAFT, categoryId: categories[0]?.id ?? '' })
    setProductImagePreview(null)
    setProductModalOpen(true)
  }

  const openEdit = (p: Product) => {
    setEditing(p)
    setProductDraft({
      name: p.name,
      categoryId: p.categoryId,
      unitType: p.unitType,
      defaultPrice: String(p.defaultPrice),
      defaultDiscount: String(p.defaultDiscount ?? 0),
      barcode: p.barcode ?? '',
      sku: p.sku ?? '',
      lowStockThreshold: String(p.lowStockThreshold),
      initialStock: '0',
      imageSrc: null
    })
    void window.pos.getProductImage(p.id).then((url) => setProductImagePreview(url ?? null))
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
    const discount = parseFloat(productDraft.defaultDiscount)

    // Validate barcode for duplicates before persisting (only when the user
    // actually typed one — empty means "auto-generate", handled in main).
    const barcodeValue = productDraft.barcode.trim()
    if (barcodeValue) {
      const taken = await window.pos.isBarcodeTaken(barcodeValue, editing?.id)
      if (taken) {
        toasts.error(t('inventory.duplicateBarcode'))
        return
      }
    }

      try {
        if (editing) {
          await window.pos.updateProduct(editing.id, {
            name,
            categoryId: productDraft.categoryId,
            unitType: productDraft.unitType,
            defaultPrice: price,
            defaultDiscount: isNaN(discount) ? 0 : Math.max(0, Math.min(100, discount)),
            barcode: productDraft.barcode.trim() || null,
            sku: productDraft.sku.trim() || null,
            lowStockThreshold: isNaN(threshold) ? 5 : threshold,
            imageSrc: productDraft.imageSrc
          })
          toasts.success(t('inventory.productUpdated'))
        } else {
          await window.pos.createProduct({
            name,
            categoryId: productDraft.categoryId,
            unitType: productDraft.unitType,
            defaultPrice: price,
            defaultDiscount: isNaN(discount) ? 0 : Math.max(0, Math.min(100, discount)),
            barcode: productDraft.barcode.trim() || undefined,
            sku: productDraft.sku.trim() || undefined,
            lowStockThreshold: isNaN(threshold) ? 5 : threshold,
            initialStock: isNaN(initial) ? 0 : initial,
            imageSrc: productDraft.imageSrc
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
      const result = await window.pos.deleteProduct(p.id)
      if (result === 'deactivated') {
        toasts.success(t('inventory.productDeactivated'))
      } else {
        toasts.success(t('inventory.productDeleted'))
      }
      await refresh()
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    }
  }

  // Reactivate a previously deactivated (soft-deleted) product.
  const reactivateProduct = async (p: Product) => {
    try {
      await window.pos.setProductActive(p.id, true)
      toasts.success(t('inventory.productReactivated'))
      await refresh()
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    }
  }

  // Print a barcode label for a product on the configured barcode printer.
  const printLabel = async (p: Product, barcodeImage?: string) => {
    if (!p.barcode) return
    setPrintingId(p.id)
    try {
      // Render the CODE128 barcode here (same path as the on-screen preview,
      // which is proven to work) and hand the PNG to the main process so it
      // doesn't have to re-generate it.
      const img = barcodeImage ?? renderBarcodeDataUrl(p.barcode) ?? undefined
      const res = await window.pos.printBarcodeLabel({
        name: p.name,
        barcode: p.barcode,
        price: p.defaultPrice,
        barcodeImage: img
      })
      if (res?.ok) {
        toasts.success(t('inventory.labelPrinted'))
      } else {
        toasts.error(res?.error ?? t('inventory.labelPrintFailed'))
      }
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    } finally {
      setPrintingId(null)
    }
  }

  // Generate a unique barcode via the main process and show it in the preview.
  const generateBarcodeForDraft = async () => {
    try {
      const code = await window.pos.generateBarcode()
      if (code) {
        setProductDraft({ ...productDraft, barcode: code })
      }
    } catch {
      toasts.error(t('inventory.barcodeGenerateFailed'))
    }
  }

  // ----- Category management -----
  const openCatModal = () => {
    setEditingCat(null)
    setCatName('')
    setDeleteCat(null)
    setReassignTo('')
    setCatModalOpen(true)
  }

  const openEditCat = (c: Category) => {
    setEditingCat(c)
    setCatName(c.name)
  }

  const saveCategory = async () => {
    const name = catName.trim()
    if (!name) {
      toasts.error('Enter a category name')
      return
    }
    try {
      if (editingCat) {
        const idx = categories.findIndex((c) => c.id === editingCat.id)
        await window.pos.updateCategory(editingCat.id, name, idx)
        toasts.success(t('inventory.categoryUpdated'))
      } else {
        const nextOrder = categories.length
        await window.pos.createCategory(name, nextOrder)
        toasts.success(t('inventory.categoryAdded'))
      }
      setEditingCat(null)
      setCatName('')
      await refresh()
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    }
  }

  const moveCategory = async (c: Category, dir: -1 | 1) => {
    const sorted = [...categories].sort((a, b) => a.sortOrder - b.sortOrder)
    const i = sorted.findIndex((x) => x.id === c.id)
    const j = i + dir
    if (j < 0 || j >= sorted.length) return

    // Capture current row positions (FLIP: First).
    const first: Record<string, number> = {}
    for (const cat of sorted) {
      const el = rowRefs.current[cat.id]
      if (el) first[cat.id] = el.getBoundingClientRect().top
    }
    flipRects.current = first
    setMovingId(c.id)

    ;[sorted[i], sorted[j]] = [sorted[j], sorted[i]]
    try {
      await Promise.all(
        sorted.map((cat, idx) => window.pos.updateCategory(cat.id, cat.name, idx))
      )
      await refresh()
      // Tell the layout effect to animate from the captured positions (Last + Invert + Play).
      flipNonce.current += 1
    } catch (err) {
      toasts.error(err instanceof Error ? err.message : String(err))
    } finally {
      setTimeout(() => setMovingId(null), 450)
    }
  }

  const confirmDeleteCategory = async () => {
    if (!deleteCat) return
    if (!reassignTo) {
      toasts.error(t('inventory.reassignTo'))
      return
    }
    try {
      await window.pos.deleteCategory(deleteCat.id, reassignTo)
      toasts.success(t('inventory.categoryDeleted'))
      setDeleteCat(null)
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
          <CardAction className='space-x-2'>
            <Button variant="outline" className="border-slate-700 text-slate-300 hover:bg-slate-800" onClick={openCatModal}>
              <Package className="w-4 h-4" /> {t('inventory.manageCategories')}
            </Button>
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
                    const inactive = p.active === false
                    return (
                      <TableRow key={p.id} className={`border-slate-800 ${inactive ? 'opacity-60' : ''}`}>
                        <TableCell className="font-medium">
                          <div className="flex items-center gap-2">
                            <ProductThumbnail product={p} />
                            {p.name}
                            {inactive && (
                              <Badge variant="outline" className="bg-slate-700/40 text-slate-400 border-slate-600 text-[10px]">
                                {t('inventory.inactive')}
                              </Badge>
                            )}
                          </div>
                        </TableCell>
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
                            {inactive ? (
                              <Button size="sm" variant="outline" className="h-8 border-emerald-700 text-emerald-300" onClick={() => reactivateProduct(p)} title={t('inventory.reactivate')}>
                                <RotateCw className="w-3.5 h-3.5" /> {t('inventory.reactivate')}
                              </Button>
                            ) : (
                              <>
                                <Button size="sm" variant="outline" className="h-8 border-slate-700 text-slate-300" onClick={() => openRestock(p)}>
                                  <PackagePlus className="w-3.5 h-3.5" /> {t('inventory.restock')}
                                </Button>
                                <Button size="sm" variant="outline" className="h-8 border-slate-700 text-teal-300" disabled={!p.barcode || printingId === p.id} onClick={() => printLabel(p)} title={t('inventory.printLabel')}>
                                  {printingId === p.id ? <RotateCw className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-slate-300" onClick={() => openEdit(p)} title={t('inventory.edit')}>
                                  <Pencil className="w-3.5 h-3.5" />
                                </Button>
                                <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-400" onClick={() => deleteProduct(p)} title={t('inventory.delete')}>
                                  <Trash2 className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            )}
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
              <Label className="text-slate-400">{t('inventory.image')}</Label>
              <div className="flex items-center gap-3">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-800 bg-slate-950 text-lg font-semibold text-slate-300">
                  {productImagePreview ? (
                    <img src={productImagePreview} alt="preview" className="h-full w-full object-cover" />
                  ) : (
                    (productDraft.name.trim()[0] ?? '?').toUpperCase()
                  )}
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="border-slate-700 text-teal-300"
                    onClick={async () => {
                      const src = await window.pos.selectProductImage()
                      if (src) {
                        setProductDraft({ ...productDraft, imageSrc: src })
                        const dataUrl = await window.pos.readImageDataUrl(src)
                        setProductImagePreview(dataUrl ?? null)
                      }
                    }}
                  >
                    {t('inventory.chooseImage')}
                  </Button>
                  {productImagePreview && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-red-400"
                      onClick={() => { setProductDraft({ ...productDraft, imageSrc: '' }); setProductImagePreview(null) }}
                    >
                      {t('inventory.removeImage')}
                    </Button>
                  )}
                  <p className="text-[11px] text-slate-600">{t('inventory.imageHint')}</p>
                </div>
              </div>
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
              <Label className="text-slate-400">{t('inventory.defaultDiscount')}</Label>
              <Input
                className="bg-slate-950 border-slate-700"
                type="number"
                step="1"
                min="0"
                max="100"
                value={productDraft.defaultDiscount}
                onChange={(e) => setProductDraft({ ...productDraft, defaultDiscount: e.target.value })}
              />
              <p className="text-[11px] text-slate-600">{t('inventory.defaultDiscountHint')}</p>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-slate-400">{t('inventory.barcode')}</Label>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-teal-400"
                  onClick={generateBarcodeForDraft}
                  title={t('inventory.generateBarcode')}
                >
                  <Barcode className="w-3.5 h-3.5 mr-1" /> {t('inventory.generateBarcode')}
                </Button>
              </div>
              <Input
                className="bg-slate-950 border-slate-700"
                value={productDraft.barcode}
                onChange={(e) => setProductDraft({ ...productDraft, barcode: e.target.value })}
                placeholder={t('inventory.barcodeAutoHint')}
              />
              {barcodePreview ? (
                <div className="mt-2 flex items-center gap-3 rounded-md border border-slate-800 bg-white p-2">
                  <img src={barcodePreview} alt={productDraft.barcode} className="h-14 w-auto" />
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-slate-700 text-teal-300"
                    disabled={!productDraft.barcode.trim() || printingId === 'modal'}
                    onClick={() => printLabel({ name: productDraft.name, barcode: productDraft.barcode.trim(), defaultPrice: parseFloat(productDraft.defaultPrice) || 0 } as Product, barcodePreview ?? undefined)}
                  >
                    <Printer className="w-3.5 h-3.5" /> {t('inventory.printLabel')}
                  </Button>
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-slate-600">{t('inventory.barcodePreviewHint')}</p>
              )}
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

      {/* Category management dialog */}
      <Dialog open={catModalOpen} onOpenChange={setCatModalOpen}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="w-5 h-5 text-teal-400" />
              {t('inventory.manageCategories')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 max-h-[70vh] overflow-y-auto pos-scroll">
            {/* Add / edit row */}
            <div className="flex items-end gap-2">
              <div className="flex-1 space-y-1.5">
                <Label className="text-slate-400">{t('inventory.categoryName')}</Label>
                <Input
                  className="bg-slate-950 border-slate-700"
                  value={catName}
                  placeholder={t('inventory.categoryName')}
                  onChange={(e) => setCatName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void saveCategory() }}
                  autoFocus
                />
              </div>
              <Button className="bg-teal-500 text-teal-950 hover:bg-teal-400" onClick={saveCategory}>
                {editingCat ? t('common.save') : t('inventory.addCategory')}
              </Button>
              {editingCat && (
                <Button variant="ghost" className="text-slate-400" onClick={() => { setEditingCat(null); setCatName('') }}>
                  {t('common.cancel')}
                </Button>
              )}
            </div>

            <div className="border-t border-slate-800 pt-2 space-y-1.5 mx-3">
              {categories.length === 0 ? (
                <p className="text-xs text-slate-600 py-2 text-center">{t('inventory.noProducts')}</p>
              ) : (
                [...categories]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((c, i, arr) => (
                    <div
                      key={c.id}
                      ref={(el) => { rowRefs.current[c.id] = el }}
                      className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 ${
                        movingId === c.id
                          ? 'border-teal-500/60 bg-teal-500/10'
                          : 'border-slate-800 bg-slate-950/60'
                      }`}
                    >
                      <span className="font-medium text-sm flex-1">{c.name}</span>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400" disabled={i === 0} onClick={() => moveCategory(c, -1)} title={t('inventory.moveUp')}>
                          <ChevronUp className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-slate-400" disabled={i === arr.length - 1} onClick={() => moveCategory(c, 1)} title={t('inventory.moveDown')}>
                          <ChevronDown className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-teal-400" onClick={() => openEditCat(c)}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 px-2 text-red-400" onClick={() => { setDeleteCat(c); setReassignTo(categories.find((x) => x.id !== c.id)?.id ?? '') }}>
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setCatModalOpen(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete category dialog (with reassign) */}
      <Dialog open={!!deleteCat} onOpenChange={(o) => { if (!o) setDeleteCat(null) }}>
        <DialogContent className="bg-slate-900 border-slate-800">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="w-5 h-5 text-red-400" />
              {t('inventory.deleteCategoryTitle')}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <p className="text-sm text-slate-300">
              {t('inventory.confirmDeleteCategory', { name: deleteCat?.name ?? '' })}
            </p>
            <div className="space-y-1.5">
              <Label className="text-slate-400">{t('inventory.reassignTo')}</Label>
              <Select value={reassignTo} onValueChange={setReassignTo}>
                <SelectTrigger className="bg-slate-950 border-slate-700">
                  <SelectValue placeholder={t('inventory.reassignTo')} />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                  {categories.filter((c) => c.id !== deleteCat?.id).map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setDeleteCat(null)}>
              {t('common.cancel')}
            </Button>
            <Button className="bg-red-500 text-white hover:bg-red-400" onClick={confirmDeleteCategory}>
              {t('common.delete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
