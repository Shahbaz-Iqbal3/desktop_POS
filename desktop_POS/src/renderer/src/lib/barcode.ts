// On-screen CODE128 barcode rendering for the renderer (Electron browser context).
// Uses bwip-js's `toCanvas` into an offscreen canvas, then exports a PNG data URL.
// Falls back to a null return so callers can show the raw code text instead.
import * as bwipjs from 'bwip-js'

// bwip-js ships separate Node/browser type declarations; the renderer uses the
// browser build (which exposes toCanvas), but TS may resolve the Node types.
// Cast locally so the call type-checks regardless of which declaration wins.
const toCanvas = (
  bwipjs as unknown as {
    toCanvas: (
      canvas: HTMLCanvasElement,
      opts: Record<string, unknown>
    ) => HTMLCanvasElement
  }
).toCanvas

export function renderBarcodeDataUrl(code: string): string | null {
  if (!code) return null
  try {
    const canvas = document.createElement('canvas')
    toCanvas(canvas, {
      bcid: 'code128',
      text: code,
      scale: 3,
      height: 12,
      includetext: true,
      textxalign: 'center',
      backgroundcolor: 'FFFFFF'
    })
    return canvas.toDataURL('image/png')
  } catch {
    return null
  }
}
