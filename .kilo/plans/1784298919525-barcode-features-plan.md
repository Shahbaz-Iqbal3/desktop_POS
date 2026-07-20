# Barcode Feature Plan

## Context
The POS already has partial barcode support: a `barcode` column per product, a `barcodeEnabled`
setting + toggle, a USB-HID keyboard-wedge `useBarcodeScanner` hook that adds the scanned product
to the Billing cart, and a `printBarcodeLabel` main-process function. However:

- `printBarcodeLabel` is **dead code** — no UI ever calls it.
- There is **no on-screen barcode preview** in the product form/view (only the thermal printer emits one).
- Products with no barcode must be entered manually; nothing auto-generates one.
- No **duplicate-barcode** detection/validation. A non-matching scan only logs a silent error.
- Scanning gives **no feedback** (no sound, no visual confirmation).
- There is **no setting to pick which printer** prints barcode labels (the user requested this).

Symbology decision: **CODE128** everywhere (printer default + on-screen via `bwip-js`, already a dependency).
Auto-generation: **on empty barcode only** (manual entry still allowed + validated for duplicates).
Scan UX: **beep (WebAudio) + brief visual flash on the matched product + clear toasts**; duplicate/no-match
must NOT add to cart.

## Goals
1. On-screen CODE128 barcode rendering in the product form and Inventory list (using `bwip-js`).
2. Auto-generate a unique CODE128 barcode when a product is created with an empty barcode.
3. Validate barcodes for duplicates on create/edit (reject duplicate, clear message).
4. Wire `printBarcodeLabel` into Inventory: per-product **Print label** button + a **barcode printer**
   setting (defaults to the receipt printer) in Settings.
5. Harden `useBarcodeScanner`: clear toasts + a WebAudio beep + visual flash on match; duplicate/no-match
   handled gracefully without adding to cart.

## Implementation Tasks (ordered)

### 1. Barcode generation + validation (main process)
- `src/main/db.ts`:
  - Add `generateBarcode(): string` — produce a unique CODE128-friendly code (e.g. `20` + zero-padded
    numeric counter derived from a new `sqlite_sequence`-style counter or `Date.now()` + random), then
    loop `SELECT COUNT(*) FROM products WHERE barcode = ?` until unique.
  - In `createProduct`: if `input.barcode` is empty/`null`, call `generateBarcode()` and persist it.
    If provided, keep as-is (validation happens in renderer before calling).
  - Add `isBarcodeTaken(barcode, exceptProductId?): boolean` helper for duplicate checks.
- `src/main/ipc.ts` + `src/shared/types.ts` + `src/preload/index.ts`:
  - New channel `pos:is-barcode-taken` → `window.pos.isBarcodeTaken(barcode, exceptId?)`.

### 2. On-screen barcode preview (renderer)
- Add `src/renderer/src/lib/barcode.ts`:
  - `renderBarcodeDataUrl(code: string, opts?): string` using `bwip-js` (`toBuffer`/`toCanvas`) to a PNG
    data URL (CODE128, including human-readable text). Guard for environments without canvas.
- `InventoryScreen.tsx` product modal: show the rendered barcode under the barcode `Input`; live-update
  as the user types (or after generate).
- Inventory list row (optional, low priority): small barcode thumbnail when `p.barcode` present.

### 3. Duplicate validation (renderer)
- In `saveProduct` (InventoryScreen): before `createProduct`/`updateProduct`, if `barcode` is non-empty,
  call `window.pos.isBarcodeTaken(barcode, editing?.id)`; if taken, `toasts.error` and abort.

### 4. Barcode label printing UI
- `src/renderer/src/components/InventoryScreen.tsx`:
  - Add a **Print label** button per product (and/or one in the product modal). On click:
    `await window.pos.printBarcodeLabel({ name, barcode, price })`. Surface `ok`/`error` as toast.
