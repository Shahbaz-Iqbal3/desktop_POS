// api/license-pubkey.ts — Vercel serverless function (Node).
// Returns the Ed25519 PUBLIC key (safe to expose) so the browser can verify
// license keys offline. The private key is NEVER returned here.
export default async function handler(_req: any, res: any) {
  const pub = process.env.LICENSE_PUBLIC_KEY
  if (!pub) {
    res.status(500).json({ error: 'Server misconfigured: LICENSE_PUBLIC_KEY env var missing.' })
    return
  }
  res.status(200).json({ publicKey: pub })
}
