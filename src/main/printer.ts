// Printer integration — runs in the MAIN PROCESS.
// Uses node-thermal-printer for ESC/POS USB thermal printers.
// Falls back gracefully if the printer is unavailable — sale persistence
// is NEVER blocked by a printer failure (see Phase 4 ⚠️ verification).
import { ipcMain } from 'electron'
import { printer as ThermalPrinterConstructor, PrinterTypes } from 'node-thermal-printer'
import type { Sale, SaleReturn } from '@shared/types'
import { getSetting, getLastSale } from './db'

type PrinterInstance = InstanceType<typeof ThermalPrinterConstructor>

let printerInstance: PrinterInstance | null = null

function getPrinter(): PrinterInstance | null {
  const printerName = getSetting('printerName')
  if (!printerName) {
    printerInstance = null
    return null
  }
  if (!printerInstance) {
    printerInstance = new ThermalPrinterConstructor({
      type: PrinterTypes.EPSON,
      interface: `printer:${printerName}`,
      options: { timeout: 5000 },
      width: 48
    })
  }
  return printerInstance
}

export function getPrinters(): string[] {
  try {
    // node-thermal-printer exposes getPrinters on some platforms via the underlying driver.
    // Best-effort; if it fails we return an empty list and the user types the name manually.
    const lib = ThermalPrinterConstructor as unknown as { getPrinters?: () => string[] }
    return lib.getPrinters?.() ?? []
  } catch {
    return []
  }
}

function buildReceiptBuffer(sale: Sale, shopName: string): Buffer {
  const p = new ThermalPrinterConstructor({
    type: PrinterTypes.EPSON,
    interface: 'stdout',
    width: 48
  })

  p.bold(true)
  p.println(shopName.toUpperCase())
  p.bold(false)
  p.println(`Date: ${new Date(sale.createdAt).toLocaleString()}`)
  p.println(`Receipt: ${sale.id.slice(0, 8).toUpperCase()}`)
  p.println(`Payment: ${sale.paymentMethod.toUpperCase()}`)
  p.drawLine()

  for (const item of sale.items) {
    p.println(item.name)
    const qtyLabel = item.unitType === 'thaan'
      ? `${item.quantity}m${item.cutLength ? ` (cut ${item.cutLength}m)` : ''}`
      : `${item.quantity}x`
    p.tableCustom([
      { text: qtyLabel, align: 'LEFT', width: 0.5 },
      { text: `Rs ${item.lineTotal.toFixed(2)}`, align: 'RIGHT', width: 0.5 }
    ])
    if (item.discount && item.discount > 0) {
      p.tableCustom([
        { text: `Disc ${item.discount}%`, align: 'LEFT', width: 0.5 },
        { text: `Rs ${((item.quantity * item.price * item.discount) / 100).toFixed(2)}`, align: 'RIGHT', width: 0.5 }
      ])
    }
  }

  p.drawLine()
  p.bold(true)
  p.tableCustom([
    { text: 'TOTAL', align: 'LEFT', width: 0.5 },
    { text: `Rs ${sale.total.toFixed(2)}`, align: 'RIGHT', width: 0.5 }
  ])
  p.tableCustom([
    { text: 'PAID', align: 'LEFT', width: 0.5 },
    { text: `Rs ${sale.actualPaidPrice.toFixed(2)}`, align: 'RIGHT', width: 0.5 }
  ])
  p.bold(false)
  p.drawLine()
  p.println('Thank you for your business!')
  p.cut()

  return Buffer.from(p.getBuffer() as unknown as ArrayBuffer)
}

// ⚠️ Print is fire-and-forget AFTER the sale is persisted.
// Any printer error is caught and logged — it NEVER propagates to the caller,
// because the sale is already saved and must remain saved.
export async function printReceipt(sale: Sale): Promise<{ ok: boolean; error?: string }> {
  const printer = getPrinter()
  if (!printer) {
    return { ok: false, error: 'No printer configured (set printerName in settings)' }
  }

  const shopName = getSetting('shopName') ?? 'My Shop'
  try {
    const buffer = buildReceiptBuffer(sale, shopName)
    printer.append(buffer)
    const executed = await printer.execute()
    if (!executed) {
      console.warn('[printer] execute returned false')
      return { ok: false, error: 'Printer execute returned false' }
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
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
    const p = new ThermalPrinterConstructor({
      type: PrinterTypes.EPSON,
      interface: 'stdout',
      width: 48
    })

    p.bold(true)
    p.println('*** REFUND / RETURN ***')
    p.println(shopName.toUpperCase())
    p.bold(false)
    p.println(`Date: ${new Date(ret.createdAt).toLocaleString()}`)
    p.println(`Refund: ${ret.id.slice(0, 8).toUpperCase()}`)
    p.println(`Original Sale: ${ret.saleId.slice(0, 8).toUpperCase()}`)
    p.println(`Payment: ${ret.paymentMethod.toUpperCase()}`)
    p.drawLine()

    for (const item of ret.items) {
      p.println(item.name)
      const qtyLabel = item.unitType === 'thaan'
        ? `${item.quantity}m${item.cutLength ? ` (cut ${item.cutLength}m)` : ''}`
        : `${item.quantity}x`
      p.tableCustom([
        { text: qtyLabel, align: 'LEFT', width: 0.5 },
        { text: `Rs ${item.lineTotal.toFixed(2)}`, align: 'RIGHT', width: 0.5 }
      ])
    }

    p.drawLine()
    p.bold(true)
    p.tableCustom([
      { text: 'REFUNDED', align: 'LEFT', width: 0.5 },
      { text: `Rs ${ret.refundAmount.toFixed(2)}`, align: 'RIGHT', width: 0.5 }
    ])
    p.bold(false)
    p.drawLine()
    p.println('Sorry for the inconvenience!')
    p.cut()

    const buffer = Buffer.from(p.getBuffer() as unknown as ArrayBuffer)
    printer.append(buffer)
    const executed = await printer.execute()
    if (!executed) {
      return { ok: false, error: 'Printer execute returned false' }
    }
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[printer] refund print failed:', msg)
    return { ok: false, error: msg }
  }
}

export function printBarcodeLabel(product: { name: string; barcode: string; price: number }): {
  ok: boolean
  error?: string
} {
  const printer = getPrinter()
  if (!printer) {
    return { ok: false, error: 'No printer configured' }
  }
  try {
    const p = new ThermalPrinterConstructor({
      type: PrinterTypes.EPSON,
      interface: 'stdout',
      width: 48
    })
    p.println(product.name)
    p.printBarcode(product.barcode, 72 /* CODE128 */)
    p.bold(true)
    p.println(`Rs ${product.price.toFixed(2)}`)
    p.bold(false)
    p.cut()
    printer.append(Buffer.from(p.getBuffer() as unknown as ArrayBuffer))
    printer.execute()
    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[printer] label print failed:', msg)
    return { ok: false, error: msg }
  }
}

export function registerPrinterIpc(): void {
  ipcMain.handle('printer:get-printers', () => getPrinters())
  ipcMain.handle('printer:print-receipt', (_e, sale: Sale) => printReceipt(sale))
  ipcMain.handle('printer:reprint-receipt', () => reprintLastReceipt())
  ipcMain.handle('printer:print-refund', (_e, ret: SaleReturn) => printRefundReceipt(ret))
  ipcMain.handle('printer:print-barcode-label', (_e, product) => printBarcodeLabel(product))
}
