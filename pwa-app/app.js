// ============================================================
// POS Dashboard — Main Application Logic
// ============================================================

// ---- Configuration -------------------------------------------------
const SUPABASE_URL = 'https://wmwnlcqhbfcclqzyunhg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indtd25sY3FoYmZjY2xxenl1bmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwNDM1NTYsImV4cCI6MjA5OTYxOTU1Nn0.XTze6Fx_CajG9KpMcaOo4_tVxMrN0mW54NrR_0T8-QI';
const REFRESH_INTERVAL_MS = 30 * 1000;       // fallback poll if realtime drops

// @supabase/supabase-js only ships as an ES module, so we import it dynamically
// with a couple of CDN fallbacks. (A UMD global build does not exist for v2.)
async function loadSupabase() {
  const cdns = [
    'https://esm.sh/@supabase/supabase-js@2',
    'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm'
  ];
  let lastErr;
  for (const url of cdns) {
    try {
      const mod = await import(url);
      const createClient = mod.createClient || mod.default?.createClient;
      if (typeof createClient === 'function') return createClient;
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Supabase failed to load');
}

const createClient = await loadSupabase();
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Pairing code format: XXXX-XXXX (uppercase, Crockford-ish alphabet).
const PAIR_CODE_RE = /^[A-Z2-9]{4}-[A-Z2-9]{4}$/;

function parsePairingUrl(raw) {
  try {
    const u = new URL(raw);
    const code = (u.searchParams.get('code') || '').trim().toUpperCase();
    if (!PAIR_CODE_RE.test(code)) return null;
    return { shopId: u.searchParams.get('shop') || null, code };
  } catch {
    return null;
  }
}

// Look up the shop for a pairing code via Supabase. Rejects expired codes so an
// old QR / stale code can't be reused after PAIRING_CODE_TTL_MINUTES.
async function resolveCodeToShop(code) {
  const { data, error } = await supabase
    .from('shops')
    .select('id, name, currency, pairing_code_expires_at')
    .eq('pairing_code', code)
    .maybeSingle();
  if (error || !data) return null;
  if (data.pairing_code_expires_at) {
    const expiresAt = new Date(data.pairing_code_expires_at).getTime();
    if (expiresAt <= Date.now()) return null;
  }
  return data;
}

// ---- State -----------------------------------------------------------
let shopId = null;
let shopCurrency = 'Rs';
let pollTimer = null;
let realtimeChannels = [];
let productCache = [];      // local mirror for stock-movement category lookup
let categoryCache = [];

// camera scanning state
let scanStream = null;
let scanRAF = null;
const scanCanvas = document.createElement('canvas');
const scanCtx = scanCanvas.getContext('2d', { willReadFrequently: true });

// ---- DOM refs ----------------------------------------------------------
const el = (id) => document.getElementById(id);
const loginScreen = el('login-screen');
const appEl = el('app');
const loadingOverlay = el('loading-overlay');
const offlineIndicator = el('offline-indicator');
const toastEl = el('toast');

const scanVideo = el('scan-video');
const scanStatus = el('scan-status');
const startScanBtn = el('start-scan-btn');
const manualPairForm = el('manual-pair-form');
const pairCodeInput = el('pair-code');
const pairError = el('pair-error');

const shopNameEl = el('shop-name');
const shopCurrencyEl = el('shop-currency');
const lastUpdatedEl = el('last-updated');
const logoutBtn = el('logout-btn');

// ============================================================
// Init
// ============================================================
function init() {
  window.addEventListener('online', () => {
    offlineIndicator.hidden = true;
    loadDashboardData();
  });
  window.addEventListener('offline', () => {
    offlineIndicator.hidden = false;
  });
  if (!navigator.onLine) offlineIndicator.hidden = false;

  startScanBtn.addEventListener('click', () => {
    if (scanStream) stopScanning(); else startScanning();
  });
  manualPairForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = pairCodeInput.value.trim().toUpperCase();
    if (code) handleManualPair(code);
  });

  // Tabs
  el('tab-dashboard').addEventListener('click', () => switchTab('dashboard'));
  el('tab-products').addEventListener('click', () => switchTab('products'));
  el('add-product-btn').addEventListener('click', openProductModal);
  el('product-search').addEventListener('input', (e) => renderProductList(e.target.value));

  // Modal close
  el('modal-root').addEventListener('click', (e) => {
    if (e.target.dataset.close !== undefined) closeModal();
  });

  // A scanned QR opened this PWA as a URL: <pwa>/?code=<XXXX-XXXX>.
  const fromUrl = parsePairingUrl(window.location.href);
  if (fromUrl) {
    void handleManualPair(fromUrl.code);
    return;
  }

  const storedShopId = sessionStorage.getItem('shopId');
  if (storedShopId) {
    shopId = storedShopId;
    initializeApp();
  } else {
    loginScreen.hidden = false;
    appEl.hidden = true;
  }
}

