# Developer Dashboard — Vercel deployment (all-shops stats + license key generator)

## Goal
A **separate, simple web app** in `dev-dashboard/` showing operational stats across
**all shops** (multi-tenant) plus a UI to **generate Ed25519 license keys**.
Deployed on **Vercel** with **high security**: no keys in the browser, all Supabase
and signing access server-side, deployment protected.

## Architecture (Vercel serverless)
```
dev-dashboard/
  api/
    stats.ts            # GET — serverless fn: reads Supabase (server-side), aggregates all shops
    license.ts          # POST — serverless fn: signs license with private key from env; gated
  public/
    index.html          # Tailwind CDN + markup (static, served by Vercel)
    app.js              # calls /api/stats and /api/license (no secrets in browser)
  vercel.json           # routing: /api/* → functions, everything else → static
  package.json          # @vercel/node, @supabase/supabase-js (already a dep)
  README.md             # Vercel env vars + Password Protection setup
```
- **Frontend is fully static** (HTML + Tailwind via CDN). It NEVER sees the Supabase
  key or the license private key.
- **`api/stats.ts`** and **`api/license.ts`** are Vercel serverless functions
  (`@vercel/node`). They run per-request; no long-lived process, no localhost bind.
- Delete the earlier prototype `dev-dashboard/server.cjs` (listening HTTP server —
  incompatible with Vercel).

## Security model (super high security)
1. **Vercel Password Protection** (or Vercel Auth) enabled on the deployment → outer
   gate, zero code. Anyone hitting the URL must enter the deployment password.
2. **License signing extra gate**: `api/license.ts` also requires a shared secret
   (`LICENSE_SIGN_SECRET`) sent in a header/`x-sign-secret`. Even inside the
   password-protected deployment, minting keys is doubly gated.
3. **Secrets only in Vercel Environment Variables** (encrypted at rest, injected at
   runtime). Never committed, never in `public/`.
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` — **confirmed choice**: server-side only, bypasses RLS
     for clean all-shops reads. Must stay in env, never in browser. (Not the anon key.)
   - `LICENSE_PRIVATE_KEY` — base64 of the Ed25519 pkcs8 private key
     (contents of `license-keys.json.privateKey`). NOT the file path.
   - `LICENSE_SIGN_SECRET` — extra gate for the license endpoint.
4. **All Supabase access server-side** inside `api/stats.ts`. The browser only ever
   talks to our own `/api/*` functions.

## Data source & aggregation (all shops)
- Source = **Supabase** (multi-tenant, `shop_id`). Local SQLite is single-shop and is
  NOT used.
- Tables: `shops` (id,name), `sales` (total,payment_method,created_at,shop_id,items),
  `products` (id,name,shop_id,active,low_stock_threshold), `stock_movements`
  (product_id,shop_id,change_amount), `returns` (shop_id,refund_amount).
- Aggregation in `api/stats.ts` (JS, keyed by `shop_id`):
  - Global cards: total shops, total sales (count + revenue) all-time & today,
    total products, active products, total returns + refunded amount, total stock movements.
  - Per-shop table: same breakdown per `shop_id` (name from `shops`).
  - Low-stock list: per shop, `SUM(stock_movements.change_amount) < low_stock_threshold`.
  - Top products / best category / hourly trend: per selected shop (reuse PWA logic).
- **Scale note**: for many shops/rows, fetching all `sales` into a function can be
  heavy. v1 does paginated fetch + JS aggregation (fine for a dev tool). Hardening
  option: add a Supabase RPC `get_dev_stats()` returning pre-aggregated rows (one SQL
  call). List RPC as optional follow-up, not required for v1.

## License generation (`api/license.ts`)
- Body `{ machineId, shopName, tier: '1y'|'2y'|'5y' }`.
- Mirrors `scripts/license-keygen.ts` exactly:
  - `machineHash = sha256(machineId).slice(0,32)`
  - `expiry = now + TIER_DAYS[tier]`
  - `payload = JSON({ m, s:shopName, e:expiryISO, t:tier })`
  - sign with Ed25519 private key (from `LICENSE_PRIVATE_KEY` env), base64url.
  - return `{ licenseKey: payloadB64 + '.' + sigB64, shopName, machineId, tier, expiry }`
- Reads private key from env at request time (no filesystem dependency on Vercel).
- Verify UI: `public/app.js` decodes a pasted key and checks signature with the
  **public** key (hardcode the public key, or expose it via a public `/api/license-pubkey`
  function). Public key is safe to ship.

## Failure modes
- Missing `LICENSE_PRIVATE_KEY` env → 500 with clear message ("set LICENSE_PRIVATE_KEY").
- Wrong `LICENSE_SIGN_SECRET` → 403 on license endpoint.
- Supabase unreachable / no rows → function returns error JSON; frontend shows banner + retry.
- Password Protection not enabled → warn in README that deployment is exposed.

## Validation
1. `vercel dev` (or deploy preview) → homepage loads (Tailwind renders).
2. Password prompt appears; entering it shows dashboard.
3. `/api/stats` returns global + per-shop aggregates matching Supabase
   (`sales`/`stock_movements` sums). Low-stock list matches per-shop PWA.
4. License UI: generate key for a known machineId → key returned; paste into verify →
   validates with public key; activate in desktop app → `getLicenseStatus()` valid.
5. License endpoint without `LICENSE_SIGN_SECRET` → 403.
6. Confirm `public/` contains NO Supabase key / private key (grep).

## Out of scope
- User accounts/RBAC beyond Vercel Password Protection + signing secret.
- Writing back to Supabase or mutating shop data.
- Local SQLite usage.

## Notes / decisions
- Replaces `dev-dashboard/server.cjs` (delete it).
- Uses existing `@supabase/supabase-js` dependency.
- Public key may be exposed via a tiny public function or hardcoded in `app.js`.
