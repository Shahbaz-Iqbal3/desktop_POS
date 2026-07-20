// Printer integration — runs in the MAIN PROCESS.
// Uses node-thermal-printer for ESC/POS USB thermal printers.
import { BrowserWindow, ipcMain } from 'electron'
import * as fs from 'fs'
import { printer as ThermalPrinterConstructor, PrinterTypes } from 'node-thermal-printer'
import type { Sale, SaleReturn } from '@shared/types'
import { getSetting, getLastSale } from './db'
import pngjs from 'pngjs'
import * as bwipjs from 'bwip-js/node'

// Used to rasterize the receipt logo into ESC/POS bitmap bytes (see buildLogoBuffer).
const { PNG } = pngjs

type PrinterInstance = InstanceType<typeof ThermalPrinterConstructor>

let printerInstance: PrinterInstance | null = null
let printerInstanceName: string | null = null

function getPrinter(): PrinterInstance | null {
  const printerName = getSetting('printerName')
  if (!printerName) {
    printerInstance = null
    printerInstanceName = null
    return null
  }

  const isExplicitInterface = /^(tcp|serial|usb):/i.test(printerName)
  if (!printerInstance || printerInstanceName !== printerName) {
    printerInstance = new ThermalPrinterConstructor({
      type: PrinterTypes.EPSON,
      interface: isExplicitInterface ? printerName : `printer:${printerName}`,
      options: { timeout: 5000 },
      width: 48
    })
    printerInstanceName = printerName
  }
  return printerInstance
}

export async function getPrinters(): Promise<string[]> {
  try {
    const win = BrowserWindow.getAllWindows()[0]
    if (!win) return []
    const wc = win.webContents as unknown as { 
      getPrintersAsync?: () => Promise<Array<{ name?: string; displayName?: string }>>
      getPrinters?: () => Array<{ name?: string; displayName?: string }> 
    }
    const list = wc.getPrintersAsync ? await wc.getPrintersAsync() : wc.getPrinters?.() ?? []
    return list.map((p) => (p.name ?? p.displayName ?? '').trim()).filter(Boolean)
  } catch {
    return []
  }
}

// Convert raw RGBA pixels into ESC/POS raster bitmap bytes (GS v 0).
// Works for ANY ESC/POS thermal printer regardless of its built-in barcode
// firmware, because we send a plain bitmap — the same mechanism the receipt
// logo uses. `invert` flips black/white if the source is light-on-dark.
function pixelsToEscPosBuffer(
  width: number,
  height: number,
  rgba: Uint8Array | Buffer
): Buffer {
  const bytesPerRow = Math.ceil(width / 8)
  const image = Buffer.alloc(bytesPerRow * height)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2
      const lum = 0.299 * rgba[idx] + 0.587 * rgba[idx + 1] + 0.114 * rgba[idx + 2]
      if (lum < 128) {
        const byteIndex = y * bytesPerRow + (x >> 3)
        image[byteIndex] |= 0x80 >> (x & 7)
      }
    }
  }
  const header = Buffer.from([
    0x1d, 0x76, 0x30, 0x00,
    bytesPerRow & 0xff, (bytesPerRow >> 8) & 0xff,
    height & 0xff, (height >> 8) & 0xff
  ])
  return Buffer.concat([header, image])
}

// Convert a PNG file into ESC/POS raster bitmap bytes (GS v 0).
// node-thermal-printer's own printImage only works for the OS `printer:` adapter,
// not for the stdout/tcp interfaces our virtual printer uses — so we emit the
// raster command ourselves. Returns null if the image can't be read.
function buildLogoBuffer(pngPath: string): Buffer | null {
  try {
    const png = PNG.sync.read(fs.readFileSync(pngPath))
    return pixelsToEscPosBuffer(png.width, png.height, png.data)
  } catch {
    return null
  }
}

// Decode a PNG data URL (base64) into ESC/POS raster bitmap bytes.
function dataUrlToEscPosBuffer(dataUrl: string): Buffer | null {
  try {
    const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')
    const png = PNG.sync.read(Buffer.from(base64, 'base64'))
    return pixelsToEscPosBuffer(png.width, png.height, png.data)
  } catch {
    return null
  }
}

