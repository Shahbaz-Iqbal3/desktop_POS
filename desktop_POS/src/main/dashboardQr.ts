import { ipcMain } from 'electron'
import { getSetting, getShopPairingCode, refreshShopPairingCode } from './db'
import { pushShopPairingCode, getSyncStatus } from './sync'
import { DASHBOARD_PWA_URL } from '@shared/config'
import * as bwipjs from 'bwip-js/node'

// Build the pairing URL embedded in the QR code. Scanning it with a normal phone
// camera opens the PWA pre-filled with shop access; scanning it inside the PWA
// connects directly. The only credential exposed in the QR is the short,
// frequently-rotated pairing code — the shop id is never embedded (it would
// leak the internal id and is unnecessary, since the PWA resolves the shop from
// the code via Supabase). See db.ts generatePairingCode / refreshShopPairingCode.
function buildPayload(code: string) {
  if (!code) return null
  const url = `${DASHBOARD_PWA_URL}/?code=${encodeURIComponent(code)}`
  return { code, url }
}

// Render the QR for the CURRENT pairing code, if one exists. Does NOT create a
// code — if none has been generated yet (the normal launch state) it returns
// not-ok so the UI shows the "Generate QR code" skeleton instead.
export function generateDashboardQrPayload() {
  const code = getShopPairingCode()
  if (!code) return null
  return buildPayload(code)
}

// Rotate the pairing code and return a fresh QR. Called on "Refresh code".
// The new code MUST be pushed to Supabase, because the PWA resolves the shop
// from the code via the cloud — so if we're offline (no Supabase) we refuse to
// generate a new code/QR rather than hand out a code the PWA could never verify.
export async function refreshDashboardQrCode() {
  const shopId = getSetting('shopId')
  if (!shopId) return { ok: false as const, error: 'No shop ID configured' }
  if (!getSyncStatus().isOnline) {
    return {
      ok: false as const,
      error: `You are offline. The pairing code must sync to the cloud, so connect to the internet and try again.`
    }
  }
  const code = refreshShopPairingCode()
  const payload = buildPayload(code ?? '')
  if (!payload) return { ok: false as const, error: 'No shop ID configured' }
  // Propagate the new code to the cloud so the PWA's Supabase lookup finds it.
  const push = await pushShopPairingCode()
  if (!push.ok) {
    return {
      ok: false as const,
      error: `Could not sync the new code to the cloud (${push.error ?? 'unknown error'}). Stay online and try again.`
    }
  }
  try {
    const dataUrl = await generateDashboardQrImage(payload)
    return { ok: true as const, code: payload.code, url: payload.url, dataUrl }
  } catch (err) {
    return { ok: false as const, error: String(err) }
  }
}

export async function generateDashboardQrImage(
  payload: { code: string; url: string }
): Promise<string> {
  const png = (await bwipjs.toBuffer({
    bcid: 'qrcode',
    text: payload.url,
    scale: 4,
    includetext: false,
  })) as Buffer
  return `data:image/png;base64,${png.toString('base64')}`
}

export function registerDashboardQrIpc(): void {
  ipcMain.handle('dashboard:get-qr-code', async () => {
    const payload = generateDashboardQrPayload()
    if (!payload) {
      return { ok: false as const, error: 'No shop ID configured' }
    }
    try {
      const dataUrl = await generateDashboardQrImage(payload)
      return { ok: true as const, payload, dataUrl }
    } catch (err) {
      return { ok: false as const, error: String(err) }
    }
  })

  ipcMain.handle('dashboard:refresh-pair-code', async () => {
    return refreshDashboardQrCode()
  })
}
