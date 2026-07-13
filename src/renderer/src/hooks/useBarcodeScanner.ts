// Barcode scanner hook — keyboard-buffer listener.
// Detects rapid keystrokes terminated by Enter (typical USB HID scanner behavior).
// Only active when `enabled` is true (controlled by settings.barcodeEnabled).
import { useEffect, useRef } from 'react'

const SCAN_TIMEOUT_MS = 100   // max gap between chars in a scan
const MIN_SCAN_LENGTH = 4      // ignore short bursts (likely typing)

export function useBarcodeScanner(
  enabled: boolean,
  onScan: (code: string) => void
): void {
  const buffer = useRef<string>('')
  const lastKey = useRef<number>(0)

  useEffect(() => {
    if (!enabled) return

    const handler = (e: KeyboardEvent): void => {
      const now = Date.now()

      // Reset buffer if too much time passed since last keystroke (human typing)
      if (now - lastKey.current > SCAN_TIMEOUT_MS) {
        buffer.current = ''
      }
      lastKey.current = now

      if (e.key === 'Enter') {
        if (buffer.current.length >= MIN_SCAN_LENGTH) {
          const code = buffer.current
          buffer.current = ''
          // Prevent the Enter from submitting forms etc.
          e.preventDefault()
          onScan(code)
        } else {
          buffer.current = ''
        }
        return
      }

      // Only collect printable single-char keys
      if (e.key.length === 1) {
        buffer.current += e.key
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, onScan])
}