// Render a CODE128 barcode to a PNG (only used as a last-resort fallback when the
// renderer did not supply a pre-rendered image).
function buildBarcodeBuffer(code: string): Buffer | null {
  try {
    const png = bwipjs.toBuffer({
      bcid: 'code128',
      text: code,
      scale: 4,
      height: 16,
      includetext: true,
      textxalign: 'center',
      backgroundcolor: 'FFFFFF'
    }) as unknown as Buffer
    const decoded = PNG.sync.read(png)
    return pixelsToEscPosBuffer(decoded.width, decoded.height, decoded.data)
  } catch {
    return null
  }
}

function buildReceiptBuffer(sale: Sale, shopName: string): Buffer {
  const p = new ThermalPrinterConstructor({ type: PrinterTypes.EPSON, interface: 'stdout', width: 48 })

  const address = getSetting('shopAddress')
  const phone = getSetting('shopPhone')
  const tagline = getSetting('receiptTagline')
  const footer = getSetting('receiptFooter')
  const logoPath = getSetting('receiptLogoPath')
  const showLogo = getSetting('receiptShowLogo') === 'true'

  // Sale ID (short form matches the Sales/Returns screen "#XXXXYYYY" display).
  const saleShort = (sale.id ?? '').slice(0, 8).toUpperCase()

  // --- Header (centered) ---
  p.alignCenter()
  if (showLogo && logoPath) {
    const logo = buildLogoBuffer(logoPath)
    if (logo) p.append(logo)
    p.println('')
  }

  // Shop name: large, bold, centered.
  p.alignCenter()
  p.setTextQuadArea()
  p.bold(true)
  p.println((shopName || 'MY SHOP').toUpperCase())
  p.setTextNormal()
  p.bold(false)

  // Supporting details: centered, with breathing room.
  p.alignCenter()
  if (tagline) p.println(tagline)
  if (address) p.println(address)
  if (phone) p.println(phone)
  p.println(new Date(sale.createdAt).toLocaleString())

  // Sale ID, centered and emphasized so it can be matched in the Sales screen.
  p.bold(true)
  p.println(`SALE #${saleShort}`)
  p.bold(false)

  // Divider between header and items.
  p.alignLeft()
  p.tableCustom([{ text: '------------------------------------------------', align: 'LEFT', width: 1.0 }])

  // --- Column header ---
  p.alignLeft()
  p.bold(true)
  p.tableCustom([
    { text: 'ITEM', align: 'LEFT', width: 0.50 },
    { text: 'QTY', align: 'RIGHT', width: 0.16 },
    { text: 'PRICE', align: 'RIGHT', width: 0.34 }
  ])
  p.bold(false)
  
  // FIX: Separation line using table width mechanics
  p.tableCustom([{ text: '------------------------------------------------', align: 'LEFT', width: 1.0 }])

  // --- Items ---
  for (const item of sale.items) {
    const qtyLabel = item.unitType === 'thaan' ? `${item.quantity}m (${item.cutLength || item.quantity}m)` : `${item.quantity}x`
    p.tableCustom([
      { text: item.name, align: 'LEFT', width: 0.50 },
      { text: qtyLabel, align: 'RIGHT', width: 0.16 },
      { text: `Rs ${item.lineTotal.toFixed(2)}`, align: 'RIGHT', width: 0.34 }
    ])

    if (item.discount && item.discount > 0) {
      const discAmount = (item.quantity * item.price * item.discount) / 100
      p.tableCustom([
        { text: `  Disc ${item.discount}%`, align: 'LEFT', width: 0.50 },
        { text: '', align: 'RIGHT', width: 0.16 },
        { text: `- Rs ${discAmount.toFixed(2)}`, align: 'RIGHT', width: 0.34 }
      ])
    }
  }
  
  // FIX: Separation line using table width mechanics
  p.tableCustom([{ text: '------------------------------------------------', align: 'LEFT', width: 1.0 }])

  // --- Totals (FIX: Handled via tableCustom to align perfectly with the headers above) ---
  const change = Math.max(0, sale.actualPaidPrice - sale.total)

  p.tableCustom([
    { text: 'SUBTOTAL:', align: 'RIGHT', width: 0.66 },
    { text: `Rs ${sale.total.toFixed(2)}`, align: 'RIGHT', width: 0.34 }
  ])
  p.tableCustom([
    { text: `PAID (${sale.paymentMethod.toUpperCase()}):`, align: 'RIGHT', width: 0.66 },
    { text: `Rs ${sale.actualPaidPrice.toFixed(2)}`, align: 'RIGHT', width: 0.34 }
  ])
  p.tableCustom([
    { text: 'CHANGE:', align: 'RIGHT', width: 0.66 },
    { text: `Rs ${change.toFixed(2)}`, align: 'RIGHT', width: 0.34 }
  ])
  
  p.bold(true)
  p.tableCustom([
    { text: 'TOTAL:', align: 'RIGHT', width: 0.66 },
    { text: `Rs ${sale.total.toFixed(2)}`, align: 'RIGHT', width: 0.34 }
  ])
  p.bold(false)

  // FIX: Final bounding line
  p.tableCustom([{ text: '------------------------------------------------', align: 'LEFT', width: 1.0 }])

  // --- Footer ---
  p.alignCenter()
  if (footer) {
    for (const line of footer.split('\n')) p.println(line)
  }
  p.println('Thank you for your business!')
  p.println('Visit us again')
  p.cut()

  return Buffer.from(p.getBuffer() as unknown as ArrayBuffer)
}


