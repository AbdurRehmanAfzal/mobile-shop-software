/** Owner 2026-11-19 (ADR-110): a shop that starts today —
 *  1. writes an old dealing on a shop's khata (what went before, what was paid, what is left) with
 *     no IMEIs and no change to stock;
 *  2. buys three phones of one model in one go: the details once, an IMEI per piece;
 *  3. sells three of one model: ticked together in the list, one price for all. */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('old dealing on the khata; three phones bought in one go; three sold at one price', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Fresh Start Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const shopA = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Shop A', phone: '03016661001', kinds: ['shop'] } })).json()).id
  await request.post('/api/v1/parties', { headers: h, data: { name: 'Bulk Dealer', phone: '03016661002', kinds: ['supplier'] } })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })

  // 1. the old dealing: 5 iPhone 17 and 10 Samsung went before; 2,000,000 was paid; the rest is owed
  await page.goto(`/parties/${shopA}?tab=lenden`)
  const card = page.getByTestId('old-balance')
  await card.getByTestId('old-add').click()
  const sheet = page.getByTestId('old-sheet')
  // one question at a time (ADR-116): who owes, goods or amount, what went, paid and left
  await expect(sheet).toContainText('Who still has to pay?')
  await expect(sheet.getByTestId('old-save')).toHaveCount(0)
  await sheet.getByTestId('old-they-owe').click()
  await expect(sheet).toContainText('What did you give them?')
  await sheet.getByTestId('old-mode-goods').click()
  // a mobile, picked like on a purchase: type, brand, model, pieces, rate
  await sheet.getByTestId('old-type-phone').click()
  await sheet.getByRole('button', { name: 'Apple', exact: true }).click()
  await sheet.getByTestId('old-model-q').fill('iPhone 17')
  await sheet.getByRole('button', { name: 'iPhone 17', exact: true }).click()
  await sheet.getByTestId('old-qty').fill('5')
  await sheet.getByTestId('old-rate').fill('300000')
  await expect(sheet.getByTestId('old-item-total')).toContainText('1,500,000')
  await sheet.getByTestId('old-add-item').click()
  await expect(sheet.getByTestId('old-line')).toContainText('Apple iPhone 17')
  // another item whose model is not in the list: its name is typed; Next takes it along
  await sheet.getByTestId('old-type-phone').click()
  await sheet.getByTestId('old-type-name').click()
  await sheet.getByTestId('old-name').fill('Samsung A56')
  await sheet.getByTestId('old-qty').fill('10')
  await expect(sheet.getByTestId('old-next')).toBeDisabled() // the rate is still missing
  await sheet.getByTestId('old-rate').fill('95000')
  await sheet.getByTestId('old-next').click()
  await expect(sheet).toContainText('How much did they already pay?')
  // back and forth keeps what was written
  await sheet.getByTestId('old-back').click()
  await expect(sheet.getByTestId('old-line')).toHaveCount(2)
  await expect(sheet.getByTestId('old-total')).toContainText('2,450,000')
  await sheet.getByTestId('old-next').click()
  await sheet.getByTestId('old-settled').fill('2000000')
  await expect(sheet.getByTestId('old-sum')).toContainText('2,450,000')
  await expect(sheet.getByTestId('old-left')).toContainText('450,000')
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  await page.screenshot({ path: 'test-results/old-dealing.png', fullPage: true })
  await sheet.getByTestId('old-save').click()
  await expect(card.getByText('Saved on the khata.')).toBeVisible()
  await expect(card.getByTestId('old-row')).toContainText('Apple iPhone 17 × 5 @ 300,000')
  await expect(card.getByTestId('old-row')).toContainText('Left 450,000')
  expect(Number((await (await request.get(`/api/v1/parties/${shopA}`, { headers: h })).json()).balance)).toBe(450000)
  expect(await (await request.get('/api/v1/devices', { headers: h })).json()).toEqual([]) // nothing entered the stock

  // 2. three Nokia 105 from the dealer: details once, an IMEI per piece
  const t = String(Date.now()).slice(-3)
  const [i1, i2, i3] = [imei(`35693803601${t}`), imei(`35693803602${t}`), imei(`35693803603${t}`)]
  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /From a dealer/ }).click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Bulk Dealer')
  await page.getByText('Bulk Dealer').first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill(i1)
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('3000')
  await page.getByLabel('Asking price').fill('3500')
  await page.getByTestId('many-toggle').click()
  await expect(page.getByLabel('IMEI 2')).toHaveCount(0)
  const next = page.getByTestId('many-next')
  await next.fill(i1) // the first piece again: refused
  await page.getByTestId('many-add').click()
  await expect(page.getByText('This number is already in the list')).toBeVisible()
  await next.fill(i2)
  await page.getByTestId('many-add').click()
  await next.fill(i3)
  await next.press('Enter')
  await expect(page.getByTestId('many-list')).toContainText(i2)
  await expect(page.getByTestId('many-list')).toContainText(i3)
  await expect(page.getByTestId('many-count')).toContainText('3 pieces')
  await expect(page.getByTestId('many-count')).toContainText('9,000')
  await page.screenshot({ path: 'test-results/bulk-buy.png', fullPage: true })
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await expect(page.getByTestId('device-edit')).toHaveCount(3)
  await page.getByTestId('purchase-review-open').click()
  await page.getByTestId('review-ok').check()
  await page.getByTestId('purchase-save').click()
  await expect(page.getByText('Purchase saved')).toBeVisible()
  const stock = await (await request.get('/api/v1/devices?status=in_stock', { headers: h })).json()
  expect(stock.map((d: { imei1: string }) => d.imei1).sort()).toEqual([i1, i2, i3].sort())
  expect(new Set(stock.map((d: { barcode: string }) => d.barcode)).size).toBe(3) // each its own code
  expect(stock.every((d: { cost_price: string }) => Number(d.cost_price) === 3000)).toBeTruthy()

  // 3. all three sold to Shop A: ticked together, one price for all
  await page.goto('/sale/new')
  await page.getByTestId('sale-multi').click()
  const rows = page.getByTestId('sale-pick-row')
  await expect(rows).toHaveCount(3)
  for (let i = 0; i < 3; i++) await rows.nth(i).click()
  await page.getByTestId('sale-add-picked').click()
  const group = page.getByTestId('sale-group')
  await expect(group).toContainText('× 3')
  await group.getByTestId('sale-group-price').fill('3400')
  await group.getByTestId('sale-group-set').click()
  await page.screenshot({ path: 'test-results/bulk-sell.png', fullPage: true })
  await expect(page.getByText('10,200').first()).toBeVisible() // 3 × 3,400
})
