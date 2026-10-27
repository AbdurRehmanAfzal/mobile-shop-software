import { describe, expect, it } from 'vitest'
import { formatCnic, isCnicOk, isImeiOk, isMobileOk, localMobile } from './FieldInputs'
import { clampRange, isoDay } from '@/lib/format'

describe('field checks (owner, 2026-10-27)', () => {
  it('mobile keeps 10 digits after +92, whatever is typed or pasted', () => {
    expect(localMobile('03001234567')).toBe('3001234567')
    expect(localMobile('+92 300 1234567')).toBe('3001234567')
    expect(localMobile('923001234567')).toBe('3001234567')
    expect(localMobile('3001234567999')).toBe('3001234567')
    expect(localMobile('۰۳۰۰۱۲۳۴۵۶۷')).toBe('3001234567')
    expect(isMobileOk('03001234567')).toBe(true)
    expect(isMobileOk('0300123')).toBe(false)
    expect(isMobileOk('04001234567')).toBe(false)
  })

  it('CNIC stops at 13 digits and puts the dashes in', () => {
    expect(formatCnic('33100')).toBe('33100')
    expect(formatCnic('331001234567')).toBe('33100-1234567')
    expect(formatCnic('3310012345671999')).toBe('33100-1234567-1')
    expect(isCnicOk('33100-1234567-1')).toBe(true)
    expect(isCnicOk('33100-12345')).toBe(false)
  })

  it('IMEI is exactly 15 digits', () => {
    expect(isImeiOk('490154203237518')).toBe(true)
    expect(isImeiOk('49015420323751')).toBe(false)
  })

  it('a from date is never after the to date, nor after today', () => {
    expect(clampRange('2026-10-10', '2026-10-01', 'from')).toEqual({ from: '2026-10-01', to: '2026-10-01' })
    expect(clampRange('2026-10-10', '2026-10-01', 'to')).toEqual({ from: '2026-10-10', to: '2026-10-10' })
    expect(clampRange('2026-10-01', '2999-01-01', 'to')).toEqual({ from: '2026-10-01', to: isoDay(0) })
  })
})