function describePrintError(err: unknown, printerName?: string | null): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/no driver/i.test(msg)) {
    return 'No printer driver available — choose "No printer" in settings to skip printing'
  }
  if (/ECONNREFUSED|ENOTFOUND|getaddrinfo|timed out|Socket timeout|ECONNRESET/i.test(msg)) {
    const target = printerName ? ` at ${printerName}` : ''
    return `Could not reach printer${target} — make sure it is on and listening`
  }
  return msg
}

export async function printReceipt(sale: Sale): Promise<{ ok: boolean; error?: string }> {
  const printer = getPrinter()
  if (!printer) {
    return { ok: false, error: 'No printer configured (set printerName in settings)' }
  }
  const shopName = getSetting('shopName') ?? 'My Shop'
  try {
    const buffer = buildReceiptBuffer(sale, shopName)
    
    // FIX: Clear the global memory cache before appending data streams
    printer.clear()
    printer.append(buffer)

    const executed = (await printer.execute()) as unknown as boolean | undefined
    
    // FIX: Flush out the data immediately after execution finishes
    printer.clear()

    if (executed === false) {
      console.warn('[printer] execute returned false')
      return { ok: false, error: 'Printer execute returned false' }
    }
    return { ok: true }
  } catch (err) {
    const msg = describePrintError(err, getSetting('printerName'))
    console.error('[printer] print failed (sale still saved):', msg)
    return { ok: false, error: msg }
  }
}

export async function reprintLastReceipt(): Promise<{ ok: boolean; error?: string }> {
  const last = getLastSale()
  if (!last) return { ok: false, error: 'No previous sale to reprint' }
  return printReceipt(last)
}

export async function printRefundReceipt(ret: SaleReturn): Promise<{ ok: boolean; error?: string }> {
  const printer = getPrinter()
  if (!printer) {
    return { ok: false, error: 'No printer configured (set printerName in settings)' }
  }
  const shopName = getSetting('shopName') ?? 'My Shop'
  try {
    const p = new ThermalPrinterConstructor({ type: PrinterTypes.EPSON, interface: 'stdout', width: 48 })

    // --- Header (Centered, Match Store Invoice Style) ---
    p.alignCenter()
    if (getSetting('receiptShowLogo') === 'true') {
      const logoPath = getSetting('receiptLogoPath')
      if (logoPath) {
        const logo = buildLogoBuffer(logoPath)
        if (logo) {
          p.append(logo)
          p.println('')
        }
      }
    }
    p.setTextQuadArea()
    p.bold(true)
    p.println(shopName.toUpperCase())
    p.setTextNormal()
    p.bold(false)
    
    p.println('*** REFUND / RETURN ***')
    p.println(`Date: ${new Date(ret.createdAt).toLocaleString()}`)
    p.println(`Refund ID: ${ret.id.slice(0, 8).toUpperCase()}`)
    p.println(`Orig Sale ID: ${ret.saleId.slice(0, 8).toUpperCase()}`)
    p.println(`Payment: ${ret.paymentMethod.toUpperCase()}`)
    p.drawLine()

    // --- Dynamic Column Alignment Fix ---
    p.alignLeft()
    p.bold(true)
    p.tableCustom([
      { text: 'RETURNED ITEM', align: 'LEFT', width: 0.50 },
      { text: 'QTY', align: 'RIGHT', width: 0.16 },
      { text: 'TOTAL', align: 'RIGHT', width: 0.34 }
    ])
    p.bold(false)
    p.drawLine()

    for (const item of ret.items) {
      const qtyLabel = item.unitType === 'thaan' 
        ? `${item.quantity}m${item.cutLength ? ` (${item.cutLength}m)` : ''}` 
        : `${item.quantity}x`
        
      p.tableCustom([
        { text: item.name, align: 'LEFT', width: 0.50 },
        { text: qtyLabel, align: 'RIGHT', width: 0.16 },
        { text: `Rs ${item.lineTotal.toFixed(2)}`, align: 'RIGHT', width: 0.34 }
      ])
    }
    p.drawLine()

    // --- Totals Block Alignment ---
    p.alignRight()
    p.bold(true)
    p.tableCustom([
      { text: 'TOTAL REFUNDED:', align: 'LEFT', width: 0.55 },
      { text: `Rs ${ret.refundAmount.toFixed(2)}`, align: 'RIGHT', width: 0.45 }
    ])
    p.bold(false)
    p.drawLine()

    p.alignCenter()
    p.println('Sorry for the inconvenience!')
    p.cut()

    const buffer = Buffer.from(p.getBuffer() as unknown as ArrayBuffer)
    
    // FIX: Clear historical state prior to appending new buffers
    printer.clear()
    printer.append(buffer)
    
    const executed = (await printer.execute()) as unknown as boolean | undefined
    
    // FIX: Wipe clean again post-execution
    printer.clear()

    if (executed === false) {
      return { ok: false, error: 'Printer execute returned false' }
    }
    return { ok: true }
  } catch (err) {
    const msg = describePrintError(err, getSetting('printerName'))
    console.error('[printer] refund print failed:', msg)
    return { ok: false, error: msg }
  }
}