function showLoginScreen() {
  loginScreen.hidden = false;
  appEl.hidden = true;
}

function showApp() {
  loginScreen.hidden = true;
  appEl.hidden = false;
  stopScanning();
}

function switchTab(tab) {
  const isDash = tab === 'dashboard';
  el('view-dashboard').hidden = !isDash;
  el('view-products').hidden = isDash;
  el('tab-dashboard').classList.toggle('active', isDash);
  el('tab-products').classList.toggle('active', !isDash);
  el('tab-dashboard').setAttribute('aria-selected', String(isDash));
  el('tab-products').setAttribute('aria-selected', String(!isDash));
  if (!isDash) loadProducts();
}

// ============================================================
// Pairing
// ============================================================
async function startScanning() {
  hidePairError();
  if (!('mediaDevices' in navigator) || !navigator.mediaDevices.getUserMedia) {
    showPairError('Camera access is not available on this browser. Use the pairing code instead.');
    return;
  }
  if (typeof jsQR !== 'function') {
    showPairError('QR scanner failed to load. Check your connection and use the pairing code instead.');
    return;
  }
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    scanVideo.srcObject = scanStream;
    await scanVideo.play();
    startScanBtn.textContent = 'Stop camera';
    scanStatus.textContent = 'Scanning…';
    scanFrameLoop();
  } catch (err) {
    console.error('Camera error:', err);
    showPairError('Could not access the camera. Check permissions or use the pairing code.');
    stopScanning();
  }
}

function stopScanning() {
  if (scanRAF) cancelAnimationFrame(scanRAF);
  scanRAF = null;
  if (scanStream) {
    scanStream.getTracks().forEach((t) => t.stop());
    scanStream = null;
  }
  scanVideo.srcObject = null;
  startScanBtn.textContent = 'Turn on camera';
  scanStatus.textContent = 'Point the camera at the QR code shown in the desktop app.';
}

function scanFrameLoop() {
  if (!scanStream) return;
  if (scanVideo.readyState === scanVideo.HAVE_ENOUGH_DATA) {
    scanCanvas.width = scanVideo.videoWidth;
    scanCanvas.height = scanVideo.videoHeight;
    scanCtx.drawImage(scanVideo, 0, 0, scanCanvas.width, scanCanvas.height);
    const imageData = scanCtx.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
    const code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    if (code && code.data) {
      stopScanning();
      handlePairPayload(code.data);
      return;
    }
  }
  scanRAF = requestAnimationFrame(scanFrameLoop);
}

async function handlePairPayload(raw) {
  const fromUrl = parsePairingUrl(raw);
  if (fromUrl) { await handleManualPair(fromUrl.code); return; }
  handleManualPair(raw.trim().toUpperCase());
}