- Settings (`SettingsScreen.tsx` + `src/shared/types.ts` `SETTING_KEYS` + `db.ts` seed defaults):
  - Add `barcodePrinterName` setting. In `printer.ts` `printBarcodeLabel`, if `barcodePrinterName`
    is set and differs from `printerName`, construct a separate `ThermalPrinterConstructor` for that
    interface (reuse `getPrinter`-style resolution incl. `tcp://`/`serial://`/`usb:` + `printer:` prefix).
    Fall back to the receipt printer when unset.
- `SettingsScreen` General/Printer section: a printer `Select` (reuse OS printer list from
  `window.pos.getPrinters()`) for **Barcode label printer**.

### 5. Scanner hardening + feedback
- `src/renderer/src/hooks/useBarcodeScanner.ts`:
  - Keep Enter-terminated HID buffer; add an `onNoMatch(code)` callback and an `onDuplicate?` path.
  - No behavior change to matching; the hook just reports results.
- `src/renderer/src/components/BillingScreen.tsx`:
  - Add `playBeep()` helper (WebAudio oscillator, short ~120ms, guarded by a user-gesture/once init).
  - On successful match: `playBeep()` + briefly set a `flashProductId` state that adds a teal ring/opacity
    pulse to that product tile (reuse `.pos-pulse`-style CSS or a new `.pos-scan-flash`).
  - On no match: `toasts.error(\`No product with barcode ${code}\`)` and do NOT add.
  - On duplicate barcode (multiple products share it): `toasts.error('Duplicate barcode …')` and do NOT add.
- Update `useBilling`/BillingScreen scan handler to detect duplicates via the `products` list and call the
  new feedback paths.

### 6. i18n
- `en.json` / `ur.json`: add `inventory.printLabel`, `inventory.barcodePrinter`, `inventory.duplicateBarcode`,
  `inventory.barcodeGenerated`, `billing.scanMatched` (or reuse), `barcode.noMatch` is existing pattern.

## Affected files
- `src/main/db.ts` (generate, duplicate check, seed default `barcodePrinterName`)
- `src/main/ipc.ts`, `src/shared/types.ts`, `src/preload/index.ts` (new `is-barcode-taken` channel)
- `src/main/printer.ts` (label printer selection in `printBarcodeLabel`)
- `src/renderer/src/lib/barcode.ts` (NEW — bwip-js wrapper)
- `src/renderer/src/components/InventoryScreen.tsx` (preview, validation, print button)
- `src/renderer/src/components/SettingsScreen.tsx` (barcode printer setting)
- `src/renderer/src/hooks/useBarcodeScanner.ts` (no-match/duplicate callbacks)
- `src/renderer/src/components/BillingScreen.tsx` (beep, flash, error toasts)
- `src/renderer/src/i18n/{en,ur}.json`

## Risks / notes
- `bwip-js` renders in Node or browser; in the renderer it needs a canvas — use `bwip.toCanvas` into an
  offscreen `<canvas>` then `toDataURL`. Verify it works under Electron's renderer (it does; bwip-js ships
  a browser build). Keep a fallback: if rendering fails, show the raw code text.
- CODE128 via `node-thermal-printer`: ensure `p.printBarcode(code, 72)` uses CODE128 (default). If a printer
  needs explicit type, set `p.printBarcode(code, 72, 'CODE128')` (check lib API).
- Auto-generated codes must stay unique across the shop; the DB loop in `generateBarcode` guarantees this.
- Beep must not throw if audio context is blocked; wrap in try/catch and initialize on first user gesture.

## Validation
- Manual (see `manuall_test.md`, add a Barcode section):
  - Create product with empty barcode → barcode auto-filled + on-screen preview renders.
  - Enter a duplicate barcode on another product → blocked with clear error.
  - Inventory: click **Print label** → label prints on the chosen barcode printer (or receipt printer if unset).
  - Settings: set Barcode label printer; confirm it is used for labels only, receipt printer unaffected.
  - Billing: scan a valid barcode → beep + product tile flashes + added to cart.
  - Scan unknown/duplicate barcode → clear error toast, nothing added.
- Typecheck: `tsc --noEmit -p tsconfig.web.json` and `tsconfig.node.json` must pass.
