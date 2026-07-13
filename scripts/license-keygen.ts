// License key generator — run on YOUR machine, NOT shipped with the app.
// Usage:
//   bun run scripts/license-keygen.ts <machineId> <shopName> <tier: 1y|2y|5y>
//
// Outputs a license key string the user pastes into the Activate screen.
//
// ⚠️ Keep the private key safe. If it leaks, anyone can mint licenses.
import { generateKeyPairSync, createSign, createHash } from 'crypto'

const TIER_DAYS: Record<string, number> = {
  '1y': 365,
  '2y': 730,
  '5y': 1825
}

// Persisted key location — generate once, reuse forever.
// On first run, creates a new Ed25519 keypair and saves it to ./license-keys.json.
// Add that file to .gitignore immediately.
function loadOrCreateKeys(): { publicKey: string; privateKey: string } {
  const fs = require('fs')
  const path = require('path')
  const keyPath = path.resolve(process.cwd(), 'license-keys.json')
  if (fs.existsSync(keyPath)) {
    return JSON.parse(fs.readFileSync(keyPath, 'utf8'))
  }
  const { publicKey, privateKey } = generateKeyPairSync('ed25519')
  const pubB64 = publicKey.export({ type: 'spki', format: 'der' }).toString('base64')
  const privB64 = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')
  const keys = { publicKey: pubB64, privateKey: privB64 }
  fs.writeFileSync(keyPath, JSON.stringify(keys, null, 2))
  console.log(`\n✅ Generated new Ed25519 keypair at ${keyPath}`)
  console.log('   Add this file to .gitignore!\n')
  return keys
}

function hashMachineId(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 32)
}

function main(): void {
  const [,, machineIdArg, shopArg, tierArg] = process.argv
  if (!machineIdArg || !shopArg || !tierArg) {
    console.error('Usage: bun run scripts/license-keygen.ts <machineId> <shopName> <1y|2y|5y>')
    process.exit(1)
  }
  if (!(tierArg in TIER_DAYS)) {
    console.error(`Invalid tier "${tierArg}". Use one of: ${Object.keys(TIER_DAYS).join(', ')}`)
    process.exit(1)
  }

  const keys = loadOrCreateKeys()
  const machineHash = hashMachineId(machineIdArg)
  const expiry = new Date()
  expiry.setDate(expiry.getDate() + TIER_DAYS[tierArg])

  const payload = JSON.stringify({
    m: machineHash,
    s: shopArg,
    e: expiry.toISOString(),
    t: tierArg
  })

  const privateKeyDer = Buffer.from(keys.privateKey, 'base64')
  // Use createSign for Ed25519 signing
  const crypto = require('crypto')
  const privateKeyObj = crypto.createPrivateKey({
    key: privateKeyDer,
    format: 'der',
    type: 'pkcs8'
  })
  const signer = createSign('')
  signer.update(Buffer.from(payload, 'utf8'))
  signer.end()
  const sig = signer.sign(privateKeyObj)

  const payloadB64 = Buffer.from(payload, 'utf8').toString('base64url')
  const sigB64 = sig.toString('base64url')
  const licenseKey = `${payloadB64}.${sigB64}`

  console.log('═══════════════════════════════════════════════════════')
  console.log('  LICENSE KEY GENERATED')
  console.log('═══════════════════════════════════════════════════════')
  console.log(`  Shop:      ${shopArg}`)
  console.log(`  Machine:   ${machineIdArg}`)
  console.log(`  Tier:      ${tierArg}`)
  console.log(`  Expires:   ${expiry.toISOString()}`)
  console.log('───────────────────────────────────────────────────────')
  console.log('  LICENSE KEY (send this to the customer):')
  console.log('───────────────────────────────────────────────────────')
  console.log(licenseKey)
  console.log('═══════════════════════════════════════════════════════')
  console.log('\n  PUBLIC KEY (bake into the app at src/main/license.ts):')
  console.log(keys.publicKey)
  console.log('')
}

main()