async function handleManualPair(code) {
  if (!PAIR_CODE_RE.test(code)) {
    showPairError('Enter the pairing code exactly as shown, e.g. K7Q2-9M3P.');
    return;
  }
  showPairError('');
  try {
    const shop = await resolveCodeToShop(code);
    if (!shop) {
      showPairError('That pairing code is not valid or has expired. Generate a new code on the desktop app (codes expire after 5 minutes).');
      return;
    }
    connect(shop.id, code);
  } catch (err) {
    console.error('Pairing lookup failed:', err);
    showPairError('Could not verify the code. Check your connection and try again.');
  }
}

function showPairError(message) {
  pairError.textContent = message;
  pairError.hidden = !message;
}
function hidePairError() {
  pairError.hidden = true;
  pairError.textContent = '';
}

// ============================================================
// Connect + data loading
// ============================================================
function connect(id, code) {
  shopId = id;
  sessionStorage.setItem('shopId', id);
  if (code) sessionStorage.setItem('pairCode', code);
  hidePairError();
  initializeApp();
}

async function initializeApp() {
  try {
    const { data: shop, error } = await supabase.from('shops').select('name, currency').eq('id', shopId).single();
    if (error) throw error;

    shopCurrency = shop.currency || 'Rs';
    shopNameEl.textContent = shop.name;
    shopCurrencyEl.textContent = shopCurrency;

    showApp();
    await loadDashboardData({ initial: true });
    setupRealtimeSubscriptions();

    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(() => loadDashboardData(), REFRESH_INTERVAL_MS);
  } catch (error) {
    console.error('Initialization error:', error);
    showToast('Could not connect: ' + error.message);
    logout();
  }
}

