// Hardcoded, build-time feature flags.
//
// MULTI_TENANT = false  -> single shop with a single till. Branch/till
//   management UI is hidden; the app always uses the default branch ('branch-default')
//   and till ('till-1'). Set to true to re-enable multi-branch / multi-till management.
export const MULTI_TENANT = false

// Base URL of the dashboard PWA. Embedded into the pairing QR so scanning it with
// a normal phone camera opens the PWA pre-filled with shop access. Override at
// build/run time via POS_DASHBOARD_PWA_URL.
//
// `process` exists in the main (Node) process but NOT in the renderer (browser)
// bundle, so guard the access to keep this shared module safe to import anywhere.
const POS_DASHBOARD_PWA_URL =
  typeof process !== 'undefined' && process.env && process.env.POS_DASHBOARD_PWA_URL
    ? process.env.POS_DASHBOARD_PWA_URL
    : 'http://localhost:5000'
export const DASHBOARD_PWA_URL = POS_DASHBOARD_PWA_URL

// Pairing codes are short-lived credentials: a freshly generated code is valid
// for this many minutes, after which the PWA (and any new QR scan) rejects it.
// Codes are also rotated on every "Refresh" and on each online connect.
export const PAIRING_CODE_TTL_MINUTES = 5
