# Shifts Screen Improvements

## Context
`ShiftsScreen.tsx` manages till open/close and a shift history table. Review surfaced gaps versus the rest of the app:
- It ignores `tillReconciliationEnabled` (which `useBilling.ts` uses to gate selling).
- History (`getShifts()`, hard cap 50) shows no till/branch, no per-shift cash/digital/refund breakdown, and no filtering/pagination.
- Closed shifts hide the variance drivers (cash sales, digital, refunds, change-out).

Confirmed decisions:
- **Hide open/close controls when `tillReconciliationEnabled !== 'true'`, keep History.**
- **Add a shift detail drawer** (closed shifts) with cash/digital split, refunds, sales count.
- **Add date-range + till filter** to history and remove the 50-row cap (load-more).

## Data model notes
- `Shift` (`src/shared/types.ts:97`): id, tillId, openingCash, closingCash, expectedCash, openedAt, closedAt.
- Sales carry `shift_id`, `till_id`, `payment_method` ('cash'|'digital'), `total`, `actual_paid_price`.
- Returns carry `shift_id`, `payment_method`, `refund_amount`.
- Existing helpers: `getShifts(limit=50)` (`db.ts:1075`), `closeShift` (`db.ts:1052`), `getOpenShift` (`db.ts:1015`).

## Tasks

### 1. Shift summary helper (main + IPC)
Add `getShiftSummary(shiftId: string)` to `src/main/db.ts` returning:
```
{ cashSales, digitalSales, cashRefunds, salesCount, expectedCash, closingCash, variance }
```
- cashSales = SUM(total) where payment_method='cash' and shift_id=?
- digitalSales = SUM(total) where payment_method='digital'
- cashRefunds = SUM(refund_amount) where payment_method='cash'
- salesCount = COUNT(*) from sales for shift
- expectedCash/closingCash/variance from the shift row (reuse closeShift math, read-only).
- Respect legacy NULL `shop_id` (see project fact: treat NULL as current shop). Use same `${shopFilterPlain}` pattern as dashboard (`db.ts:1206`).
- Register IPC handler `GET_SHIFT_SUMMARY` (`'pos:get-shift-summary'`) in `src/main/ipc.ts`, expose in `src/preload/index.ts`, add to `IPC_CHANNELS` in `src/shared/types.ts`, and to `window.pos` types.

### 2. History query with filters + pagination (main + IPC)
Replace `getShifts(limit=50)` usage with a new `getShifts({ tillId?, from?, to?, limit?, offset? })`.
- Filter by `till_id` when provided; date range on `opened_at` (ISO compare, >= from, <= to).
- Order by `opened_at DESC`, `LIMIT ? OFFSET ?`.
- Do NOT hard-cap at 50; caller passes limit/offset for load-more.
- Keep legacy NULL shop_id behavior.
- Add `GET_SHIFTS` overload or new handler `GET_SHIFTS_FILTERED`. Prefer extending existing `GET_SHIFTS` to accept an options arg (default: no filter, limit 50, offset 0) for backward compat with any caller.

### 3. ShiftsScreen gating + filters (renderer)
In `src/renderer/src/components/ShiftsScreen.tsx`:
- Read `settings.tillReconciliationEnabled`. When not `'true'`, render only the History card (no open/close card, no Select).
- Add `tillId` filter Select (All + tills) and date-range (from/to) inputs above the history table.
- Track `from`, `to`, `filterTill`, `offset` in state; pass to `getShifts(...)`. Add "Load more" button when returned rows === limit.
- History table: add **Till** column (map `tillId` → `till.name` via loaded `tills`).

### 4. Shift detail drawer (renderer)
- Make each history `<TableRow>` clickable; clicking a closed shift opens a right-side `Sheet`/`Dialog` (reuse existing `ui/dialog` or add `ui/sheet`).
- Drawer calls `window.pos.getShiftSummary(shiftId)` and shows: opening, expected, counted, variance, cash sales, digital sales, cash refunds, sales count, opened/closed timestamps, till name.
- Open shifts: row click shows a lightweight note ("shift still open") or nothing; drawer only for closed.

### 5. Close confirmation (optional polish)
In `ShiftModal` close mode, show expected vs counted and projected variance before confirm (expectedCash already passed; just surface it more prominently — minimal change).

## Affected files
- `src/shared/types.ts` — `IPC_CHANNELS`, `window.pos` shift types.
- `src/main/db.ts` — `getShiftSummary`, `getShifts` filter/pagination.
- `src/main/ipc.ts` — handlers.
- `src/preload/index.ts` — bindings.
- `src/renderer/src/components/ShiftsScreen.tsx` — gating, filters, till column, drawer.
- `src/renderer/src/components/ShiftModal.tsx` — close confirmation polish (optional).

## Risks
- NULL `shop_id` legacy sales must be included (project fact) — reuse existing shop filter helper.
- `getShifts` signature change must stay backward compatible with any other caller (search confirm only `ShiftsScreen` + `useBilling` use it; `useBilling` uses `getOpenShift`, not `getShifts`).
- Date filtering on `opened_at` string compare is safe since ISO-8601.

## Validation
- `npx tsc --noEmit -p tsconfig.web.json --composite false` (renderer) and main typecheck pass.
- Manual: toggle `tillReconciliationEnabled` in settings → open/close card hides/shows. Open a shift, make cash + digital sales + a refund, close it, open detail drawer → splits + variance correct. Apply till/date filters and load-more.
