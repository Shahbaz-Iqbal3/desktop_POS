// api/license.ts — Vercel serverless function (Node).
// Generates an Ed25519 license key. The private key lives ONLY in the
// LICENSE_PRIVATE_KEY env var (Vercel secret), never in the browser/repo.
// Extra gate: caller must send the LICENSE_SIGN_SECRET in the `x-sign-secret` header.
import crypto from 'crypto'
import { requireBasicAuth } from './auth'

const TIER_DAYS: Record<string, number> = { '1y': 365, '2y': 730, '5y': 1825 }

function hashMachineId(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }
  if (!requireBasicAuth(req, res)) return

  const signSecret = process.env.LICENSE_SIGN_SECRET
  const provided = req.headers['x-sign-secret'] || ''
  if (!signSecret || provided !== signSecret) {
    res.status(403).json({ error: 'Forbidden: invalid or missing sign secret.' })
    return
  }

  const privateKeyB64 = process.env.LICENSE_PRIVATE_KEY
  if (!privateKeyB64) {
    res.status(500).json({ error: 'Server misconfigured: LICENSE_PRIVATE_KEY env var missing.' })
    return
  }

  let body: any = {}
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {}
  } catch {
    res.status(400).json({ error: 'Invalid JSON body.' })
    return
  }

  const { machineId, shopName, tier } = body
  if (!machineId || !shopName || !tier) {
    res.status(400).json({ error: 'machineId, shopName and tier are required.' })
    return
  }
  if (!(tier in TIER_DAYS)) {
    res.status(400).json({ error: `Invalid tier "${tier}". Use one of: ${Object.keys(TIER_DAYS).join(', ')}` })
    return
  }

  try {
    const machineHash = hashMachineId(String(machineId))
    const expiry = new Date()
    expiry.setDate(expiry.getDate() + TIER_DAYS[tier])

    const payload = JSON.stringify({ m: machineHash, s: shopName, e: expiry.toISOString(), t: tier })
    const privateKeyObj = crypto.createPrivateKey({
      key: Buffer.from(privateKeyB64, 'base64'),
      format: 'der',
      type: 'pkcs8'
    })
    const sig = crypto.sign(null, new Uint8Array(Buffer.from(payload, 'utf8')), privateKeyObj)
    const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url')
    const sigB64 = sig.toString('base64url')

    res.status(200).json({
      licenseKey: `${payloadB64}.${sigB64}`,
      shopName,
      machineId,
      tier,
      expiry: expiry.toISOString()
    })
  } catch (e: any) {
    res.status(500).json({ error: String(e?.message || e) })
  }
}
