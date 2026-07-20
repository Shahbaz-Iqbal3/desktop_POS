import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, History, Wallet, CircleDot, Filter, X } from 'lucide-react'
import type { useToasts } from '../hooks/useToasts'
import type { Till, ShiftSummary } from '@shared/types'
import { ShiftModal } from './ShiftModal'
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction
} from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription
} from '@/components/ui/sheet'

type Toasts = ReturnType<typeof useToasts>
type Shift = {
  id: string
  tillId: string
  openingCash: number
  closingCash: number | null
  expectedCash: number | null
  openedAt: string
  closedAt: string | null
}

const PAGE_SIZE = 25

export function ShiftsScreen({
  toasts,
  onShiftChanged
}: {
  toasts: Toasts
  onShiftChanged: () => void | Promise<void>
}) {
  const { t } = useTranslation()
  const [shifts, setShifts] = useState<Shift[]>([])
  const [openShift, setOpenShift] = useState<Shift | null>(null)
  const [modalMode, setModalMode] = useState<'open' | 'close' | null>(null)
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [tills, setTills] = useState<Till[]>([])

  const [from, setFrom] = useState<string>('')
  const [to, setTo] = useState<string>('')
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(false)

  const [detail, setDetail] = useState<ShiftSummary | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [closeExpected, setCloseExpected] = useState<number | undefined>(undefined)

  const currentTill = settings.currentTillId || 'till-1'

  const tillName = (id: string) => tills.find((tl) => tl.id === id)?.name ?? id

  const refresh = async (append = false) => {
    const s = await window.pos.getSettings()
    setSettings(s)
    const query = {
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to + 'T23:59:59.999Z').toISOString() : undefined,
      limit: PAGE_SIZE + 1,
      offset: append ? offset : 0
    }
    const [list, open, tl] = await Promise.all([
      window.pos.getShifts(query),
      window.pos.getOpenShift(currentTill),
      window.pos.getTills()
    ])
    const sliced = list.slice(0, PAGE_SIZE)
    setHasMore(list.length > PAGE_SIZE)
    if (append) {
      setShifts((prev) => [...prev, ...sliced])
      setOffset((o) => o + PAGE_SIZE)
    } else {
      setShifts(sliced)
      setOffset(0)
    }
    setOpenShift(open)
    setTills(tl)
  }

  useEffect(() => {
    void refresh()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const applyFilters = () => {
    setOffset(0)
    void refresh()
  }

  const clearFilters = () => {
    setFrom('')
    setTo('')
    setOffset(0)
    void refresh()
  }

  const openDetail = async (shift: Shift) => {
    if (shift.closedAt === null) {
      setDetail({
        shiftId: shift.id,
        tillId: shift.tillId,
        openingCash: shift.openingCash,
        closingCash: shift.closingCash,
        expectedCash: shift.expectedCash,
        variance: null,
        cashSales: 0,
        digitalSales: 0,
        cashRefunds: 0,
        salesCount: 0,
        openedAt: shift.openedAt,
        closedAt: null
      })
      return
    }
    setDetailLoading(true)
    try {
      const summary = await window.pos.getShiftSummary(shift.id)
      setDetail(summary)
    } catch {
      setDetail(null)
    } finally {
      setDetailLoading(false)
    }
  }

  const money = (n: number) => `Rs ${n.toFixed(2)}`

  return (
    <div className="h-full overflow-y-auto pos-scroll p-4 space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Clock className="w-4 h-4 text-teal-400" />
            {t('app.shifts')}
          </CardTitle>
          <CardDescription className="text-slate-500">{t('shifts.activeTill')}</CardDescription>
        </CardHeader>
        <CardContent>
          {openShift ? (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-semibold text-slate-200">
                    <Badge className="bg-emerald-500/15 text-emerald-300 border-emerald-500/30 gap-1">
                      <CircleDot className="w-3 h-3" /> {t('shift.open')}
                    </Badge>
                  </div>
                  <div className="text-sm text-slate-300">
                    {new Date(openShift.openedAt).toLocaleString()}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500">
                    <Wallet className="w-3.5 h-3.5" />
                    {t('shift.openingCash')}: Rs {openShift.openingCash.toFixed(2)}
                  </div>
                </div>
                <Button
                  className="bg-teal-500 text-teal-950 hover:bg-teal-400 font-semibold shrink-0"
                  onClick={async () => {
                    if (openShift) {
                      const summary = await window.pos.getShiftSummary(openShift.id)
                      setCloseExpected(summary?.expectedCash ?? undefined)
                    }
                    setModalMode('close')
                  }}
                >
                  {t('shift.close')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-slate-800 bg-slate-950/60 p-4">
                <p className="text-sm text-slate-500">{t('shift.noOpen')}</p>
                <Button
                  className="bg-teal-500 text-teal-950 hover:bg-teal-400 font-semibold shrink-0"
                  onClick={() => setModalMode('open')}
                >
                  {t('shift.open')}
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-900/60 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-slate-100">
              <History className="w-4 h-4 text-teal-400" />
              History
            </CardTitle>
            <CardAction className="flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-slate-500">{t('shift.from')}</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-36 bg-slate-950 border-slate-700 text-sm"
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-[10px] text-slate-500">{t('shift.to')}</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-36 bg-slate-950 border-slate-700 text-sm"
                />
              </div>
              <Button variant="outline" className="border-slate-700" onClick={applyFilters}>
                <Filter className="w-3.5 h-3.5" /> {t('shift.filter')}
              </Button>
              {(from || to) && (
                <Button variant="ghost" className="text-slate-400" onClick={clearFilters}>
                  <X className="w-3.5 h-3.5" /> {t('shift.clearFilters')}
                </Button>
              )}
            </CardAction>
          </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <p className="text-sm text-slate-500">No shifts recorded yet.</p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-500">{t('shift.till')}</TableHead>
                    <TableHead className="text-slate-500">Opened</TableHead>
                    <TableHead className="text-slate-500">Closed</TableHead>
                    <TableHead className="text-slate-500">Opening</TableHead>
                    <TableHead className="text-slate-500">Expected</TableHead>
                    <TableHead className="text-slate-500">Counted</TableHead>
                    <TableHead className="text-slate-500">Variance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shifts.map((s) => {
                    const variance = s.closingCash !== null && s.expectedCash !== null
                      ? s.closingCash - s.expectedCash
                      : null
                    return (
                      <TableRow
                        key={s.id}
                        className="border-slate-800 cursor-pointer hover:bg-slate-800/40"
                        onClick={() => void openDetail(s)}
                      >
                        <TableCell className="text-slate-300">{tillName(s.tillId)}</TableCell>
                        <TableCell className="text-slate-300">{new Date(s.openedAt).toLocaleString()}</TableCell>
                        <TableCell className="text-slate-300">
                          {s.closedAt ? new Date(s.closedAt).toLocaleString() : '—'}
                        </TableCell>
                        <TableCell className="text-slate-300">Rs {s.openingCash.toFixed(2)}</TableCell>
                        <TableCell className="text-slate-300">
                          {s.expectedCash !== null ? `Rs ${s.expectedCash.toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell className="text-slate-300">
                          {s.closingCash !== null ? `Rs ${s.closingCash.toFixed(2)}` : '—'}
                        </TableCell>
                        <TableCell
                          className={
                            variance === null
                              ? 'text-slate-300'
                              : variance < 0
                                ? 'text-red-400 font-medium'
                                : 'text-emerald-400 font-medium'
                          }
                        >
                          {variance === null ? '—' : `Rs ${variance.toFixed(2)}`}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              {hasMore && (
                <div className="pt-3 text-center">
                  <Button variant="outline" className="border-slate-700" onClick={() => void refresh(true)}>
                    {t('shift.loadMore')}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {modalMode && (
        <ShiftModal
          mode={modalMode}
          tillId={currentTill}
          shiftId={openShift?.id}
          openingCash={openShift?.openingCash}
          expectedCash={modalMode === 'close' ? closeExpected : openShift?.expectedCash ?? undefined}
          onClose={() => {
            setCloseExpected(undefined)
            setModalMode(null)
          }}
          onDone={async () => {
            setCloseExpected(undefined)
            await refresh()
            await onShiftChanged()
            setModalMode(null)
          }}
          toasts={toasts}
        />
      )}

      <Sheet open={detail !== null} onOpenChange={(o) => { if (!o) setDetail(null) }}>
        <SheetContent className="bg-slate-900 border-slate-800 text-slate-200">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-slate-100">
                  <Clock className="w-4 h-4 text-teal-400" />
                  {t('shift.details')}
                </SheetTitle>
                <SheetDescription className="text-slate-500">
                  {tillName(detail.tillId)} · {new Date(detail.openedAt).toLocaleString()}
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto px-4 space-y-4 text-sm">
                {detail.closedAt === null ? (
                  <p className="text-slate-400">{t('shift.stillOpen')}</p>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <Detail label={t('shift.openingCash')} value={money(detail.openingCash)} />
                      <Detail label={t('shift.expectedCash')} value={detail.expectedCash !== null ? money(detail.expectedCash) : '—'} />
                      <Detail label={t('shift.countedCash')} value={detail.closingCash !== null ? money(detail.closingCash) : '—'} />
                      <Detail
                        label={t('shift.variance')}
                        value={detail.variance !== null ? money(detail.variance) : '—'}
                        valueClass={
                          detail.variance === null
                            ? ''
                            : detail.variance < 0
                              ? 'text-red-400'
                              : 'text-emerald-400'
                        }
                      />
                    </div>
                    <div className="h-px bg-slate-800" />
                    <div className="grid grid-cols-2 gap-3">
                      <Detail label={t('shift.cashSales')} value={money(detail.cashSales)} />
                      <Detail label={t('shift.digitalSales')} value={money(detail.digitalSales)} />
                      <Detail label={t('shift.cashRefunds')} value={money(detail.cashRefunds)} />
                      <Detail label={t('shift.salesCount')} value={String(detail.salesCount)} />
                    </div>
                  </>
                )}
              </div>
            </>
          )}
          {detailLoading && <p className="px-4 text-slate-500">…</p>}
        </SheetContent>
      </Sheet>
    </div>
  )
}

function Detail({ label, value, valueClass = '' }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 space-y-1">
      <div className="text-xs text-slate-500">{label}</div>
      <div className={`font-mono font-semibold text-slate-100 ${valueClass}`}>{value}</div>
    </div>
  )
}
