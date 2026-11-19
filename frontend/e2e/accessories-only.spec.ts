/** Owner 2026-11-19 (ADR-109): a shop that trades only accessories. The provider ticks
 *  "Accessories" and "Without mobiles" for it; the phone side of the app is not shown — Stock opens
 *  the items, Add stock has no device to add and nobody's phone to buy, Sell starts on the items.
 *  Needs 03990000099 in SUPERUSER_PHONES. */

import { expect, test } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
test.setTimeout(180_000)

test('accessories-only shop: no phone side; buy a carton of cables, sell pieces', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const ph = phone()
  const made = await (await request.post('/api/v1/auth/signup', { data: { shop_name: 'Cable House', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })).json()
  const h = { Authorization: `Bearer ${made.tokens.access_token}` }
  const sup = await (await request.post('/api/v1/auth/login', { data: { phone: SUPER.phone, password: SUPER.password } })).json()
  const on = await request.patch(`/api/v1/admin/shops/${made.me.active_shop_id}/modules`, { headers: { Authorization: `Bearer ${sup.tokens.access_token}` }, data: { modules: ['accessories', 'expenses', 'reports', 'exports', 'no_mobiles'] } })
  expect(on.ok(), await on.text()).toBeTruthy()
  await request.post('/api/v1/parties', { headers: h, data: { name: 'Cable Dealer', phone: '03016660055', kinds: ['supplier'] } })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })

  // home: items, not IMEIs; the Stock tab opens the items
  await expect(page.getByPlaceholder("Item, serial number or person's name")).toBeVisible()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toHaveCount(0)
  await expect(page.getByText('Items in stock').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/acc-only-home.png', fullPage: true })
  await page.locator('nav').getByRole('link', { name: 'Stock' }).click()
  await expect(page).toHaveURL(/\/accessories/)

  // More: no phone screens
  await page.goto('/more')
  await expect(page.getByText('Accessories').first()).toBeVisible()
  await expect(page.getByText('IMEI search')).toHaveCount(0)

  // add stock: only from a dealer, only items
  await page.goto('/purchase/new')
  await expect(page.getByText('Where is the stock coming from?')).toBeVisible()
  await expect(page.getByText("Buy a customer's phone")).toHaveCount(0)
  await page.getByRole('button', { name: /From a dealer/ }).click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Cable Dealer')
  await page.getByText('Cable Dealer').first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('button', { name: 'Add device' })).toHaveCount(0)
  await expect(page.getByTestId('add-locked')).toHaveCount(0)
  await page.getByRole('button', { name: 'Add accessory / watch' }).click()
  await page.getByRole('button', { name: 'New item (not in the list)' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Type-C cable 1m')
  await page.getByRole('button', { name: 'Cable', exact: true }).click()
  await page.getByLabel('Selling price (each)').fill('500')
  await page.getByRole('button', { name: 'Save and add' }).click()
  await page.getByLabel('Qty').fill('120')
  await page.getByLabel('Unit cost').fill('250')
  await page.screenshot({ path: 'test-results/acc-only-buy.png', fullPage: true })
  await page.getByTestId('purchase-review-open').click()
  await page.getByTestId('review-ok').check()
  await page.getByTestId('purchase-save').click()
  await expect(page.getByText('Purchase saved')).toBeVisible()

  // sell: no phone list, the items button first
  await page.goto('/sale/new')
  await expect(page.getByText('Add the items you are selling').first()).toBeVisible()
  await expect(page.getByText('Tap the phone you are selling')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/acc-only-sell.png', fullPage: true })
  await page.getByTestId('sell-item').click()
  await page.getByText('Type-C cable 1m').click()
  await expect(page.getByText('In stock: 120')).toBeVisible()
  if (await page.getByTestId('walk-in-tick').isVisible()) await page.getByTestId('walk-in-tick').check()
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()
  const items = await (await request.get('/api/v1/accessories', { headers: h })).json()
  expect(items.find((x: { name: string }) => x.name === 'Type-C cable 1m').qty).toBe(119)

  // the server refuses a phone whatever the app shows
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const no = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: '490154203237518', brand_id: b.id, model_id: ms[0].id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 1000, asking_price: 1500 } })
  expect(no.status()).toBe(403)
})
