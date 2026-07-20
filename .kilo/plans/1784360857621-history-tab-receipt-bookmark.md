# Plan: Rename "Returns" tab to "History" + add View Receipt & Bookmark a Sale

## Context

The POS app currently has a `returns` tab (F3) containing two sub-views: "Refund a Sale"
and "Refund History". The user wants this tab renamed to **History** and turned into a
unified sales-history hub that also exposes two commonly-missing features:

1. **View Receipt** for any past sale (on-screen `PrintPreviewDialog` + Print/Reprint).
2. **Bookmark / star a sale** so important sales can be flagged and filtered.

Scope confirmed with user:
- History tab = Sales list (with View Receipt / Bookmark / Refund) + Refund a Sale + Refund History.
- "View Receipt" = on-screen thermal preview (`PrintPreviewDialog`) with a Print button.
- "Bookmark" = a per-sale star/flag stored as a new boolean column.

### Verified facts (from code, not assumptions)
- `Sale` type (`src/shared/types.ts:42`) has **no** `bookmarked` field → must add one.
- `initDatabase()` (`src/main/db.ts:48`) calls `migrateProductActive()` at line 59. A new
  sibling `migrateSalesBookmarked()` should be called there (same `db.pragma('table_info(sales)')` pattern).
- `getSales`/`getSale`/`getLastSale` use `SELECT *` + `mapRow<Sale>`, so a new `bookmarked`
  column is auto-mapped to camelCase `bookmarked`. No query changes needed.
- **`getSale` and `getReceiptLogo` are already exposed in the preload** → View Receipt needs
  **NO new IPC**. Only the bookmark toggle needs a new IPC channel.
- `PrintPreviewDialog` (`src/renderer/src/components/PrintPreviewDialog.tsx`) takes a
  `settings: ReceiptSettings` (shopName, receiptShowLogo, receiptTagline, shopAddress,
  shopPhone, receiptFooter) + `logo` + `children`. The screen's `settings` is
  `Record<string,string>` (same shape BillingScreen passes), structurally compatible.
- The `returns` tab id is only referenced in `App.tsx` (lines 28, 33, 107, 293) + i18n keys
  + `ReturnsScreen` `returns.*` keys. The `db.ts`/`sync.ts` `'returns'` strings refer to the
  `SaleReturn` table, NOT this tab — do not touch them.

## Decisions
- **Keep the internal tab id `returns`** (only relabel/icon to "History"). Minimizes blast
  radius; the `SaleReturn`-table `returns` identifiers remain untouched. Render switch and
  F-key map stay `returns`.
- New default landing sub-view = the **Sales** list (was the refund flow).

## Implementation Steps

### 1. Relabel tab to "History" (keep internal id `returns`)
- `src/renderer/src/App.tsx`:
  - Add `History` to lucide-react imports (line 5-9).
  - `NAV` entry (line 33): change `labelKey: 'app.returns'` → `'app.history'` and
    `icon: RotateCcw` → `History`. Keep `id: 'returns'`, `key: 'F3'`.
  - Render switch (line 293) and F-key map (line 107) stay unchanged.
- i18n `src/renderer/src/i18n/en.json` + `ur.json`:
  - Replace `"app.returns": "Returns"` / `"واپسیاں"` with `"app.history": "History"` /
    `"تاریخ"`. (Keep `returns.*` keys used by the sub-views — see step 4.)
  - Add `history.*` keys (see step 4) without removing the still-used `returns.*` ones.

### 2. Add `bookmarked` column to `sales`
- `src/main/db.ts`: add `migrateSalesBookmarked()` and call it in `initDatabase()` right
  after `migrateProductActive()` (line 59):
  ```ts
  function migrateSalesBookmarked(): void {
    try {
      const pragma = db.pragma('table_info(sales)') as Array<{ name: string }>
      if (!pragma.some(c => c.name === 'bookmarked')) {
        db.exec('ALTER TABLE sales ADD COLUMN bookmarked INTEGER NOT NULL DEFAULT 0')
      }
    } catch (err) {
      console.warn('[db] Migration (sales.bookmarked) failed:', err)
    }
  }
  ```
- `src/shared/types.ts` `Sale` type (line 42): add `bookmarked: boolean` after `synced`.
  Because `getSales`/`getSale` use `SELECT *` + `mapRow<Sale>`, the new column is mapped
  automatically — no query edits required.

### 3. DB + IPC for toggling bookmark (only NEW IPC in this plan)
- `src/main/db.ts`: add
  ```ts
  export function setSaleBookmarked(id: string, bookmarked: boolean): void {
    db.prepare('UPDATE sales SET bookmarked = ? WHERE id = ?').run(bookmarked ? 1 : 0, id)
  }
  ```
- `src/shared/types.ts` `IPC_CHANNELS`: add `SET_SALE_BOOKMARKED: 'pos:set-sale-bookmarked'`.
- `src/main/ipc.ts`: import `setSaleBookmarked` and register
  ```ts
  ipcMain.handle('pos:set-sale-bookmarked', (_e, id: string, bookmarked: boolean) => setSaleBookmarked(id, bookmarked))
  ```
- `src/preload/index.ts`: add
  ```ts
  setSaleBookmarked: (id: string, bookmarked: boolean) => ipcRenderer.invoke(IPC_CHANNELS.SET_SALE_BOOKMARKED, id, bookmarked),
  ```

### 4. Restructure the History screen (`ReturnsScreen.tsx`)
Introduce three Tabs (value keys) inside the existing `Tabs`:
- `sales` — NEW default landing: list of all sales with **View Receipt**, **Bookmark star**,
  and (optionally) **Refund** actions.
