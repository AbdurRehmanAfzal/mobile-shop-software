import { describe, expect, it } from 'vitest'
import { COUNTRIES, FEATURED, compose, countryByIso, countryName, countryOf, isValidMobile, nationalOf, normalisePhone, parseInternational, waNumber } from './phone'

describe('mobile numbers of any country (ADR-107)', () => {
  it('a Pakistani number is kept as 03XXXXXXXXX, as before', () => {
    for (const raw of ['03001234567', '+92 300 1234567', '0092 300 1234567', '923001234567', '3001234567', '۰۳۰۰۱۲۳۴۵۶۷']) {
      expect(normalisePhone(raw)).toBe('03001234567')
      expect(isValidMobile(raw)).toBe(true)
    }
    expect(countryOf('03001234567').iso).toBe('PK')
    expect(nationalOf('03001234567')).toBe('3001234567')
    expect(compose(countryByIso('PK'), '0300 1234567')).toBe('03001234567')
    expect(compose(countryByIso('PK'), '')).toBe('')
    expect(waNumber('03001234567')).toBe('923001234567')
    expect(waNumber('+92 300 1234567')).toBe('923001234567')
  })

  it('another country keeps its code', () => {
    expect(normalisePhone('+971 50 123 4567')).toBe('+971501234567')
    expect(normalisePhone('00971501234567')).toBe('+971501234567')
    expect(normalisePhone('+971 (0)50-123-4567')).toBe('+971501234567')
    expect(countryOf('+971501234567').iso).toBe('AE')
    expect(nationalOf('+971501234567')).toBe('501234567')
    expect(compose(countryByIso('AE'), '050 123 4567')).toBe('+971501234567')
    expect(compose(countryByIso('AE'), '50123456789999')).toBe('+971501234567') // stops at the country's length
    expect(compose(countryByIso('AE'), '')).toBe('')
    expect(waNumber('+971501234567')).toBe('971501234567')
    expect(waNumber(null)).toBe('')
    // +1 and +7 are shared: the first country of the code is shown
    expect(countryOf('+14155552671').iso).toBe('US')
    expect(countryOf('+79123456789').iso).toBe('RU')
    expect(parseInternational('0501234567')).toBeNull()
  })

  it('checks the length the country needs', () => {
    expect(isValidMobile('+971501234567')).toBe(true)
    expect(isValidMobile('+97150123')).toBe(false)
    expect(isValidMobile('+447911123456')).toBe(true)
    expect(isValidMobile('+44791112345')).toBe(false)
    expect(isValidMobile('+819012345678')).toBe(true) // no fixed length known: anything sensible
    expect(isValidMobile('+81901')).toBe(false)
    expect(isValidMobile('12345')).toBe(false)
    expect(isValidMobile('04001234567')).toBe(false)
    expect(isValidMobile('+999123456789')).toBe(false)
  })

  it('the list: Pakistan first, no country twice, names from the browser', () => {
    expect(COUNTRIES[0].iso).toBe('PK')
    expect(COUNTRIES.slice(0, FEATURED).map((c) => c.iso)).toContain('AE')
    expect(new Set(COUNTRIES.map((c) => c.iso)).size).toBe(COUNTRIES.length)
    expect(COUNTRIES.length).toBeGreaterThan(200)
    for (const c of COUNTRIES) expect(c.dial).toMatch(/^[1-9]\d{0,2}$/)
    expect(countryName('AE', 'en')).toBe('United Arab Emirates')
  })
})
