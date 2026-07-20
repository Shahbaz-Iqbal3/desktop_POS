// api/auth.ts — shared HTTP Basic Auth gate (Hobby-plan friendly).
// Vercel's Deployment Protection is Pro/Enterprise only, so we gate the whole
// dashboard with a single DASHBOARD_PASSWORD via Basic Auth. The browser shows
// a native login prompt; credentials are cached for the origin.
import crypto from 'crypto'

export function requireBasicAuth(req: any, res: any): boolean {
  const pwd = process.env.DASHBOARD_PASSWORD
  if (!pwd) {
    res.status(500).json({ error: 'Server misconfigured: DASHBOARD_PASSWORD env var missing.' })
    return false
  }
  const header = req.headers['authorization'] || ''
  const expected = 'Basic ' + Buffer.from('admin:' + pwd).toString('base64')
  const a = Buffer.from(header)
  const b = Buffer.from(expected)
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b)
  if (!ok) {
    res.setHeader('WWW-Authenticate', 'Basic realm="POS Dev Dashboard"')
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}