// Resolve the barcode-label printer target from settings, falling back to the
// receipt printer. Returns the raw name (may be empty).
function getBarcodePrinterName(): string {
  const barcodePrinterName = getSetting('barcodePrinterName')
  return barcodePrinterName && barcodePrinterName.trim()
    ? barcodePrinterName.trim()
    : (getSetting('printerName') ?? '').trim()
}

// A target is driven via ESC/POS when it's an explicit thermal interface
// (tcp/serial/usb), carries a `printer:` prefix, or equals the receipt printer
// (which is configured as an ESC/POS thermal printer). Any other plain OS
// printer name (e.g. "HP LaserJet") is treated as a regular OS/GDI printer and
// printed through the operating system instead.
function isThermalTarget(target: string): boolean {
  if (!target) return false
  if (/^(tcp|serial|usb):/i.test(target)) return true
  if (target.startsWith('printer:')) return true
  const receipt = (getSetting('printerName') ?? '').trim()
  if (receipt && target === receipt) return true
  return false
}

// Build an ESC/POS thermal printer instance for the given target.
function buildThermalPrinter(target: string): PrinterInstance | null {
  if (!target) return null
  const isExplicitInterface = /^(tcp|serial|usb):/i.test(target)
  // Only build for targets we actually drive via ESC/POS.
  if (!isExplicitInterface && !target.startsWith('printer:') &&
      target !== (getSetting('printerName') ?? '').trim()) {
    return null
  }
  return new ThermalPrinterConstructor({
    type: PrinterTypes.EPSON,
    interface: isExplicitInterface ? target : `printer:${target}`,
    options: { timeout: 5000 },
    width: 48
  })
}

type LabelProduct = { name: string; barcode: string; price: number; barcodeImage?: string }

// ---------- ESC/POS path (thermal printers) ----------
function printBarcodeLabelThermal(target: string, product: LabelProduct): { ok: boolean; error?: string } {
  const printer = buildThermalPrinter(target)
  if (!printer) {
    return { ok: false, error: 'No thermal printer configured' }
  }
  try {
    const p = new ThermalPrinterConstructor({ type: PrinterTypes.EPSON, interface: 'stdout', width: 48 })
    p.println(product.name)
    // Prefer the renderer-rendered CODE128 PNG (same code path as the on-screen
    // preview, so it's guaranteed valid). Fall back to generating one here.
    const barcodeImg = (product.barcodeImage && dataUrlToEscPosBuffer(product.barcodeImage)) ||
      buildBarcodeBuffer(product.barcode)
    if (barcodeImg) p.append(barcodeImg)
    else p.println(product.barcode) // fallback: at least print the digits
    p.bold(true)
    p.println(`Rs ${product.price.toFixed(2)}`)
    p.bold(false)
    p.cut()

    printer.clear()
    printer.append(Buffer.from(p.getBuffer() as unknown as ArrayBuffer))
    printer.execute()
    printer.clear()

    return { ok: true }
  } catch (err) {
    const msg = describePrintError(err, target)
    console.error('[printer] label print failed:', msg)
    return { ok: false, error: msg }
  }
}

