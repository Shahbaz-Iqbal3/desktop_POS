# POS Developer Dashboard

A **separate, simple web app** that shows operational stats across **all shops**
(multi-tenant) and provides a UI to **generate Ed25519 license keys**. Deployed on
**Vercel** with high security: no secrets in the browser, all Supabase and signing
access server-side.

## Architecture

- **Frontend** (`public/`): static HTML + Tailwind (CDN). Talks only to `/api/*`.
- **`api/stats.ts`**: serverless function. Reads all-shops stats from Supabase using
  the **service role key** (server-side only) and aggregates in JS by `shop_id`.
- **`api/license.ts`**: serverless function. Signs a license key with the Ed25519
  **private key** (from env). Gated by `LICENSE_SIGN_SECRET`.
- **`api/license-pubkey.ts`**: returns the **public** key (safe to expose) for the
  in-browser verify UI.

## Security

- Deployed behind **Vercel Password Protection** (or Vercel Auth) — set it in the
  Vercel dashboard (Project → Settings → Deployment Protection).
- `api/license.ts` additionally requires `LICENSE_SIGN_SECRET` in the `x-sign-secret`
  header, so minting keys is doubly gated.
- All secrets are **Vercel Environment Variables** (encrypted). Nothing secret is
  committed or shipped to the browser.
- All Supabase access is **server-side**; the browser never sees a Supabase key.

## Environment Variables (Vercel)

Set these in Vercel (Project → Settings → Environment Variables), Production scope:

| Name | Value |
|------|-------|
| `SUPABASE_URL` | `https://wmwnlcqhbfcclqzyunhg.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project **service_role** key (Project → API). Server-side only. |
| `LICENSE_PRIVATE_KEY` | Base64 of the Ed25519 **private** key (`license-keys.json` → `privateKey`). |
| `LICENSE_PUBLIC_KEY` | Base64 SPKI of the Ed25519 **public** key (`src/main/license.ts` → `PUBLIC_KEY`). |
| `LICENSE_SIGN_SECRET` | A strong random secret used to gate license generation. |

> The license keypair is generated once by `scripts/license-keygen.ts` and stored in
> `license-keys.json` (gitignored). Paste its `privateKey`/`publicKey` base64 into the
> env vars above.

## Local dev

```bash
cd dev-dashboard
npm install
# export the env vars above in your shell, then:
npx vercel dev
```

Open the printed local URL. Password Protection is a Vercel-hosted feature; locally
just use the `LICENSE_SIGN_SECRET` for the license endpoint.

## Deploy

```bash
cd dev-dashboard
npx vercel          # preview
npx vercel deploy --prod
```

Then enable **Deployment Protection → Password Protection** in the Vercel dashboard.

## Endpoints

- `GET /api/stats` — global + per-shop + low-stock aggregates.
- `POST /api/license` (header `x-sign-secret`) — `{ machineId, shopName, tier }`
  → `{ licenseKey, shopName, machineId, tier, expiry }`.
- `GET /api/license-pubkey` — `{ publicKey }`.
