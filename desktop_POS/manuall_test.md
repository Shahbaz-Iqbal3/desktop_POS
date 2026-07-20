# POS App — Manual Test Checklist

A manual test checklist covering every user flow and feature in the app.

> **Legend:** ⬜ not tested · ✅ pass · ❌ fail · ⚠️ partial
> **Priority order for a fast launch:** Setup → Billing → Returns → Inventory stock → Shifts → Reports export → License lockout → Backup restore (these cover the money paths).

---

## Setup & First Run
- [ ] Fresh launch (clean `userData` / no `pos.db`) shows the Setup Wizard, not the app.
- [ ] **Step 1 — Shop:** shop name / address / phone / email / tax ID / currency save correctly; currency symbol (e.g. `Rs`) appears in billing later.
- [ ] **Step 2 — Language:** switching to Urdu flips the UI to RTL; persists after restart.
- [ ] **Step 3 — Printer:** OS printers list populates; custom `tcp://` / `serial://` / `usb:` entry works.
- [ ] **Step 4 — Categories:** add / remove category rows; created categories appear in Inventory.
- [ ] **Step 5 — License:** paste an invalid key → warning, not blocked; valid key activates; `setupComplete` set.
- [ ] **Step 6 — Toggles:** barcode + till reconciliation switches persist and appear in Settings.
- [ ] **Finish** → lands in Billing; reopening the app skips the wizard (reads `setupComplete`).

## Billing (Sales)
- [ ] Product grid loads by category; selecting adds a line item.
- [ ] Quantity +/- and price edit recalc line total (verify `computeLineTotal` discount math).
- [ ] Line discount % (0–100) applies; negative / >100 clamped.
- [ ] Subtotal / total correct; partial payment (`actualPaidPrice`) vs total handled.
- [ ] Cash vs Digital payment toggle recorded.
- [ ] Complete sale → receipt prints (if printer set); sale appears in Returns / Sales.
- [ ] Stock decrements by sold qty (check Inventory / low-stock indicator).
- [ ] Barcode mode (if enabled): scanner input finds the product.
- [ ] Hold cart → recall restores items / total; delete held cart works.
- [ ] F1–F7 keyboard shortcuts navigate (when setup complete & not expired).

## Returns / Refunds
- [ ] Look up a sale; select refunded items / partial qty.
- [ ] Refund reverses stock (stock goes back up).
- [ ] Refund amount + payment method recorded; appears in Returns list.

## Inventory
- [ ] Products list with computed stock; add product (name, category, unit, price, barcode, initial stock).
- [ ] Edit product; delete product.
- [ ] Add stock movement (restock / adjustment) updates computed stock.
- [ ] Low-stock threshold badge shows when stock < threshold.

## Shifts (if till reconciliation enabled)
- [ ] Open shift requires opening cash; blocks double-open on same till.
- [ ] Sales during shift attributed to the shift.
- [ ] Close shift: expected cash = opening + cash sales; variance shows.
- [ ] Shifts history lists past shifts.

## Dashboard / Reports
- [ ] Today / 7d / 30d ranges update totals, cash/digital split, best category, top products, hourly/daily trend.
- [ ] Low-stock panel matches Inventory.
- [ ] Export sales / stock / cash report → xlsx opens with correct rows.

## Settings
- [ ]   Edit shop details, language, printer, toggles → persist + take effect.
- [ ]   "Show receipt preview before printing" toggle: on → Confirm Order, Reprint Last Receipt, and Refund all open the receipt preview dialog (Print / Skip); off → all print directly.
- [ ]   Logo appears in every preview when "Print logo on receipt" is on.
- [ ] Receipt logo: pick PNG, copies to `userData`, prints on receipt.
- [ ] Auto-backup toggle + path → writes `pos-auto-*.db`; manual backup to USB works.
- [ ] Supabase URL / key entry (if exposed) → sync status reflects.
- [ ] Activate / refresh license from Settings.

## Licensing
- [ ] No key → "trial" banner, app usable.
- [ ] Valid key → `valid` state, days remaining shown.
- [ ] Past expiry → grace banner (7 days) counts down.
- [ ] Past grace → `LicenseLockout`; only activate screen reachable; billing blocked.
- [ ] Machine-bound key fails on a different machine ID.

## Sync (if Supabase configured)
- [ ] Online indicator reflects network; pending count decreases after sync.
- [ ] Offline → pending accumulates; syncs on reconnect.
- [ ] Manual "Sync now" and "Reconfigure" work; sync errors surfaced (not silent).

## Backup & Data Integrity
- [ ] Restore from auto-backup DB file recovers sales / products.
- [ ] Force-close mid-sale → no partial stock / sale (atomicity); reopen consistent.
- [ ] WAL files (`pos.db-wal` / `-shm`) present and clean on exit.

## Cross-cutting
- [ ] App relaunch restores all settings / state.
- [ ] Window open handler routes external links to browser, no in-app popups.
- [ ] Global error → logged via `telemetry:log-error` (check dev console).
- [ ] UI in both English and Urdu (RTL layout) for each screen.

---

## Launch Priority Path
`Setup` → `Billing` → `Returns` → `Inventory stock` → `Shifts` → `Reports export` → `License lockout` → `Backup restore`
