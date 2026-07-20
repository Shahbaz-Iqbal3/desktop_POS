import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { round, computeLineTotal, computeSubtotal } from '../src/shared/pure'

describe('pricing helpers', () => {
  it('rounds to 2 decimals', () => {
    expect(round(1.005)).toBe(1.01)
    expect(round(10.12345)).toBe(10.12)
    expect(round(0)).toBe(0)
  })

  it('computes a line total with no discount', () => {
    expect(computeLineTotal(100, 3)).toBe(300)
    expect(computeLineTotal(1.5, 2)).toBe(3)
  })

  it('applies a percentage discount', () => {
    // 100 * 2 * (1 - 0.10) = 180
    expect(computeLineTotal(100, 2, 10)).toBe(180)
    // 50 * 3 * (1 - 0.25) = 112.5 -> rounded 112.5
    expect(computeLineTotal(50, 3, 25)).toBe(112.5)
  })

  it('clamps discount to 0-100', () => {
    expect(computeLineTotal(100, 1, -20)).toBe(100)
    expect(computeLineTotal(100, 1, 150)).toBe(0)
  })

  it('sums line totals', () => {
    expect(computeSubtotal([100, 200, 50])).toBe(350)
    expect(computeSubtotal([])).toBe(0)
  })
})
