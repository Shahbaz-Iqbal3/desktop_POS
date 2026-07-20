# PWA Dashboard — Expand Read Widgets + Add Product/Stock Editing

## Context
`pwa-app/` is a static, no-build PWA that currently **only reads** Supabase (filtered by
`shop_id`) and shows 4 simple widgets. The desktop app already supports **two-way sync**
for `products`, `categories`, `stock_movements` via `pullChanges()` (cloud → local,
last-write-wins on `updated_at`, `src/main/sync.ts:284`).

Goal: (1) make the PWA dashboard mirror the desktop `DashboardScreen` widgets (incl.
charts), and (2) let the PWA **create / edit / delete products** and **record stock
movements**, writing straight to Supabase with the existing anon key. The desktop then
pulls those writes on its next sync. No backend changes, no new build step.

### Decisions (confirmed with user)
- **Write path:** direct Supabase anon writes (reuse existing permissive RLS).
- **Offline:** online-only for v1 (no local queue).
- **Product scope:** full CRUD, but PWA *create* form = basics only (name, category,
  price, default discount, low-stock threshold, active). Advanced fields (barcode
  generation, image) stay desktop-only. Plus stock restock / adjustment.

## Data contracts (PWA → Supabase) — MUST match `pullChanges` consumers
Column names are **snake_case** and must match `scripts/supabase-schema.sql` and the
desktop `upsertSyncedRow` (`src/main/db.ts:1711`).

### products (upsert, LWW)
Required columns: `id` (uuid v4), `shop_id`, `name`, `category_id`, `unit_type`
(default `'piece'`), `default_price` (numeric), `default_discount` (numeric, default 0),
`low_stock_threshold` (integer, default 5), `sku` (`''`), `barcode` (`''`),
`image_path` (`null`), `created_at` (ISO), `active` (**integer 1/0 — NOT boolean**),
`updated_at` (ISO `new Date().toISOString()`).
- **Create:** generate `id` via `crypto.randomUUID()`.
- **Edit:** keep `id`, `created_at`; bump `updated_at`.
- **Delete:** SOFT delete — `active = 0` + bump `updated_at` (hard delete won't
  propagate through `pullChanges` which only SELECTs rows; soft-delete hides it
  consistently on the desktop too).

### stock_movements (insert, append)
Required: `id` (uuid), `product_id`, `category` (**category NAME string**, matching the
desktop which stores the name), `change_amount` (**signed numeric**: `+qty` for restock,
`-qty` for adjustment/removal), `reason` (text, e.g. `'restock'`/`'adjustment'`),
`created_at` (ISO), `synced` (**0**), `shop_id`, `updated_at` (ISO).
- These are pulled by the desktop on next sync and appended (unique id).

### Gotchas (do not regress)
- `products.active` is **integer** → send `1`/`0`, never `true`/`false` (HTTP 400 22P02).
- `total`/`actual_paid_price`/`change_amount`/`default_price` are **numeric** →
  `parseFloat`; send numbers, not strings.
- Every write MUST include `shop_id` (from the paired shop) or it won't be pulled.
- Bump `updated_at = now()` on every write so `pullChanges`' `gt(updated_at, since)`
  picks it up.

## Frontend consistency (from `.kilo/plans/...pwa-app-feature-spec.md` section 4)
Slate/teal tokens: bg `#020617`, card `rgba(15,23,42,0.6)` + `#1e293b` border,
teal-500 `#14b8a6` primary (text `#042f2e`), teal-400 `#2dd4bf` accents, red-400
`#f87171` for low-stock/returns, emerald-400 `#34d399` positive. Inter + IBM Plex Mono.
Mobile-first, max-width ~560px. **No framework / no build** — keep plain HTML/CSS/JS.
Charts must be **hand-rolled SVG** (no chart lib): bar for hourly trend, donut/bar for
cash-vs-digital.

## Implementation tasks (ordered)

### A. Dashboard widgets — mirror desktop `DashboardScreen`
Add to `index.html` + `style.css` + `app.js` (compute from existing Supabase reads):
1. **Today's Sales** KPI: total, count, avg (`total/count`).
2. **Cash in Till**: opening cash + sum of sales `actual_paid_price` (or `total`) where
   `payment_method='cash'` for today; show opening vs current. (Opening = shift opening
   if available, else 0 — document assumption.)
3. **Digital**: sum of non-cash sales; % of total.
4. **Best Category**: aggregate sales `items` (JSON in `sales.items`) by `categoryId`
   (join via products) → top category total.
