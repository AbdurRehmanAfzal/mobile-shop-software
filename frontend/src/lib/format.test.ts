import { describe, expect, it } from 'vitest'
import { formatMoney, isValidPkMobile, isoDay, normalisePhone, toLakh, toLatinDigits } from './format'

describe('formatMoney', () => {
  it('uses Latin digits and PKR prefix', () => {
    expect(formatMoney(125000)).toBe('Rs. 125,000')
    expect(formatMoney('1500.5')).toBe('Rs. 1,500.5')
    expect(formatMoney(-500)).toBe('-Rs. 500')
    expect(formatMoney(null)).toBe('Rs. 0')
  })
})

describe('phone helpers', () => {
  it('converts Urdu digits to Latin', () => {
    expect(toLatinDigits('۰۳۰۰۱۲۳۴۵۶۷')).toBe('03001234567')
  })
  it('normalises +92 and bare forms', () => {
    expect(normalisePhone('+92 300 1234567')).toBe('03001234567')
    expect(normalisePhone('923001234567')).toBe('03001234567')
    expect(normalisePhone('3001234567')).toBe('03001234567')
  })
  it('validates', () => {
    expect(isValidPkMobile('03001234567')).toBe(true)
    expect(isValidPkMobile('12345')).toBe(false)
  })
})

describe('counter helpers', () => {
  it('says big amounts in lakh', () => {
    expect(toLakh(2510000)).toBe('25.1')
    expect(toLakh('85000.00')).toBe('0.9')
    expect(toLakh(10000000)).toBe('100')
  })
  it('gives local calendar days', () => {
    const d = new Date(2026, 0, 1, 10)
    expect(isoDay(0, d)).toBe('2026-01-01')
    expect(isoDay(-1, d)).toBe('2025-12-31')
  })
})
