import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadKeys(file: string): Set<string> {
  const raw = readFileSync(resolve(__dirname, '..', 'src', 'renderer', 'src', 'i18n', file), 'utf8')
  const obj = JSON.parse(raw)
  const keys: string[] = []
  const walk = (o: Record<string, unknown>) => {
    for (const [k, v] of Object.entries(o)) {
      if (v && typeof v === 'object') walk(v as Record<string, unknown>)
      else keys.push(k)
    }
  }
  walk(obj)
  return new Set(keys)
}

describe('i18n parity', () => {
  const en = loadKeys('en.json')
  const ur = loadKeys('ur.json')

  it('urdu contains every english key', () => {
    const missing = [...en].filter((k) => !ur.has(k))
    expect(missing, `ur.json is missing keys: ${missing.join(', ')}`).toEqual([])
  })

  it('english contains every urdu key', () => {
    const missing = [...ur].filter((k) => !en.has(k))
    expect(missing, `en.json is missing keys: ${missing.join(', ')}`).toEqual([])
  })
})
