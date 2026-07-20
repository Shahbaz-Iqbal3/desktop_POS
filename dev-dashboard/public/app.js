'use strict'

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0')

function showError(msg) {
  const el = document.getElementById('error')
  if (!msg) { el.classList.add('hidden'); return }
  el.textContent = msg
  el.classList.remove('hidden')
}

async function loadStats() {
  showError(null)
  try {
    const res = await fetch('/api/stats')
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      throw new Error(j.error || `Stats request failed (${res.status})`)
    }
    const data = await res.json()
    document.getElementById('generatedAt').textContent = new Date(data.generatedAt).toLocaleString()
    renderGlobal(data.global)
    renderPerShop(data.perShop)
  } catch (e) {
    showError(String(e.message || e))
  }
}

function card(label, value, sub) {
  return `<div class="card rounded-lg p-4">
    <div class="text-xs text-slate-400">${label}</div>
    <div class="text-lg font-semibold text-slate-100 stat mt-1">${value}</div>
    ${sub ? `<div class="text-[11px] text-slate-500 mt-0.5">${sub}</div>` : ''}
  </div>`
}

function renderGlobal(g) {
  const el = document.getElementById('global')
  if (!g) { el.innerHTML = ''; return }
  el.innerHTML = [
    card('Shops', fmt(g.shops)),
    card('Total data rows', fmt(g.totalRows), 'sales+products+movements+returns'),
    card('Sales rows', fmt(g.salesRows), `${fmt(g.salesTodayRows)} today`),
    card('Products', fmt(g.products), `${fmt(g.activeProducts)} active`),
    card('Stock movements', fmt(g.stockMovements)),
    card('Returns', fmt(g.returnsRows), `ref ${fmt(g.refundTotal)}`),
    card('Low stock', fmt(g.lowStock), 'below threshold'),
    card('Avg rows / shop', fmt(g.shops ? Math.round(g.totalRows / g.shops) : 0))
  ].join('')
}

function renderPerShop(rows) {
  const tb = document.getElementById('perShop')
  if (!rows || rows.length === 0) { tb.innerHTML = '<tr><td colspan="7" class="p-3 text-slate-500">No shops found.</td></tr>'; return }
  const total = rows.reduce((a, s) => a + s.totalRows, 0) || 1
  tb.innerHTML = rows.map((s) => {
    const pct = ((s.totalRows / total) * 100).toFixed(1)
    return `<tr class="hover:bg-slate-800/50">
      <td class="p-3 font-medium">${escapeHtml(s.name)}</td>
      <td class="p-3 text-right stat">${fmt(s.salesRows)}</td>
      <td class="p-3 text-right stat">${fmt(s.products)}</td>
      <td class="p-3 text-right stat">${fmt(s.movements)}</td>
      <td class="p-3 text-right stat">${fmt(s.returnsRows)}</td>
      <td class="p-3 text-right stat">${fmt(s.totalRows)}</td>
      <td class="p-3">
        <div class="flex items-center gap-2">
          <div class="bar flex-1"><span style="width:${pct}%"></span></div>
          <span class="stat text-xs text-slate-400 w-12 text-right">${pct}%</span>
        </div>
      </td>
    </tr>`
  }).join('')
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
}

// ---- License generation ----
document.getElementById('genBtn').addEventListener('click', async () => {
  const machineId = document.getElementById('machineId').value.trim()
  const shopName = document.getElementById('shopName').value.trim()
  const tier = document.getElementById('tier').value
  const secret = document.getElementById('signSecret').value
  const resultEl = document.getElementById('genResult')
  resultEl.classList.add('hidden')
  try {
    const res = await fetch('/api/license', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-sign-secret': secret },
      body: JSON.stringify({ machineId, shopName, tier })
    })
    const j = await res.json()
    if (!res.ok) throw new Error(j.error || `Generate failed (${res.status})`)
    document.getElementById('genKey').textContent = j.licenseKey
    document.getElementById('genExpiry').textContent = new Date(j.expiry).toLocaleString()
    resultEl.classList.remove('hidden')
  } catch (e) {
    alert(String(e.message || e))
  }
})

document.getElementById('copyKey').addEventListener('click', () => {
  const t = document.getElementById('genKey').textContent
  navigator.clipboard.writeText(t)
})

// ---- License verification (Ed25519, in browser) ----
document.getElementById('verifyBtn').addEventListener('click', async () => {
  const out = document.getElementById('verifyResult')
  out.classList.remove('hidden')
  try {
    const key = document.getElementById('verifyKey').value.trim()
    const machineId = document.getElementById('verifyMachine').value.trim()
    const parts = key.split('.')
    if (parts.length !== 2) throw new Error('Malformed license key (expected payload.signature)')
    const [payloadB64, sigB64] = parts
    const payloadJson = new TextDecoder().decode(b64ToBytes(payloadB64))

    const pkRes = await fetch('/api/license-pubkey')
    if (!pkRes.ok) throw new Error('Could not load public key')
    const { publicKey: pub } = await pkRes.json()
    if (!pub) throw new Error('Server missing LICENSE_PUBLIC_KEY')

    const keyObj = await crypto.subtle.importKey('spki', b64ToBytes(pub), 'Ed25519', true, ['verify'])
    const ok = await crypto.subtle.verify('Ed25519', keyObj, b64ToBytes(sigB64), new TextEncoder().encode(payloadJson))

    let payload = {}
    try { payload = JSON.parse(payloadJson) } catch {}
    const expectedHash = machineId ? await sha256Hex(machineId) : ''
    const machineOk = !machineId || payload.m === expectedHash

    out.className = 'block text-xs bg-slate-900 border rounded-md p-2 ' + (ok && machineOk ? 'border-emerald-700 text-emerald-300' : 'border-red-700 text-red-300')
    out.textContent = JSON.stringify({
      signatureValid: ok,
      machineMatches: machineOk,
      shop: payload.s,
      tier: payload.t,
      expires: payload.e
    }, null, 2)
  } catch (e) {
    out.className = 'block text-xs bg-slate-900 border border-red-700 text-red-300 rounded-md p-2'
    out.textContent = String(e.message || e)
  }
})

// Robust base64/base64url -> bytes: normalizes url-safe chars and pads.
function b64ToBytes(b64) {
  let s = String(b64).replace(/-/g, '+').replace(/_/g, '/')
  while (s.length % 4) s += '='
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}
async function sha256Hex(raw) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32)
}

document.getElementById('refresh').addEventListener('click', loadStats)
loadStats()