async function loadDashboardData({ initial = false } = {}) {
  if (!shopId) return;
  if (initial) showLoading();
  else lastUpdatedEl.textContent = 'Updating…';

  try {
    const now = new Date().toISOString();
    const [shopR, salesTodayR, salesYestR, salesAllR, returnsAllR, inv, shiftR] = await Promise.all([
      supabase.from('shops').select('name, currency').eq('id', shopId).single(),
      supabase.from('sales').select('total, payment_method, created_at, items').eq('shop_id', shopId)
        .gte('created_at', getStartOfDay()).lte('created_at', now),
      supabase.from('sales').select('total').eq('shop_id', shopId)
        .gte('created_at', getStartOfYesterday()).lte('created_at', getEndOfYesterday()),
      supabase.from('sales').select('total, payment_method, created_at, items').eq('shop_id', shopId)
        .gte('created_at', getStartOfDay()).lte('created_at', now),
      supabase.from('returns').select('total, payment_method, created_at').eq('shop_id', shopId)
        .gte('created_at', getStartOfDay()).lte('created_at', now),
      getInventoryData(),
      supabase.from('shifts').select('opening_cash, opened_at, closed_at').eq('shop_id', shopId)
        .order('opened_at', { ascending: false }).limit(1),
    ]);

    if (shopR.data) {
      shopCurrency = shopR.data.currency || 'Rs';
      shopNameEl.textContent = shopR.data.name;
      shopCurrencyEl.textContent = shopCurrency;
    }

    const salesToday = salesTodayR.data || [];
    const totalSales = sum(salesToday, 'total');
    const salesYesterday = sum(salesYestR.data || [], 'total');
    const salesChange = pctChange(totalSales, salesYesterday);

    setText('sales-total', fmt(totalSales));
    setText('sales-count', String(salesToday.length));
    setText('sales-change', fmtPct(salesChange));
    el('sales-change').className = 'sub-value change ' + (salesChange >= 0 ? 'positive' : 'negative');

    // Cash in till + digital
    const cashSales = salesToday.filter((s) => (s.payment_method || 'cash').toLowerCase() === 'cash');
    const digitalSales = salesToday.filter((s) => (s.payment_method || 'cash').toLowerCase() !== 'cash');
    const cashTotal = sum(cashSales, 'total');
    const digitalTotal = sum(digitalSales, 'total');
    const opening = (shiftR.data && shiftR.data[0] && !shiftR.data[0].closed_at)
      ? parseFloat(shiftR.data[0].opening_cash) || 0 : 0;
    setText('cash-in-till', fmt(opening + cashTotal));
    setText('cash-in-till-sub', `opening ${fmt(opening)}`);
    setText('digital-total', fmt(digitalTotal));
    setText('digital-pct', `${totalSales > 0 ? Math.round((digitalTotal / totalSales) * 100) : 0}% of total`);

    // Best category + top products (from sales.items JSON)
    const catAgg = {};   // categoryId -> total
    const prodAgg = {};   // productId -> { name, qty, total }
    const prodNameById = {};
    (inv || []).forEach((p) => { prodNameById[p.id] = p.name; });
    salesToday.forEach((s) => {
      parseItems(s.items).forEach((it) => {
        const cid = it.categoryId || 'unknown';
        catAgg[cid] = (catAgg[cid] || 0) + parseFloat(it.total || 0);
        if (!prodAgg[it.productId]) prodAgg[it.productId] = { name: it.name || prodNameById[it.productId] || 'Item', qty: 0, total: 0 };
        prodAgg[it.productId].qty += it.quantity || 1;
        prodAgg[it.productId].total += parseFloat(it.total || 0);
      });
    });
    const categoryName = (cid) => {
      const c = categoryCache.find((x) => x.id === cid);
      return c ? c.name : (cid === 'unknown' ? 'Uncategorized' : cid);
    };
    const bestCat = Object.entries(catAgg).sort((a, b) => b[1] - a[1])[0];
    setText('best-category-name', bestCat ? categoryName(bestCat[0]) : '—');
    setText('best-category-total', bestCat ? fmt(bestCat[1]) : fmt(0));
    const topProds = Object.entries(prodAgg).sort((a, b) => b[1].total - a[1].total).slice(0, 5);
    renderRanked('top-products', topProds.map(([id, v]) => ({ name: v.name, val: `${v.qty} sold · ${fmt(v.total)}` })));

    // Hourly trend (08:00–22:00)
    const buckets = new Array(15).fill(0); // 8..22 inclusive
    salesToday.forEach((s) => {
      const h = new Date(s.created_at).getHours();
      const idx = h - 8;
      if (idx >= 0 && idx < 15) buckets[idx] += parseFloat(s.total);
    });
    renderHourlyChart(buckets);

    // Cash vs digital donut
    renderDonut(cashTotal, digitalTotal);

    renderPaymentMethods(salesToday, totalSales);
    renderInventory(inv);

    const combined = [
      ...salesAllR.data.map((s) => ({ ...s, type: 'sale' })),
      ...returnsAllR.data.map((r) => ({ ...r, type: 'return' })),
    ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);
    renderTransactions(combined);

    lastUpdatedEl.textContent = 'Updated ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    hideLoading();
  } catch (error) {
    hideLoading();
    lastUpdatedEl.textContent = 'Update failed — will retry';
    console.error('Data loading error:', error);
    showToast('Could not refresh data: ' + error.message);
  }
}

async function getInventoryData() {
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, name, category_id, low_stock_threshold, default_price, active')
    .eq('shop_id', shopId)
    .eq('active', 1);

  if (productsError) throw productsError;
  if (!products || products.length === 0) return [];

  const productIds = products.map((p) => p.id);
  const { data: movements, error: movementsError } = await supabase
    .from('stock_movements')
    .select('product_id, change_amount')
    .in('product_id', productIds);
  if (movementsError) throw movementsError;

  return products.map((product) => {
    const productMovements = (movements || []).filter((m) => m.product_id === product.id);
    const currentStock = productMovements.reduce((s, m) => s + parseFloat(m.change_amount), 0);
    const hasStock = productMovements.length > 0; // has had at least one restock/adjustment
    return {
      ...product,
      currentStock,
      hasStock,
      // Low stock only if it's been stocked at some point AND is now below threshold.
      // Pure 0-with-no-history items are "not yet stocked", not alerts.
      isLowStock: hasStock && currentStock <= product.low_stock_threshold,
    };
  });
}

