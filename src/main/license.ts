// Licensing system — runs in the MAIN PROCESS.
// Offline signature verification using Node's crypto (Ed25519).
// The private key lives ONLY in the keygen script (scripts/license-keygen.ts),
// never shipped with the app. The public key is baked in below.
import { ipcMain } from 'electron'
import { createHash } from 'crypto'
import nodeMachineId from 'node-machine-id'
const { machineIdSync } = nodeMachineId
import { getSetting, setSetting } from './db'

// --- Public key (Ed25519, base64) ---
// This corresponds to the private key in scripts/license-keygen.ts.
// Generated once; replace both keys together if you ever rotate.
// Public key (Ed25519, base64 DER/SPKI) baked into the app. Generated once by
// scripts/license-keygen.ts and stored privately in ./license-keys.json
// (gitignored). The matching private key is used only to sign license keys.
// Keep the private key safe — if it leaks, anyone can mint licenses.
const LICENSE_PUBLIC_KEY_B64 = process.env.POS_LICENSE_PUBLIC_KEY ?? ''
const PUBLIC_KEY =
  LICENSE_PUBLIC_KEY_B64 ||
  'MCowBQYDK2VwAyEA1a/zG/WDA9gVk5e9vjCVx6sFk9TpbuPcIb/BtS5nwkM='

const GRACE_PERIOD_DAYS = 7

export type LicenseTier = '1y' | '2y' | '5y'
export type LicenseStatus =
  | { state: 'valid'; shopName: string; expiry: string; daysRemaining: number }
  | { state: 'grace'; shopName: string; expiry: string; daysRemaining: number }
  | { state: 'expired'; shopName: string; expiry: string }
  | { state: 'none' }

// License key format: base64url(JSON({ m: machineHash, s: shop, e: expiryIso, t: tier }))
// concatenated with '.' + base64url(Ed25519 signature of the JSON)
export function verifyLicenseKey(key: string, expectedMachineId: string): {
  ok: boolean
  shopName?: string
  expiry?: string
  tier?: LicenseTier
  error?: string
} {
  const parts = key.trim().split('.')
  if (parts.length !== 2) {
    return { ok: false, error: 'Malformed license key' }
  }
  const [payloadB64, sigB64] = parts

  let payloadJson: string
  try {
    payloadJson = Buffer.from(payloadB64, 'base64url').toString('utf8')
  } catch {
    return { ok: false, error: 'Invalid payload encoding' }
  }

  // Verify signature
  try {
    const pubKeyDer = Buffer.from(PUBLIC_KEY, 'base64')
    const sig = Buffer.from(sigB64, 'base64url')
    const ok = verifyEd25519(pubKeyDer, Buffer.from(payloadJson, 'utf8'), sig)
    if (!ok) return { ok: false, error: 'Invalid signature' }
  } catch (err) {
    return { ok: false, error: `Signature verification failed: ${String(err)}` }
  }

  // Parse payload
  let payload: { m: string; s: string; e: string; t: LicenseTier }
  try {
    payload = JSON.parse(payloadJson)
  } catch {
    return { ok: false, error: 'Invalid payload JSON' }
  }

  // Verify machine ID matches (SHA-256 hash of machine id, truncated)
  const expectedHash = hashMachineId(expectedMachineId)
  if (payload.m !== expectedHash) {
    return { ok: false, error: 'License key is for a different machine' }
  }

  // Verify expiry is a valid future date
  const expiry = new Date(payload.e)
  if (isNaN(expiry.getTime())) {
    return { ok: false, error: 'Invalid expiry date' }
  }

  return {
    ok: true,
    shopName: payload.s,
    expiry: payload.e,
    tier: payload.t
  }
}

function verifyEd25519(pubKey: Buffer, data: Buffer, sig: Buffer): boolean {
  try {
    const crypto = require('crypto')
    const keyObject = crypto.createPublicKey({ key: pubKey, format: 'der', type: 'spki' })
    return crypto.verify(null, data, keyObject, sig)
  } catch {
    return false
  }
}

function hashMachineId(rawMachineId: string): string {
  return createHash('sha256').update(rawMachineId).digest('hex').slice(0, 32)
}

export function getMachineId(): string {
  try {
    return machineIdSync()
  } catch {
    return 'unknown-machine'
  }
}

export function getLicenseStatus(): LicenseStatus {
  const key = getSetting('licenseKey')
  const expiryStr = getSetting('licenseExpiry')
  const shopName = getSetting('shopName') ?? 'Unknown Shop'

  if (!key || !expiryStr) {
    return { state: 'none' }
  }

  const expiry = new Date(expiryStr)
  if (isNaN(expiry.getTime())) {
    return { state: 'none' }
  }

  const now = new Date()
  const graceEnd = new Date(expiry)
  graceEnd.setDate(graceEnd.getDate() + GRACE_PERIOD_DAYS)

  if (now > graceEnd) {
    return { state: 'expired', shopName, expiry: expiryStr }
  }
  if (now > expiry) {
    const daysRemaining = Math.ceil((graceEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
    return { state: 'grace', shopName, expiry: expiryStr, daysRemaining }
  }
  const daysRemaining = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return { state: 'valid', shopName, expiry: expiryStr, daysRemaining }
}

export function activateLicense(key: string): { ok: boolean; error?: string; status?: LicenseStatus } {
  const mid = getMachineId()
  const result = verifyLicenseKey(key, mid)
  if (!result.ok) {
    return { ok: false, error: result.error }
  }
  setSetting('licenseKey', key)
  setSetting('licenseExpiry', result.expiry!)
  if (result.shopName) {
    setSetting('shopName', result.shopName)
  }
  return { ok: true, status: getLicenseStatus() }
}

export function registerLicenseIpc(): void {
  ipcMain.handle('license:get-machine-id', () => getMachineId())
  ipcMain.handle('license:activate-license', (_e, key: string) => activateLicense(key))
  ipcMain.handle('license:get-license-status', () => getLicenseStatus())
}
