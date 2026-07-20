# POS App — Desktop Point-of-Sale (Electron + React + SQLite + Supabase)

Offline-first desktop POS for fabric/cloth shops (Pakistan market). Built per the
20-phase plan in `/home/z/my-project/worklog.md`.

## Stack
- **Electron 32** + **electron-vite** (main / preload / renderer split)
- **React 18** + **TypeScript 5** (renderer)
- **better-sqlite3** (main process only — renderer never touches DB)
- **node-thermal-printer** (USB ESC/POS thermal printer)
- **react-i18next** (English + Urdu, RTL)
- **node-machine-id** + Ed25519 signature (offline licensing)
- **electron-builder** (Windows .exe installer)
- **electron-updater** (GitHub Releases auto-update)
- **xlsx** (report export)

## Getting started
```bash
cd pos-app
bun install          # or npm install
bun run dev          # electron-vite dev — opens the desktop window
```

## Scripts
- `bun run dev` — start dev (hot reload)
- `bun run build` — build for production
- `bun run typecheck` — TS typecheck (node + web)
- `bun run lint` — ESLint
- `bun run package` — build + electron-builder (.exe installer in `dist/`)
- `bun run package:win` — Windows-only build
- `bun run license:keygen` — generate a license key (run on your machine, not in the app)

## License key generation
```bash
bun run scripts/license-keygen.ts <machineId> <shopName> <1y|2y|5y>
```
The keygen creates/loads an Ed25519 keypair at `./license-keys.json` (gitignored).
On first run it prints the **public key** — paste that into `src/main/license.ts`
(replacing the demo key) before shipping the app.

## Architecture
```
src/
├── main/           # Node.js main process (DB, printer, license, IPC)
│   ├── index.ts        # app entry, window creation
│   ├── db.ts           # better-sqlite3 layer + schema + queries
│   ├── ipc.ts          # ipcMain.handle() registrations
│   ├── printer.ts      # thermal printer + receipt formatting
│   ├── license.ts      # Ed25519 license verification
│   └── backup.ts       # SQLite file backup + xlsx export
├── preload/        # contextBridge — secure API surface for renderer
│   └── index.ts
├── renderer/       # React UI (sandboxed, no Node access)
│   ├── index.html
│   └── src/
│       ├── App.tsx             # tab shell (billing/dashboard/reports/shifts/settings)
│       ├── components/         # BillingScreen, SettingsScreen, DashboardScreen, etc.
│       ├── hooks/              # useBilling, useToasts, useBarcodeScanner
│       └── i18n/               # en.json, ur.json
└── shared/         # types + constants used by both main and renderer
    └── types.ts
scripts/
├── seed.ts             # re-seed default data
└── license-keygen.ts   # generate signed license keys
```

## ⚠️ Critical invariants (verified in Phase 19 testing)
1. **Stock is never stored as a mutable number** — always computed by `SUM(stock_movements.change_amount)`.
2. **Sale + stock movements are atomic** — single SQLite transaction, rolls back on any failure.
3. **Print is fire-and-forget** — sale is saved BEFORE printing; printer failure never blocks a sale.
4. **License check is offline** — Ed25519 signature verified against baked-in public key every launch.
5. **Renderer never touches SQLite directly** — all DB access via `window.pos.*` (contextBridge).

## Known limitations
- Electron native windows cannot be previewed in a web sandbox — run `bun run dev` locally.
- `better-sqlite3` requires native compilation; if `bun install` fails, install build tools first.
- Supabase cloud sync (Phases 10–11) is designed but not implemented in v1 — app is single-device SQLite.
- Auto-backup writes to a server-side folder; for USB backup, use "Backup Now" (file picker).