// ============================================================
// Products (CRUD) + stock movements
// ============================================================
async function loadProducts() {
  try {
    const [pR, cR] = await Promise.all([
      supabase.from('products').select('*').eq('shop_id', shopId).order('name'),
      supabase.from('categories').select('id, name').eq('shop_id', shopId).order('name'),
    ]);
    productCache = pR.data || [];
    categoryCache = cR.data || [];
    await refreshStockCache();
    renderProductList(el('product-search').value);
  } catch (err) {
    console.error('loadProducts failed:', err);
    showToast('Could not load products: ' + err.message);
  }
}

function renderProductList(query) {
  const list = el('product-list');
  const q = (query || '').trim().toLowerCase();
  const items = productCache
    .filter((p) => !q || (p.name || '').toLowerCase().includes(q))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  if (items.length === 0) {
    list.innerHTML = '<p class="empty-state">No products found</p>';
    return;
  }

  list.innerHTML = '';
  items.forEach((p) => {
    const stock = currentStockOf(p.id);
    const low = hasStockOf(p.id) && stock <= (p.low_stock_threshold ?? 0);
    const card = document.createElement('div');
    card.className = 'product-card';
    card.innerHTML = `
      <div class="pc-info">
        <div class="pc-name">${escapeHtml(p.name)}</div>
        <div class="pc-meta">${fmt(parseFloat(p.default_price || 0))} · stock <span class="pc-stock ${low ? 'low' : ''}">${stock}</span></div>
      </div>
      <div class="pc-actions">
        <button class="act-stock" title="Stock movement" aria-label="Stock">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="act-edit" title="Edit" aria-label="Edit">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>
        </button>
        <button class="del" title="Delete" aria-label="Delete">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>
        </button>
      </div>`;
    card.querySelector('.act-stock').addEventListener('click', () => openStockModal(p));
    card.querySelector('.act-edit').addEventListener('click', () => openProductModal(p));
    card.querySelector('.del').addEventListener('click', () => confirmDeleteProduct(p));
    list.appendChild(card);
  });
}

// Compute current stock for a product id from the cached products + a fresh
// stock_movements sum (cheap; products tab is on-demand).
function currentStockOf(productId) {
  // recompute from cloud to stay accurate
  return stockCache[productId]?.stock ?? 0;
}
function hasStockOf(productId) {
  return !!stockCache[productId]?.has;
}
let stockCache = {};
async function refreshStockCache() {
  const { data } = await supabase.from('stock_movements').select('product_id, change_amount').eq('shop_id', shopId);
  stockCache = {};
  (data || []).forEach((m) => {
    if (!stockCache[m.product_id]) stockCache[m.product_id] = { stock: 0, has: true };
    stockCache[m.product_id].stock += parseFloat(m.change_amount);
  });
}

