import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Clock, History, Store, Wallet, CircleDot } from 'lucide-react'
import type { useToasts } from '../hooks/useToasts'
import type { Till } from '@shared/types'
import { ShiftModal } from './ShiftModal'
import {
  Card, CardHeader, CardTitle, CardDescription, CardContent, CardAction
} from '@/components/ui/card'
import {
  Table, TableHeader, TableBody, TableRow, TableHead, TableCell
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'

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

  const currentTill = settings.currentTillId || 'till-1'

  const refresh = async () => {
    const s = await window.pos.getSettings()
    setSettings(s)
    const [list, open, tl] = await Promise.all([
      window.pos.getShifts(),
      window.pos.getOpenShift(currentTill),
      window.pos.getTills()
    ])
    setShifts(list)
    setOpenShift(open)
    setTills(tl)
  }

  useEffect(() => {
    void refresh()
  }, [])

  return (
    <div className="p-4 space-y-4">
      <Card className="bg-slate-900/60 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-slate-100">
            <Clock className="w-4 h-4 text-teal-400" />
            {t('app.shifts')}
          </CardTitle>
          <CardDescription className="text-slate-500">{t('shifts.activeTill')}</CardDescription>
          <CardAction>
            <Select
              value={currentTill}
              onValueChange={(v) => {
                window.pos.setSetting('currentTillId', v)
                void refresh()
              }}
            >
              <SelectTrigger className="w-44 bg-slate-950 border-slate-700 text-sm">
                <Store className="w-3.5 h-3.5 text-slate-500" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-900 border-slate-800">
                {tills.map((tl) => (
                  <SelectItem key={tl.id} value={tl.id} className="text-slate-200 focus:bg-slate-800">
                    {tl.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardAction>
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
                onClick={() => setModalMode('close')}
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
        </CardHeader>
        <CardContent>
          {shifts.length === 0 ? (
            <p className="text-sm text-slate-500">No shifts recorded yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800 hover:bg-transparent">
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
                    <TableRow key={s.id} className="border-slate-800">
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
          )}
        </CardContent>
      </Card>

      {modalMode && (
        <ShiftModal
          mode={modalMode}
          tillId={currentTill}
          shiftId={openShift?.id}
          openingCash={openShift?.openingCash}
          expectedCash={openShift?.expectedCash ?? undefined}
          onClose={() => setModalMode(null)}
          onDone={async () => {
            await refresh()
            await onShiftChanged()
            setModalMode(null)
          }}
          toasts={toasts}
        />
      )}
    </div>
  )
}
