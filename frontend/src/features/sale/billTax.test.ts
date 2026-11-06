/** owner 2026-11-03: the sale screen's tax must equal the server's (tests/test_item_gst.py), or a
 *  walk-in's full payment would differ from the bill by a paisa */
import { describe, expect, it } from 'vitest'
import { billTax } from './SaleWizard'

describe('billTax', () => {
  it('one rate on the whole bill when no item has its own', () => {
    expect(billTax([10000], [{ qty: '2', unit_price: '1000', tax_rate: null }], 500, 18)).toBe(2070)
  })
  it("an item's own GST % on its line", () => {
    expect(billTax([10000], [{ qty: '2', unit_price: '1000', tax_rate: '5.00' }], 0, 18)).toBe(1900)
  })
  it('no tax on an untaxed bill, whatever the item says', () => {
    expect(billTax([10000], [{ qty: '1', unit_price: '1000', tax_rate: '5' }], 0, 0)).toBe(0)
  })
  it('the discount is shared by the lines before their own rates', () => {
    // 9,000 @18% and 1,000 @5% with 1,000 off: shares 900 / 100 → 1,458 + 45
    expect(billTax([9000], [{ qty: '1', unit_price: '1000', tax_rate: '5' }], 1000, 18)).toBe(1503)
  })
  it('a phone taxed at import carries no tax; the accessory takes the bill rate (docs/36)', () => {
    // server: tests/test_bill_details.py — phone 40,000 + charger 1,000 at 18% → 180
    expect(billTax([40000], [{ qty: '1', unit_price: '1000', tax_rate: null }], 0, 18, [0])).toBe(180)
    expect(billTax([40000], [{ qty: '1', unit_price: '1000', tax_rate: null }], 0, 18, [null])).toBe(7380)
  })
})
