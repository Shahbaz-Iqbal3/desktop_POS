'use strict'

const fmt = (n) => (typeof n === 'number' ? n.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0')
const money = (n, cur = 'Rs') => `${cur} ${fmt(n)}`

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
    renderGlobal(data.global)
    renderPerShop(data.perShop)
    renderLowStock(data.lowStock)
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
    card('Sales (all)', money(g.salesAll), `${fmt(g.salesAllCount)} sales`),
    card('Sales (today)', money(g.salesToday), `${fmt(g.salesTodayCount)} sales`),
    card('Cash / Digital', money(g.cashAll), `dig ${money(g.digitalAll)}`),
    card('Products', fmt(g.products), `${fmt(g.activeProducts)} active`),
    card('Low stock', fmt(g.lowStock), 'below threshold'),
    card('Stock movements', fmt(g.stockMovements)),
    card('Returns', fmt(g.returns), `ref ${money(g.refundTotal)}`)
  ].join('')
}

function renderPerShop(rows) {
  const tb = document.getElementById('perShop')
  if (!rows || rows.length === 0) { tb.innerHTML = '<tr><td colspan="6" class="p-3 text-slate-500">No shops found.</td></tr>'; return }
  tb.innerHTML = rows.map((s) => `<tr class="hover:bg-slate-800/50">
    <td class="p-3 font-medium">${escapeHtml(s.name)}</td>
    <td class="p-3 text-right stat">${money(s.salesAll, s.currency)}</td>
    <td class="p-3 text-right stat">${money(s.salesToday, s.currency)}</td>
    <td class="p-3 text-right stat text-xs">${money(s.cashAll, s.currency)} / ${money(s.digitalAll, s.currency)}</td>
    <td class="p-3 text-right stat">${fmt(s.products)} <span class="text-slate-500">(${fmt(s.activeProducts)})</span></td>
    <td class="p-3 text-right stat ${s.lowStock > 0 ? 'text-red-400' : 'text-emerald-400'}">${fmt(s.lowStock)}</td>
  </tr>`).join('')
}

function renderLowStock(list) {
  const el = document.getElementById('lowStock')
  if (!list || list.length === 0) { el.innerHTML = '<div class="p-3 text-slate-500 text-sm">All products well stocked.</div>'; return }
  el.innerHTML = list.map((i) => `<div class="p-3 flex items-center justify-between text-sm">
    <span>${escapeHtml(i.shopName)} · <span class="text-slate-400">${escapeHtml(i.product)}</span></span>
    <span class="stat text-red-400">${fmt(i.stock)} / ${fmt(i.threshold)}</span>
  </div>`).join('')
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
    if (parts.length !== 2) throw new Error('Malformed license key')
    const [payloadB64, sigB64] = parts
    const payloadJson = new TextDecoder().decode(b64urlToBytes(payloadB64))

    const { pub } = await fetch('/api/license-pubkey').then((r) => r.json())
    const keyObj = await crypto.subtle.importKey('spki', b64ToBytes(pub), 'Ed25519', true, ['verify'])
    const ok = await crypto.subtle.verify('Ed25519', keyObj, b64urlToBytes(sigB64), new TextEncoder().encode(payloadJson))

    let payload = {}
    try { payload = JSON.parse(payloadJson) } catch {}
    const expectedHash = await sha256Hex(machineId)
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

function b64urlToBytes(s) {
  return b64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/'))
}
function b64ToBytes(b64) {
  const bin = atob(b64)
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
