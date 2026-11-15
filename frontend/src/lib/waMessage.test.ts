import { describe, expect, it } from 'vitest'
import { buildMessage, isImei, parseAmount, parseMessage } from './waMessage'

const IMEI = '356938035643809'
const IMEI2 = '356938035850008'

describe('amounts', () => {
  it('reads the ways people write money', () => {
    expect(parseAmount('1,25,000')).toBe(125000)
    expect(parseAmount('Rs. 25,000/-')).toBe(25000)
    expect(parseAmount('125k')).toBe(125000)
    expect(parseAmount('1.25 lakh')).toBe(125000)
    expect(parseAmount('2 lac')).toBe(200000)
    expect(parseAmount('50 hazar')).toBe(50000)
    expect(parseAmount('none')).toBeUndefined()
  })
})

describe('reading a message', () => {
  it('the standard sale message', () => {
    const p = parseMessage(`*SALE*\nMobile: iPhone 13 128GB\nIMEI: ${IMEI}\nCustomer: Ali Khan\nPhone: 0300-1234567\nPrice: 1,25,000\nPaid: 100000 cash\nUdhaar: 25000\nBy: Ahmed`)
    expect(p.kind).toBe('sale')
    expect(p.mobile).toBe('iPhone 13 128GB')
    expect(p.storage).toBe('128GB')
    expect(p.imeis).toEqual([IMEI])
    expect(p.person).toBe('Ali Khan')
    expect(p.phone).toBe('03001234567')
    expect(p.price).toBe(125000)
    expect(p.paid).toBe(100000)
    expect(p.method).toBe('cash')
    expect(p.udhaar).toBe(25000)
    expect(p.by).toBe('Ahmed')
    expect(p.unknown).toEqual([])
  })

  it('a hand-written purchase in Roman Urdu', () => {
    const p = parseMessage(`khareeda\nmodel - samsung a05 4/64 used non pta\n35 693803 564380 9\nbechne wala: Bilal Mobiles 03219998888\nqeemat: 30k\njama: 10000 jazzcash\nbaqi: 20000`)
    expect(p.kind).toBe('purchase')
    expect(p.imeis).toEqual([IMEI])
    expect(p.ram).toBe(4)
    expect(p.storage).toBe('64GB')
    expect(p.condition).toBe('used')
    expect(p.pta).toBe('non_pta')
    expect(p.cost).toBe(30000)
    expect(p.paid).toBe(10000)
    expect(p.method).toBe('online')
    expect(p.udhaar).toBe(20000)
  })

  it('two phones in one sale, paid on udhaar', () => {
    const p = parseMessage(`SALE\nIMEI: ${IMEI}, ${IMEI2}\nCustomer: Usman\nPrice: 80000\nPaid: udhaar`)
    expect(p.imeis).toEqual([IMEI, IMEI2])
    expect(p.paid).toBe(0)
  })

  it('the paid amount from the udhaar line', () => {
    const p = parseMessage('*SALE*\nPrice: 50000\nUdhaar: 15000')
    expect(p.paid).toBe(35000)
  })

  it('payments and len-den', () => {
    const r = parseMessage('*PAYMENT RECEIVED*\nName: Ali\nAmount: 20,000\nMethod: easypaisa')
    expect(r.kind).toBe('received')
    expect(r.amount).toBe(20000)
    expect(r.method).toBe('online')
    const o = parseMessage('Payment paid\nName: Bilal\nAmount: 1 lakh cash')
    expect(o.kind).toBe('paid')
    expect(o.amount).toBe(100000)
    expect(o.method).toBe('cash')
    const l = parseMessage('*LEN DEN*\nName: Kashif\nLiya: 15000\nWapsi: 30-11-2026')
    expect(l.kind).toBe('lending')
    expect(l.lendDir).toBe('in')
    expect(l.amount).toBe(15000)
    expect(l.due).toBe('30-11-2026')
    const g = parseMessage('len den\nNaam: Kashif\nDiya: 5000')
    expect(g.lendDir).toBe('out')
    expect(g.amount).toBe(5000)
  })

  it('an IMEI with a wrong check digit is not taken', () => {
    expect(isImei('356938035643808')).toBe(false)
    expect(parseMessage('SALE\nIMEI: 356938035643808').imeis).toEqual([])
  })

  it('reads back what it builds', () => {
    const f = { imeis: [IMEI], mobile: 'Redmi 13C 6/128', person: 'Zain', phone: '03451234567', cost: 32000, asking: 38000, paid: 32000, method: 'cash' as const, condition: 'used' as const, pta: 'pta_approved' as const, battery: 91, by: 'Owner' }
    const msg = buildMessage('purchase', f)
    expect(msg.split('\n')[0]).toBe('*PURCHASE*')
    const p = parseMessage(msg)
    expect(p).toMatchObject({ kind: 'purchase', ...f, storage: '128GB', ram: 6 })
    const blank = buildMessage('sale', { imeis: [] }, true)
    expect(blank).toContain('IMEI: ')
    expect(blank).toContain('Customer: ')
    const lend = buildMessage('lending', { imeis: [], person: 'K', amount: 9000, lendDir: 'in' })
    expect(lend).toContain('Liya: 9,000')
    expect(lend).not.toContain('Diya')
    expect(parseMessage(lend)).toMatchObject({ kind: 'lending', lendDir: 'in', amount: 9000 })
  })
})
