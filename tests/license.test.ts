import { describe, it, expect } from 'vitest'
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify, createHash } from 'crypto'

// Validates the exact Ed25519 scheme used by src/main/license.ts and
// scripts/license-keygen.ts without importing Electron (which isn't available
// in a plain Node test environment).
describe('license signature scheme', () => {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const pubB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  const privB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')

  it('signs and verifies a license payload', () => {
    const payload = JSON.stringify({
      m: createHash('sha256').update('machine-xyz').digest('hex').slice(0, 32),
      s: 'Test Shop',
      e: new Date(Date.now() + 86400000).toISOString(),
      t: '1y'
    })
    const data = Buffer.from(payload, 'utf8')
    const privObj = createPrivateKey({ key: Buffer.from(privB64, 'base64'), format: 'der', type: 'pkcs8' })
    const sig = sign(null, data, privObj)

    const pubObj = createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' })
    expect(verify(null, data, pubObj, sig)).toBe(true)
  })

  it('rejects a tampered payload', () => {
    const data = Buffer.from(JSON.stringify({ m: 'a', s: 'b', e: new Date().toISOString(), t: '1y' }), 'utf8')
    const privObj = createPrivateKey({ key: Buffer.from(privB64, 'base64'), format: 'der', type: 'pkcs8' })
    const sig = sign(null, data, privObj)
    const tampered = Buffer.from(JSON.stringify({ m: 'zzz', s: 'b', e: new Date().toISOString(), t: '1y' }), 'utf8')
    const pubObj = createPublicKey({ key: Buffer.from(pubB64, 'base64'), format: 'der', type: 'spki' })
    expect(verify(null, tampered, pubObj, sig)).toBe(false)
  })
})
