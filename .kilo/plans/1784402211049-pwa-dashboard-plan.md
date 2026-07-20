# PWA Dashboard Plan

## Goal
Create a read-only Progressive Web App (PWA) that displays real-time sales and inventory reports for the POS system. The PWA will be authenticated via a QR code scanned from the Electron desktop app's settings screen, which provides the shop ID for data filtering.

## Scope
- **PWA**: Mobile-first web app (works on desktop too) showing:
  - Shop header (name, currency)
  - Today's sales: total, transaction count, payment method breakdown
  - Inventory list: product names, current stock (computed from stock_movements), low stock alerts
  - Recent sales/returns: last 10 transactions
- **Authentication**: QR code from Electron app containing shop ID and timestamp (valid for 5 minutes)
- **Data source**: Same Supabase instance used by Electron app (read-only access)
- **Security**: 
  - Anon key embedded in PWA (same as desktop app's exposure level)
  - All queries filtered by scanned shop ID
  - Short-lived QR code (5-minute TTL) to prevent reuse
  - No write capabilities in PWA

## Files to Create
```
pwa-app/
├── index.html
├── manifest.json
├── sw.js
├── app.js
└── style.css
```

### 1. index.html
- Basic HTML5 structure
- Includes: manifest link, service worker registration, CSS, JS
- Contains:
  - QR code scanner container (hidden after login)
  - Main dashboard container (hidden until login)
  - Header: shop name, last updated time
  - Sections: Sales, Inventory, Recent Transactions
  - Placeholder for loading/error states

### 2. manifest.json
- PWA metadata for installability
- Name: "POS Dashboard"
- Short name: "Dashboard"
- Icons: 192x192 and 512x512 (placeholders)
- Start URL: "/"
- Display: "standalone"
- Background/theme colors: matching Electron app theme

### 3. sw.js
- Service worker for caching static assets
- Cache files: index.html, manifest.json, sw.js, app.js, style.css
- Network-first strategy for API requests (to get fresh data)
- Fallback to cached shell when offline

### 4. style.css
- Basic mobile-first styling
- Clean, readable layout
- Responsive design (works on mobile and desktop)
- Color scheme: use Electron app's teal/slate colors
- Simple typography and spacing

### 5. app.js
- Main application logic
- Dependencies: 
  - Supabase JS loaded from CDN (or bundled)
  - HTML5 Qrcode library (from CDN) for scanning
- Key functions:
  - `init()`: 
    - Check for existing shopId in sessionStorage
    - If present, load dashboard
    - Else show QR scanner
  - `scanQRCode()`: 
    - Use HTML5 Qrcode scanner
    - On scan: parse JSON, validate timestamp (<5 min old), store shopId in sessionStorage
    - On success: hide scanner, show dashboard, load data
  - `loadDashboardData()`:
    - Initialize Supabase client with anon key (from environment variable or hardcoded for now - in prod should be fetched securely but we'll note risk)
    - Set up listeners:
      - Shop info: get shop name/currency
      - Sales today: sum of sales where created_at >= today start
      - Sales trend: last 7 days daily totals
      - Inventory: 
        * Get all products
        * For each product, sum stock_movements.change_amount where product_id matches
        * Compute current stock, flag if below low_stock_threshold
      - Recent sales/returns: last 10 combined, sorted by date
    - Use Supabase Realtime channels to listen for changes on sales and stock_movements tables to update UI live
    - Format numbers as currency (using shop currency)
    - Handle loading/error states
  - `handleLogout()`: clear sessionStorage, show scanner again

## Validation Steps
1. Verify PWA loads and shows QR scanner initially
2. Scan valid QR code from Electron app -> dashboard loads with correct shop data
3. Scan expired QR code -> shows error, prompts rescan
4. Verify data matches Electron app's current state (sales, inventory)
5. Test real-time updates: make a sale on Electron app -> see update in PWA within seconds
6. Test offline capability: disconnect network -> PWA shows last known data (from cache) with offline indicator
7. Verify installability: "Install" prompt appears in browser
8. Check service worker caches static assets
9. Verify no write attempts are possible (UI lacks edit controls)

## Risks & Mitigations
- **Security**: Anon key exposed in PWA (same as desktop app's main process). Mitigation: Note that this is acceptable given the threat model; data is still filtered by shop_id. For higher security, consider a backend proxy in future.
- **Shop ID leakage**: QR code contains shop ID. Mitigation: Short TTL (5 min) limits exposure window.
- **Offline data staleness**: Clearly label data as "last updated at [time]" and show offline indicator.
- **Performance**: Limit recent transactions to 10 items; use efficient Supabase queries (select specific columns, aggregate where possible).

## Dependencies
- Supabase JS (from CDN: https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2)
- HTML5 Qrcode (from CDN: https://cdn.jsdelivr.net/npm/html5-qrcode)
- Optional: Chart.js for simple charts (if desired, but not required for MVP)

## Implementation Notes
- Keep UI simple and fast; prioritize readability over fancy animations
- Use vanilla JS to avoid build complexity (though could use React if preferred, but user asked for plain HTML/JS)
- Ensure all Supabase queries include `.eq('shop_id', scannedShopId)`
- Handle errors gracefully (show user-friendly messages, not console errors)
- Make dashboard responsive: single column on mobile, maybe two columns on tablet/desktop