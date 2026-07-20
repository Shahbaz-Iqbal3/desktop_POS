// Pure, dependency-free helpers shared by the renderer (and unit-tested).
// MUST NOT import 'electron', 'better-sqlite3', or any process-specific module.

export function round(n: number): number {
  // Round to 2 decimals. The EPSILON nudge keeps half-up behaviour stable
  // against IEEE-754 representation errors (e.g. 1.005 would otherwise floor
  // to 1.00). Safe for non-negative currency amounts.
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/** Line total after an optional percentage discount (0-100).
 *  For meter-good ("thaan") items, `cutLength` is the billable length in
 *  meters; when provided it is used instead of `quantity` (which counts
 *  rolls/pieces). For piece items, or when `cutLength` is omitted,
 *  `quantity` is used as-is. */
export function computeLineTotal(
  price: number,
  quantity: number,
  discountPct = 0,
  cutLength?: number
): number {
  const billable = cutLength != null && cutLength > 0 ? cutLength : quantity
  const d = Math.max(0, Math.min(100, discountPct || 0))
  return round(billable * price * (1 - d / 100))
}

/** Sum of line totals, rounded to 2 decimals. */
export function computeSubtotal(lineTotals: number[]): number {
  return round(lineTotals.reduce((s, v) => s + (v || 0), 0))
}
