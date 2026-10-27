import { describe, expect, it } from 'vitest'
import { imeiFrom, luhnOk } from './scan'

describe('IMEI from a barcode', () => {
  it('takes a 15-digit code that passes the IMEI check', () => {
    expect(luhnOk('490154203237518')).toBe(true)
    expect(imeiFrom('490154203237518')).toBe('490154203237518')
    expect(imeiFrom('IMEI1: 356938035643809')).toBe('356938035643809')
  })
  it('ignores shop barcodes, serials and wrong numbers', () => {
    expect(imeiFrom('6901234567892')).toBeNull()
    expect(imeiFrom('R58M12ABCDE')).toBeNull()
    expect(imeiFrom('490154203237519')).toBeNull()
  })
})