// ---- Product modal (create / edit) ----
function openProductModal(existing) {
  const isEdit = !!existing;
  const p = existing || { name: '', category_id: '', default_price: '', default_discount: '0', low_stock_threshold: '5', active: true };
  const editingId = existing ? existing.id : null;

  const catOptions = categoryCache.map((c) => `<option value="${c.id}" ${c.id === p.category_id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('');
  openModal(`
    <h3>${isEdit ? 'Edit Product' : 'New Product'}</h3>
    <div class="form-field">
      <label>Name</label>
      <input id="pm-name" value="${escapeAttr(p.name)}" placeholder="e.g. Linen Fabric" />
    </div>
    <div class="form-row">
      <div class="form-field">
        <label>Category</label>
        <select id="pm-cat">${catOptions || '<option value="">— none —</option>'}</select>
      </div>
      <div class="form-field">
        <label>Unit price</label>
        <input id="pm-price" type="number" min="0" step="0.01" value="${escapeAttr(p.default_price)}" />
      </div>
    </div>
    <div class="form-row">
      <div class="form-field">
        <label>Default discount %</label>
        <input id="pm-disc" type="number" min="0" max="100" step="1" value="${escapeAttr(p.default_discount)}" />
      </div>
      <div class="form-field">
        <label>Low-stock threshold</label>
        <input id="pm-thr" type="number" min="0" step="1" value="${escapeAttr(p.low_stock_threshold)}" />
      </div>
    </div>
    <div class="form-field switch-row">
      <label>Active (visible in POS)</label>
      <div id="pm-active" class="switch ${p.active ? 'on' : ''}"></div>
    </div>
    <div id="pm-error" class="pair-error" hidden></div>
    <div class="modal-actions">
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn btn-primary" id="pm-save">${isEdit ? 'Save' : 'Create'}</button>
    </div>
  `);

  let active = !!p.active;
  el('pm-active').addEventListener('click', () => {
    active = !active;
    el('pm-active').classList.toggle('on', active);
  });

  el('pm-save').addEventListener('click', async () => {
    const name = el('pm-name').value.trim();
    const categoryId = el('pm-cat').value;
    const price = parseFloat(el('pm-price').value);
    const disc = parseFloat(el('pm-disc').value) || 0;
    const thr = parseInt(el('pm-thr').value, 10);
    const errEl = el('pm-error');

    if (!name) { errEl.textContent = 'Name is required.'; errEl.hidden = false; return; }
    if (isNaN(price) || price < 0) { errEl.textContent = 'Enter a valid price.'; errEl.hidden = false; return; }

    const now = new Date().toISOString();
    const row = {
      shop_id: shopId,
      name,
      category_id: categoryId || '',
      unit_type: 'piece',
      default_price: price,
      default_discount: disc,
      low_stock_threshold: isNaN(thr) ? 5 : thr,
      sku: '',
      barcode: '',
      image_path: null,
      active: active ? 1 : 0,
      updated_at: now,
    };

    try {
      el('pm-save').disabled = true;
      if (isEdit) {
        row.created_at = existing.created_at || now;
        const { error } = await supabase.from('products').update(row).eq('id', editingId).eq('shop_id', shopId);
        if (error) throw error;
        showToast('Product updated');
      } else {
        row.id = crypto.randomUUID();
        row.created_at = now;
        const { error } = await supabase.from('products').upsert(row);
        if (error) throw error;
        showToast('Product created');
      }
      closeModal();
      await loadProducts();
    } catch (err) {
      console.error('save product failed:', err);
      errEl.textContent = 'Save failed: ' + err.message;
      errEl.hidden = false;
      el('pm-save').disabled = false;
    }
  });
}

async function confirmDeleteProduct(p) {
  openModal(`
    <h3>Delete product?</h3>
    <p class="muted-xs">This hides "${escapeHtml(p.name)}" from the POS (soft delete). It stays in history.</p>
    <div class="modal-actions">
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn danger" id="pm-del">Delete</button>
    </div>
  `);
  el('pm-del').addEventListener('click', async () => {
    try {
      const { error } = await supabase.from('products')
        .update({ active: 0, updated_at: new Date().toISOString() })
        .eq('id', p.id).eq('shop_id', shopId);
      if (error) throw error;
      showToast('Product deleted');
      closeModal();
      await loadProducts();
    } catch (err) {
      console.error('delete product failed:', err);
      showToast('Delete failed: ' + err.message);
    }
  });
}

// ---- Stock movement modal ----
function openStockModal(p) {
  openModal(`
    <h3>Stock — ${escapeHtml(p.name)}</h3>
    <div class="form-field">
      <label>Action</label>
      <div class="seg" id="sm-seg">
        <button type="button" data-dir="add" class="active">Restock (add)</button>
        <button type="button" data-dir="remove">Adjust (remove)</button>
      </div>
    </div>
    <div class="form-field">
      <label>Quantity</label>
      <input id="sm-qty" type="number" min="0" step="1" value="1" />
    </div>
    <div class="form-field">
      <label>Reason (optional)</label>
      <input id="sm-reason" placeholder="e.g. new shipment" />
    </div>
    <div id="sm-error" class="pair-error" hidden></div>
    <div class="modal-actions">
      <button class="btn ghost" data-close>Cancel</button>
      <button class="btn btn-primary" id="sm-save">Save movement</button>
    </div>
  `);

  let direction = 'add';
  el('sm-seg').querySelectorAll('button').forEach((b) => {
    b.addEventListener('click', () => {
      direction = b.dataset.dir;
      el('sm-seg').querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b));
    });
  });

  el('sm-save').addEventListener('click', async () => {
    const qty = parseFloat(el('sm-qty').value);
    const reason = el('sm-reason').value.trim() || (direction === 'add' ? 'restock' : 'adjustment');
    const errEl = el('sm-error');
    if (isNaN(qty) || qty <= 0) { errEl.textContent = 'Enter a quantity > 0.'; errEl.hidden = false; return; }

    const change = direction === 'add' ? qty : -qty;
    const categoryName = (categoryCache.find((c) => c.id === p.category_id) || {}).name || p.category_id || '';
    const row = {
      id: crypto.randomUUID(),
      shop_id: shopId,
      product_id: p.id,
      category: categoryName,
      change_amount: change,
      reason,
      created_at: new Date().toISOString(),
      synced: 0,
      updated_at: new Date().toISOString(),
    };

    try {
      el('sm-save').disabled = true;
      const { error } = await supabase.from('stock_movements').insert(row);
      if (error) throw error;
      showToast('Stock movement saved');
      closeModal();
      await loadProducts();
    } catch (err) {
      console.error('stock movement failed:', err);
      errEl.textContent = 'Save failed: ' + err.message;
      errEl.hidden = false;
      el('sm-save').disabled = false;
    }
  });
}

// ---- Modal helpers ----
function openModal(html) {
  el('modal-body').innerHTML = html;
  el('modal-root').hidden = false;
}
function closeModal() {
  el('modal-root').hidden = true;
  el('modal-body').innerHTML = '';
}

// ============================================================
// Rendering
// ============================================================
function renderPaymentMethods(salesToday, totalSales) {
  const totals = {};
  salesToday.forEach((s) => {
    const m = (s.payment_method || 'cash');
    totals[m] = (totals[m] || 0) + parseFloat(s.total);
  });
  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const box = el('payment-method');
  box.innerHTML = '';
  if (entries.length === 0) { box.innerHTML = '<p class="empty-state">No sales yet today</p>'; return; }
  entries.forEach(([method, amount]) => {
    const pct = totalSales > 0 ? Math.round((amount / totalSales) * 100) : 0;
    const row = document.createElement('div');
    row.className = 'payment-row';
    row.innerHTML = `
      <div class="payment-row-top">
        <span class="pm-name">${escapeHtml(method)}</span>
        <span class="pm-amount">${fmt(amount)}</span>
      </div>
      <div class="payment-bar-track"><div class="payment-bar-fill" style="width:${pct}%"></div></div>`;
    box.appendChild(row);
  });
}

function renderInventory(inventory) {
  const box = el('inventory-list');
  const badge = el('low-stock-badge');
  // Show ONLY products below their low-stock threshold (the alert list).
  const low = (inventory || []).filter((i) => i.isLowStock);

  if (low.length === 0) {
    box.innerHTML = '<p class="empty-state">All products well stocked</p>';
    badge.hidden = true;
    return;
  }

  badge.hidden = false;
  badge.textContent = `${low.length} low`;

  const sorted = [...low].sort((a, b) => a.currentStock - b.currentStock); // most urgent first
  box.innerHTML = '';
  sorted.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'inventory-item';
    div.innerHTML = `
      <span class="item-name">${escapeHtml(item.name)}</span>
      <span class="item-stock low-stock">${item.currentStock} left</span>`;
    box.appendChild(div);
  });
}

function renderTransactions(transactions) {
  const box = el('recent-transactions');
  box.innerHTML = '';
  if (!transactions || transactions.length === 0) { box.innerHTML = '<p class="empty-state">No recent transactions</p>'; return; }
  transactions.forEach((t) => {
    const div = document.createElement('div');
    div.className = `transaction-item ${t.type}`;
    div.innerHTML = `
      <span class="transaction-type">${t.type === 'return' ? 'RETURN' : 'SALE'}</span>
      <span class="transaction-amount">${fmt(parseFloat(t.total))}</span>
      <span class="transaction-time">${new Date(t.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>`;
    box.appendChild(div);
  });
}

function renderRanked(id, items) {
  const box = el(id);
  if (!items || items.length === 0) { box.innerHTML = '<li class="empty-state">No sales yet</li>'; return; }
  box.innerHTML = '';
  items.forEach((it) => {
    const li = document.createElement('li');
    li.innerHTML = `<span class="rp-name">${escapeHtml(it.name)}</span><span class="rp-val">${escapeHtml(it.val)}</span>`;
    box.appendChild(li);
  });
}

function renderHourlyChart(buckets) {
  const max = Math.max(1, ...buckets);
  const box = el('hourly-chart');
  box.innerHTML = '';
  buckets.forEach((v) => {
    const h = Math.round((v / max) * 100);
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.innerHTML = `<div class="bar ${v === 0 ? 'empty' : ''}" style="height:${h}%"></div>`;
    box.appendChild(col);
  });
}

function renderDonut(cash, digital) {
  const total = cash + digital;
  const cashDeg = total > 0 ? (cash / total) * 360 : 0;
  const donut = el('cash-digital-donut');
  donut.style.background = `conic-gradient(var(--teal) 0deg, var(--teal) ${cashDeg}deg, var(--border-2) ${cashDeg}deg)`;
  setText('donut-cash', fmt(cash));
  setText('donut-digital', fmt(digital));
}

// ============================================================
// Realtime
// ============================================================
function setupRealtimeSubscriptions() {
  teardownRealtimeSubscriptions();
  const salesChannel = supabase.channel(`sales-changes-${shopId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sales', filter: `shop_id=eq.${shopId}` }, () => loadDashboardData())
    .subscribe();
  const stockChannel = supabase.channel(`stock-changes-${shopId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'stock_movements', filter: `shop_id=eq.${shopId}` }, () => { refreshStockCache(); loadDashboardData(); })
    .subscribe();
  realtimeChannels = [salesChannel, stockChannel];
}
function teardownRealtimeSubscriptions() {
  realtimeChannels.forEach((ch) => supabase.removeChannel(ch));
  realtimeChannels = [];
}

// ============================================================
// Helpers
// ============================================================
function getStartOfDay() { const d = new Date(); d.setHours(0, 0, 0, 0); return d.toISOString(); }
function getStartOfYesterday() { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(0, 0, 0, 0); return d.toISOString(); }
function getEndOfYesterday() { const d = new Date(); d.setDate(d.getDate() - 1); d.setHours(23, 59, 59, 999); return d.toISOString(); }

function sum(rows, key) { return (rows || []).reduce((s, r) => s + parseFloat(r[key] || 0), 0); }
function pctChange(current, previous) { if (previous === 0) return current === 0 ? 0 : 100; return ((current - previous) / previous) * 100; }
function fmt(amount) { return parseFloat(amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function fmtPct(v) { return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`; }
function setText(id, text) { const e = el(id); if (e) e.textContent = text; }
function parseItems(json) {
  if (!json) return [];
  try {
    const arr = typeof json === 'string' ? JSON.parse(json) : json;
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = String(str ?? '');
  return d.innerHTML;
}
function escapeAttr(str) {
  return String(str ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function showLoading() { loadingOverlay.hidden = false; }
function hideLoading() { loadingOverlay.hidden = true; }

let toastTimer = null;
function showToast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toastEl.hidden = true; }, 4000);
}

function logout() {
  teardownRealtimeSubscriptions();
  if (pollTimer) clearInterval(pollTimer);
  sessionStorage.removeItem('shopId');
  shopId = null;
  showLoginScreen();
}

logoutBtn.addEventListener('click', logout);
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
