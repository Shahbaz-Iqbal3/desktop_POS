// Pure, dependency-free helpers shared by the renderer (and unit-tested).
// MUST NOT import 'electron', 'better-sqlite3', or any process-specific module.

export function round(n: number): number {
  // Round to 2 decimals. The EPSILON nudge keeps half-up behaviour stable
  // against IEEE-754 representation errors (e.g. 1.005 would otherwise floor
  // to 1.00). Safe for non-negative currency amounts.
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Line total after an optional percentage discount (0-100). */
export function computeLineTotal(price: number, quantity: number, discountPct = 0): number {
  const d = Math.max(0, Math.min(100, discountPct || 0))
  return round(quantity * price * (1 - d / 100))
}

/** Sum of line totals, rounded to 2 decimals. */
export function computeSubtotal(lineTotals: number[]): number {
  return round(lineTotals.reduce((s, v) => s + (v || 0), 0))
}