- `refund` — the existing "Refund a Sale" flow (currently the `sales` sub-view).
- `refunds-history` — the existing "Refund History" flow (currently the `history` sub-view).

**Sales tab implementation:**
- Default `view` state → `'sales'`.
- Reuse `sales` already loaded by `refresh()` (`getSales(200)`).
- Add lucide imports: `Star`, `StarOff`, `Eye` (View Receipt icon).
- Table columns: Sale #, Date, Total, Payment, Bookmarked (star toggle), Actions.
- **Star toggle** per row:
  `onClick={async () => { await window.pos.setSaleBookmarked(s.id, !s.bookmarked); await refresh() }}`
  Render `<Star>` filled (e.g. `fill-current text-amber-400`) when `!!s.bookmarked`,
  else `<StarOff>` muted. Use `!!` because SQLite returns `0/1`.
- **"Bookmarked only" filter**: a toggle button/checkbox above the list that filters
  `sales` to `!!s.bookmarked`. Combine with the existing `search` filter.
- **View Receipt** button per row:
  - State: `const [viewSale, setViewSale] = useState<Sale | null>(null)`,
    `const [receiptLogo, setReceiptLogo] = useState<string|null>(null)`.
  - On click:
    ```ts
    const sale = await window.pos.getSale(s.id)   // full Sale w/ parsed items
    const logo = await window.pos.getReceiptLogo?.().catch(() => null) ?? null
    setReceiptLogo(logo)
    setViewSale(sale)
    ```
  - Render `<PrintPreviewDialog open={viewSale !== null}
    onOpenChange={(o) => { if (!o) { setViewSale(null); setReceiptLogo(null) } }}
    settings={settings} logo={receiptLogo}
    onPrint={async () => { if (viewSale) await window.pos.printReceipt(viewSale); setViewSale(null); setReceiptLogo(null) }}>`
    with a `children` block mirroring the BillingScreen receipt body: header date, ITEM/QTY/
    PRICE rows, each `viewSale.items` entry (qty label `m`/`x`, discount lines), SUBTOTAL /
    PAID / CHANGE / TOTAL, footer. (Copy the JSX pattern from `BillingScreen.tsx` lines
    ~504-569 — it already maps `SaleItem[]`.)
- Keep the existing `search` Input (filters by id/name via `filteredSales`). Extend
  `filteredSales` to also honor the "bookmarked only" flag.

**Refund tab (`refund`)** = move the current `sales` sub-view (lines 186-311) here, keeping
`openSale`/`refundQty`/`confirmRefund` logic intact. Label `returns.sales`.

**Refund History tab (`refunds-history`)** = move current `history` sub-view (lines 313-356)
here. Label `returns.history`.

**Header/title**: change `t('returns.title')` → `t('history.title')` ("History" / "تاریخ").
TabsList labels: `history.sales`, `returns.sales` (Refund a Sale), `returns.history`
(Refund History).

**i18n keys to add** (en + ur):
- `history.title`: "History" / "تاریخ"
- `history.sales`: "Sales" / "فروخت"
- `history.viewReceipt`: "View Receipt" / "رسید دیکھیں"
- `history.bookmark`: "Bookmark" / "نشان زد کریں" (star tooltip)
- `history.bookmarkedOnly`: "Bookmarked only" / "صرف نشان زد"

(Keep existing `returns.sales` = "Refund a Sale" / "فروخت واپس کریں" and
`returns.history` = "Refund History" / "ریفنڈ کی تاریخ" — they now label the two refund tabs.)

### 5. Type-check & validate
- `npx tsc --noEmit -p tsconfig.web.json` and `tsconfig.node.json`.
- Manual checks:
  1. Open History (F3); default view is the Sales list.
  2. Click a star → persists after app reload (DB column). `!!s.bookmarked` reflects state.
  3. Toggle "Bookmarked only" → list shows only starred sales; combine with search.
  4. Click "View Receipt" → `PrintPreviewDialog` shows items + totals; Print sends to the
     thermal printer (or warns if unconfigured) via `window.pos.printReceipt`.
  5. Refund a Sale and Refund History tabs still work end-to-end; existing returns data shows.

## Risks / Notes
- `bookmarked` returns `0/1` from SQLite though typed `boolean`; always read `!!s.bookmarked`.
  `mapRow` returns `0` not `false` — TypeScript won't flag it (cast), so be disciplined in UI.
- Do NOT modify `db.ts`/`sync.ts` `returns` table identifiers (that's `SaleReturn`), only the
  UI tab label.
- View Receipt reuses EXISTING `getSale` + `getReceiptLogo` + `printReceipt` — no new IPC for it.
- `PrintPreviewDialog` `settings` accepts `Record<string,string>` (same as BillingScreen); the
  `logo` prop is a data URL from `getReceiptLogo`.

## Files to change
- `src/renderer/src/App.tsx` (NAV label/icon + import)
- `src/renderer/src/components/ReturnsScreen.tsx` (3 tabs, star toggle, bookmark filter, View Receipt)
- `src/renderer/src/i18n/en.json`, `src/renderer/src/i18n/ur.json` (`app.history` + `history.*`)
- `src/shared/types.ts` (`Sale.bookmarked` + `IPC_CHANNELS.SET_SALE_BOOKMARKED`)
- `src/main/db.ts` (`migrateSalesBookmarked` call + fn + `setSaleBookmarked`)
- `src/main/ipc.ts` (register handler)
- `src/preload/index.ts` (expose `setSaleBookmarked`)
