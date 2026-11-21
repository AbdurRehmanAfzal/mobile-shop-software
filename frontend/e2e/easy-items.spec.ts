/** Accessories shop 2026-11-21 (ADR-121):
 *  1. buying an accessory is as short as buying a phone — type a few letters, tap the line of the
 *     built-in list, tick the colours bought with how many of each, the cost and the sale price,
 *     and they are on the bill;
 *  2. the stock of every kind is in sight: the type chips wrap, each with its count, the items'
 *     screen has the same chips, and "All stock" shows the accessories too. */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const IMEI = '356938035647719'

test('buying an accessory in four short steps; every kind of stock in sight', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Easy Items', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Item Dealer', phone: '03016661009', kinds: ['supplier'] } })).json()).id
  // one phone and one tablet already in stock
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: IMEI, brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 3000, asking_price: 3500 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })

  // 1. the purchase: dealer, then the item
  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /From a dealer/ }).click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Item Dealer')
  await page.getByText('Item Dealer').first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('A typed line is only written on the bill.')).toBeVisible()
  await page.getByRole('button', { name: 'Add accessory / watch' }).click()
  const sheet = page.getByTestId('sheet-backdrop')
  // a shop that is starting sees one line of how, not sixteen chips
  await expect(sheet.getByText('Type a few letters of what you bought')).toBeVisible()
  // ADR-124: the kinds are cards under the search — the usual twelve, the rest under "More kinds"
  await expect(sheet.getByTestId('kind-cards').getByRole('button')).toHaveCount(13)
  await expect(sheet.getByTestId('kind-card-charger')).toBeVisible()
  await sheet.getByPlaceholder('Type what you bought: name or code').fill('anker 20w')
  await sheet.getByTestId('lib-hits').getByRole('button', { name: /^Anker 20W USB-C Charger/ }).click()
  // the short form, already filled: its name and kind are known
  const form = sheet.getByTestId('item-form')
  await expect(form.getByLabel('Name', { exact: true })).toHaveValue('Anker 20W USB-C Charger')
  for (const t of ['1. What is it?', '2. What kind of thing?', '3. Which colours or sizes did you buy?', '4. How many, and the prices']) await expect(form).toContainText(t)
  await expect(form.getByTestId('buy-kind')).toContainText('Charger')
  await expect(form.getByTestId('item-quick-card')).toHaveCount(0) // brand, fit, quality: under "More details"
  await form.getByRole('checkbox', { name: 'White' }).click()
  await form.getByRole('checkbox', { name: 'Black' }).click()
  await form.getByLabel('Bought · White').fill('12')
  await form.getByLabel('Bought · Black').fill('6')
  await form.getByLabel('Cost of one piece').fill('1400')
  await form.getByLabel('Selling price (each)').fill('2200')
  await page.screenshot({ path: 'test-results/easy-buy-form.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  await form.getByRole('button', { name: 'Save and add' }).click()
  // both colours are on the bill with their pieces and the cost — nothing more to type
  await expect(page.getByText('Anker 20W USB-C Charger · White')).toBeVisible()
  await expect(page.getByText('Anker 20W USB-C Charger · Black')).toBeVisible()
  await expect(page.getByLabel('Qty').first()).toHaveValue('12')
  await expect(page.getByLabel('Unit cost').first()).toHaveValue('1400')
  // ADR-124: under each line — what it comes to, what a piece sells for and earns, and a discount on that line
  const foot = page.getByTestId('line-foot').first()
  await expect(foot.getByTestId('line-total')).toContainText('16,800')
  await expect(foot.getByTestId('line-profit')).toContainText('Sells at Rs. 2,200 · earns Rs. 800 a piece')
  await foot.getByTestId('line-discount-open').click()
  await foot.getByTestId('line-discount').fill('1200')
  await expect(foot.getByTestId('line-total')).toContainText('15,600')
  await expect(foot.getByTestId('line-profit')).toContainText('earns Rs. 900 a piece')
  // one more, of one kind only: pieces and cost in the same form
  await page.getByRole('button', { name: 'Add accessory / watch' }).click()
  // this time by its kind: a card, then the line — no typing
  await sheet.getByTestId('kind-cards').getByTestId('kind-card-Mouse').click()
  await expect(sheet.getByTestId('buy-kind-on')).toContainText('Mouse')
  await expect(sheet.getByTestId('kind-cards')).toHaveCount(0)
  await sheet.getByTestId('lib-hits').getByRole('button', { name: /^Wireless Mouse/ }).first().click()
  await form.getByTestId('buy-qty').fill('5')
  await form.getByLabel('Cost of one piece').fill('900')
  await form.getByLabel('Selling price (each)').fill('1500')
  await form.getByRole('button', { name: 'Save and add' }).click()
  await expect(page.getByText('Wireless Mouse', { exact: true })).toBeVisible()
  await page.getByTestId('purchase-review-open').click()
  await page.getByTestId('review-ok').check()
  await page.getByTestId('purchase-save').click()
  await expect(page.getByText('Purchase saved')).toBeVisible({ timeout: 20_000 })
  const items = await (await request.get('/api/v1/accessories', { headers: h })).json()
  const stock = Object.fromEntries(items.map((x: { name: string; variant: string | null; qty: number }) => [`${x.name}${x.variant ? ` ${x.variant}` : ''}`, x.qty]))
  expect(stock).toEqual({ 'Anker 20W USB-C Charger White': 12, 'Anker 20W USB-C Charger Black': 6, 'Wireless Mouse': 5 })
  // the line's discount reached the bill and the cost of that colour: 16,800 − 1,200 + 8,400 + 4,500 = 28,500
  const bills = await (await request.get('/api/v1/purchases', { headers: h })).json()
  const bill = (Array.isArray(bills) ? bills : bills.items).find((b: { total: string }) => Number(b.total) === 28500)
  expect(bill, JSON.stringify((Array.isArray(bills) ? bills : bills.items).map((b: { no: string; subtotal: string; discount: string; total: string }) => [b.no, b.subtotal, b.discount, b.total]))).toBeTruthy()
  expect(Number(items.find((x: { variant: string | null }) => x.variant === 'White').avg_cost)).toBe(1300)

  // 2. the stock screen: every kind in sight with its count, on a phone too
  await page.goto('/stock')
  const kinds = page.getByTestId('stock-kinds')
  await expect(kinds.getByTestId('kind-count-all')).toHaveText('1')
  await expect(kinds.getByTestId('kind-count-phone')).toHaveText('1')
  await expect(kinds.getByTestId('kind-count-tablet')).toHaveText('0')
  await expect(kinds.getByTestId('kind-count-items')).toHaveText('23')
  await page.setViewportSize({ width: 320, height: 568 })
  await expect(kinds.getByTestId('kind-items')).toBeInViewport() // wrapped, not scrolled out of sight
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  await expect(page.getByTestId('stock-summary-line')).toContainText('1 phones, tablets, watches and laptops')
  const card = page.getByTestId('stock-items-card')
  await expect(card).toContainText('23 pieces in stock')
  // ADR-123: the accessories are in "All stock" itself, above the phones, and its search finds them
  const inList = page.getByTestId('stock-items')
  await expect(inList.getByTestId('stock-item-row')).toHaveCount(3)
  await page.getByPlaceholder('IMEI, model, brand, name').fill('mouse')
  await expect(inList.getByTestId('stock-item-row')).toHaveCount(1)
  await expect(inList).toContainText('Wireless Mouse')
  await page.getByPlaceholder('IMEI, model, brand, name').fill('zzqx')
  await expect(page.getByTestId('stock-items')).toHaveCount(0)
  await page.getByPlaceholder('IMEI, model, brand, name').fill('')
  await page.screenshot({ path: 'test-results/easy-stock.png', fullPage: true })
  await kinds.getByTestId('kind-tablet').click()
  await expect(page.getByTestId('stock-summary-line')).toContainText('0 tablets')
  await expect(page.getByTestId('stock-items-card')).toHaveCount(0)
  await kinds.getByTestId('kind-all').click()
  await card.click()
  await expect(page).toHaveURL(/\/accessories$/)
  // the items' screen has the same chips: back to the phones in one tap
  await expect(page.getByTestId('stock-kinds').getByTestId('kind-items')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('item-variant')).toHaveCount(2)
  await page.getByTestId('stock-kinds').getByTestId('kind-phone').click()
  await expect(page).toHaveURL(/\/stock\?category=phone$/)
  await expect(page.getByTestId('stock-summary-line')).toContainText('1 phones')
})