5. **Hourly Sales Trend**: bucket today's sales by hour → SVG bar chart (08:00–22:00).
6. **Cash vs Digital**: SVG donut/stacked bar of cash vs digital totals.
7. **Top Products**: from `sales.items` joined to `products`, rank by qty sold + revenue.
8. **Low Stock Alerts**: reuse existing inventory calc; show "All products well stocked"
   when none.
Keep existing "Payment methods", "Inventory status", "Recent transactions" widgets.

### B. Product editing (full CRUD, basics create form)
9. Add a **Products** list screen (route/section) showing products (name, price, stock,
   low-stock badge), with Add / Edit / Delete actions.
10. **Create form** (basics): name, category (select from `categories` where
    `shop_id`), `default_price`, `default_discount`, `low_stock_threshold`, `active`
    toggle. On submit → `supabase.from('products').upsert({...contract A...})`.
11. **Edit**: prefill from selected product; same fields; bump `updated_at`.
12. **Delete**: confirm → soft delete (`active=0`, `updated_at=now()`).
13. After any write: optimistic local update + `supabase` refresh of the list; rely on
    desktop `pullChanges` for the desktop side (note: appears on desktop after its next
    sync).

### C. Stock movement (restock / adjustment)
14. From a product, open a **Stock** action: type `restock|adjustment`, direction
    `add|remove`, `quantity`, `reason`.
15. Compute `change_amount` = signed (add +qty, remove −qty); resolve `category` name
    from the product; insert per contract (stock_movements, `synced=0`).
16. Refresh inventory display after write.

### D. Loading / errors
17. Wrap writes in try/catch; show `toast` on success/failure; disable buttons while
    pending. Keep offline banner + loading overlay behavior.
18. Bump `CACHE_NAME` in `sw.js` after changing `index.html`/`app.js`/`style.css`.

## Files to change
- `pwa-app/index.html` — add Products screen + dashboard widget markup.
- `pwa-app/style.css` — new widget/card/modal/list styles (slate/teal).
- `pwa-app/app.js` — new reads (categories, shift opening), KPI/chart computations,
  product CRUD + stock movement write functions, screen routing.
- `pwa-app/sw.js` — bump `CACHE_NAME` version.

## Validation
- [ ] `node --check pwa-app/app.js` passes.
- [ ] Pair → dashboard shows all 8 listed widgets with charts rendering.
- [ ] Create a product in PWA → appears in Supabase `products` with `shop_id`,
      `active=1`, `updated_at` set → after desktop next sync, shows in desktop Inventory.
- [ ] Edit price/threshold → Supabase row updated, `updated_at` bumped → desktop pulls.
- [ ] Delete → `active=0` in Supabase (soft delete) → hidden on both sides.
- [ ] Restock/adjustment → `stock_movements` row inserted with signed `change_amount`,
      `synced=0`, `category` name → inventory reflects after desktop pull.
- [ ] No `active=true` 400 / `22P02`; numbers sent as numeric.
- [ ] Hard-reload PWA picks up new files; visual style matches desktop.

## Phasing decision (confirmed with user)
**Build the PWA features first; add security hardening as a SEPARATE later phase.**
- **v1 (this plan):** PWA reads expanded widgets + writes products/stock directly to
  Supabase with the existing public anon key. Reuses the desktop's two-way `pullChanges`
  so writes reach the desktop. No backend, no `.env` (`.env` cannot secure a static PWA —
  the anon key is necessarily shipped in `app.js`).
- **Later phase (out of scope here):** tighten RLS + add a backend proxy that validates
  the pairing code, resolves `shop_id` server-side, and writes with the `service_role`
  key so a shop can only touch its own rows. Tracked as a follow-up, not blocking v1.

## Open questions / risks
- **Security (accepted for v1):** anon key can read/write products/stock for ANY
  `shop_id` because RLS is permissive (`using (true) with check (true)` in
  `supabase-schema.sql:333-343`). This is the same trust model as the existing sales
  writes. Documented as a known limitation; the proxy above is the fix. Do NOT rely on
  `.env` to mitigate — it is ineffective for a static client.
- **Desktop pull latency:** PWA writes land on the desktop only after its next
  `triggerSync` (interval/online). Document this to users.
- **"Cash in Till" opening:** read the open shift's `opening_cash` from Supabase
  `shifts` when available; otherwise assume 0.
- **Soft-delete accumulation:** deleted products stay in `products` with `active=0`
  (filtered out on reads). They are never physically removed — acceptable for v1.