// ---------- OS printer path (HP / laser / inkjet / any GDI printer) ----------
// Render the full label (name + CODE128 barcode + price) as HTML and print it
// through the operating system to the chosen device. Works for any printer the
// OS knows about, not just ESC/POS hardware.
async function printBarcodeLabelOs(target: string, product: LabelProduct): Promise<{ ok: boolean; error?: string }> {
  let win: BrowserWindow | null = null
  try {
    const safeName = product.name.replace(/[<>&"]/g, '')
    // Use the renderer-rendered barcode image if provided; otherwise generate
    // one here. Keeping the <img> lets the OS printer rasterize it natively.
    let barcodeSrc = product.barcodeImage
    if (!barcodeSrc) {
      const png = bwipjs.toBuffer({
        bcid: 'code128',
        text: product.barcode,
        scale: 4,
        height: 16,
        includetext: true,
        textxalign: 'center',
        backgroundcolor: 'FFFFFF'
      }) as unknown as Buffer
      barcodeSrc = `data:image/png;base64,${png.toString('base64')}`
    }
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { width: 300px; font-family: Arial, Helvetica, sans-serif; text-align: center; padding: 8px; }
      .name { font-size: 18px; font-weight: bold; margin-bottom: 6px; }
      .price { font-size: 16px; font-weight: bold; margin-top: 6px; }
      img { width: 100%; height: auto; display: block; }
    </style></head><body>
      <div class="name">${safeName}</div>
      <img src="${barcodeSrc}" />
      <div class="price">Rs ${product.price.toFixed(2)}</div>
    </body></html>`

    win = new BrowserWindow({
      show: false,
      width: 320,
      height: 400,
      webPreferences: { offscreen: true, contextIsolation: true }
    })
    await win.loadURL(`data:text/html;base64,${Buffer.from(html).toString('base64')}`)
    // Wait until the barcode <img> has actually decoded/painted, otherwise the
    // OS printer only outputs the text (name/price) and a blank where the bars
    // should be.
    await new Promise<void>((resolve) => {
      const wc = win!.webContents
      const done = () => resolve()
      const timeout = setTimeout(done, 4000)
      wc.executeJavaScript(
        `new Promise((res) => {
           const img = document.querySelector('img');
           if (!img) return res();
           if (img.complete && img.naturalWidth > 0) return res();
           img.onload = () => res();
           img.onerror = () => res();
         })`
      ).then(() => { clearTimeout(timeout); done() }).catch(() => { clearTimeout(timeout); done() })
    })

    const printed = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      win!.webContents.print(
        { deviceName: target, silent: true, printBackground: true, copies: 1 },
        (success, errorType) => {
          if (success) resolve({ ok: true })
          else resolve({ ok: false, error: errorType || 'OS print failed' })
        }
      )
    })
    return printed
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[printer] OS label print failed:', msg)
    return { ok: false, error: msg }
  } finally {
    if (win) win.destroy()
  }
}

export async function printBarcodeLabel(product: LabelProduct): Promise<{ ok: boolean; error?: string }> {
  if (!product || !product.barcode) {
    return { ok: false, error: 'No product / barcode provided' }
  }
  const target = getBarcodePrinterName()
  if (!target) {
    return { ok: false, error: 'No printer configured (set a barcode/label printer in settings)' }
  }
  if (isThermalTarget(target)) {
    return printBarcodeLabelThermal(target, product)
  }
  return printBarcodeLabelOs(target, product)
}

export function registerPrinterIpc(): void {
  ipcMain.handle('printer:get-printers', () => getPrinters())
  ipcMain.handle('printer:print-receipt', (_e, sale: Sale) => printReceipt(sale))
  ipcMain.handle('printer:reprint-receipt', () => reprintLastReceipt())
  ipcMain.handle('printer:print-refund', (_e, ret: SaleReturn) => printRefundReceipt(ret))
  ipcMain.handle('printer:print-barcode-label', (_e, product) => printBarcodeLabel(product))
}
