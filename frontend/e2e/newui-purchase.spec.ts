/** ADR-134: Add stock in the new product, drawn from `01-add-stock-and-purchase.html`. It fills the
 *  live purchase's own line and posts what the live purchase posts, with the live checks: a phone
 *  already in stock is refused, the asking price is not under the cost, the bill is ticked once more
 *  before it is saved; an accessory is found among the shop's items before a new one is made. */

import { expect, test, type Page } from '@playwright/test'

test.setTimeout(180_000)

async function pickBrand(page: Page, root: string, name: string) {
  const pill = page.getByTestId(`${root}-brands`).getByRole('button', { name, exact: true })
  if (await pill.count()) await pill.click()
  else await page.getByTestId(`${root}-brands`).locator('select').selectOption({ label: name })
}

test('new product: add stock from a dealer and from a customer, as file 01 draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Buy Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const dealer = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Hall Road Traders', phone: '03215550002', kinds: ['supplier'] } })).json()
  const seller = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Walk Seller', phone: '03215550003', kinds: ['customer'] } })).json()
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  // a phone already in stock, to be refused
  expect((await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: '352099001761481', brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 1000, asking_price: 2000 } })).ok()).toBeTruthy()
  // an item the shop already keeps
  const charger = await (await request.post('/api/v1/accessories', { headers: h, data: { name: 'Fast Charger 25W', category: 'charger', price: 900, opening_qty: 2, opening_cost: 500 } })).json()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/purchase/new')
  await expect(page.getByTestId('nbuy')).toBeVisible()
  await expect(page.getByTestId('nbuy-side')).toBeVisible()
  await expect(page.getByTestId('nbuy-put')).toBeDisabled()
  await page.getByTestId('nbuy-party').selectOption(dealer.id)
  await expect(page.getByTestId('nbuy-khata')).toContainText('Clear')

  // a phone: the one already in stock is refused
  await page.getByTestId('nbuy-imei').fill('352099001761481')
  await expect(page.getByTestId('nbuy-in-stock')).toBeVisible()
  await page.getByTestId('nbuy-imei').fill('490154203237518')
  await expect(page.getByTestId('nbuy-in-stock')).toHaveCount(0)
  await pickBrand(page, 'nbuy', 'Nokia')
  await page.getByTestId('nbuy-models').getByRole('button', { name: model.name, exact: true }).click()
  await expect(page.getByTestId('nbuy-preview')).toContainText(`Nokia • ${model.name}`)
  await page.getByTestId('nbuy-cost').fill('4000')
  await page.getByTestId('nbuy-asking').fill('3500')
  await expect(page.getByTestId('nbuy-asking-low')).toBeVisible()
  await expect(page.getByTestId('nbuy-add-device')).toBeDisabled()
  await page.getByTestId('nbuy-asking').fill('5000')
  await expect(page.getByTestId('nbuy-margin')).toContainText('+1,000')
  await page.getByTestId('nbuy-acc-charger-now').click()
  await page.screenshot({ path: 'test-results/newui-purchase-builder.png', fullPage: true })
  await page.getByTestId('nbuy-add-device').click()
  await expect(page.getByTestId('nbuy-line')).toHaveCount(1)

  // an accessory: the shop's own item is found, not made again
  await page.getByTestId('nbuy-tab-accessory').click()
  await page.getByTestId('nbuy-acc-name').fill('Fast Char')
  await page.getByTestId('nbuy-acc-hits').getByText('Fast Charger 25W').click()
  await page.getByTestId('nbuy-acc-qty').fill('5')
  await page.getByTestId('nbuy-acc-cost').fill('450')
  await page.getByTestId('nbuy-add-acc').click()
  // and a new one is made with the bill
  await page.getByTestId('nbuy-acc-name').fill('Clear Back Cover')
  await page.getByRole('button', { name: 'Cover', exact: true }).click()
  await page.getByTestId('nbuy-acc-qty').fill('10')
  await page.getByTestId('nbuy-acc-cost').fill('100')
  await page.getByTestId('nbuy-acc-price').fill('300')
  await page.getByTestId('nbuy-add-acc').click()
  // a typed line
  await page.getByTestId('nbuy-tab-custom').click()
  await page.getByTestId('nbuy-custom-desc').fill('TCS cargo')
  await page.getByTestId('nbuy-custom-cost').fill('250')
  await page.getByTestId('nbuy-add-custom').click()
  await expect(page.getByTestId('nbuy-line')).toHaveCount(4)
  await expect(page.getByTestId('nbuy-total')).toHaveText('Rs. 7,500') // 4,000 + 2,250 + 1,000 + 250

  // part on udhaar: 5,000 now, the rest owed to the dealer
  await page.getByTestId('nbuy-mode-udhaar').click()
  await page.getByTestId('nbuy-paid-now').fill('5000')
  await expect(page.getByTestId('nbuy-rest')).toHaveText('Rs. 2,500')
  await page.screenshot({ path: 'test-results/newui-purchase-bill.png', fullPage: true })
  await page.getByTestId('nbuy-put').click()
  await expect(page.getByTestId('nbuy-save')).toBeDisabled() // ticked first (owner 2026-11-09)
  await page.getByTestId('nbuy-review-ok').check()
  await page.getByTestId('nbuy-save').click()
  await expect(page.getByTestId('nbuy-saved')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('nbuy-bill-no')).toContainText('PUR-')
  await page.screenshot({ path: 'test-results/newui-purchase-saved.png', fullPage: true })

  // the server: the phone in stock, the charger's pieces added, the new cover made, the dealer owed 2,500
  const dev = await get('/devices/imei/490154203237518')
  expect(dev.found).toBeTruthy()
  expect(dev.device.status).toBe('in_stock')
  expect((await get(`/accessories/${charger.id}`)).qty).toBe(7)
  const items = await get('/accessories')
  expect(items.filter((i: { name: string }) => i.name === 'Fast Charger 25W')).toHaveLength(1)
  const cover = items.find((i: { name: string }) => i.name === 'Clear Back Cover')
  expect(cover.qty).toBe(10)
  expect(Number((await get(`/parties/${dealer.id}`)).balance)).toBe(-2500)

  // a customer's phone with the ID checked: it is not left pending
  await page.getByTestId('nbuy-next').click()
  await page.getByTestId('nbuy-src-walk_in').click()
  await page.getByTestId('nbuy-party').selectOption(seller.id)
  await page.getByTestId('nbuy-id-checked').click()
  await page.getByTestId('nbuy-imei').fill('356938035643809')
  await pickBrand(page, 'nbuy', 'Nokia')
  await page.getByTestId('nbuy-models').getByRole('button', { name: model.name, exact: true }).click()
  await page.getByTestId('nbuy-cost').fill('3000')
  await page.getByTestId('nbuy-add-device').click()
  await page.getByTestId('nbuy-put').click()
  await page.getByTestId('nbuy-review-ok').check()
  await page.getByTestId('nbuy-save').click()
  await expect(page.getByTestId('nbuy-saved')).toBeVisible({ timeout: 20_000 })
  const used = await get('/devices/imei/356938035643809')
  expect(used.device.verification_status).not.toBe('pending')

  // Urdu and a phone: no sideways scroll
  await page.getByTestId('nbuy-next').click()
  await page.setViewportSize({ width: 390, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})
