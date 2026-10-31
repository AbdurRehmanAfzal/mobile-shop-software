/** Shop Audit → Products and Bills (docs/17 P7): performance classes with their thresholds,
 *  sold vs bought, and the document audit by kind / status / employee with the voided list. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('products with classes and the bills audit', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Product Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const brand = (await get('/catalogue/brands'))[0]
  const model = (await get(`/catalogue/models?brand_id=${brand.id}`))[0]
  const dev = (imei: string) => ({ imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' })
  const dealer = await post('/parties', { name: 'Dealer', phone: '03005556666', kinds: ['supplier'] })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, devices: ['490154203237518', '356938035643809', '352099001761481'].map((i) => ({ device: dev(i), cost: 800, asking_price: 1000 })), paid: 2400 })
  const [a, b, c] = pur.lines.map((l: { device_id: string }) => l.device_id)
  await post('/sales', { devices: [{ device_id: a, price: 1000 }], paid: 1000 })
  await post('/sales', { devices: [{ device_id: b, price: 1200 }], paid: 1200 })
  await post('/sales', { misc: [{ description: 'Charger', qty: 1, unit_price: 300, cost: 150 }], paid: 300 })
  const v = await post('/sales', { devices: [{ device_id: c, price: 1000 }], paid: 1000 })
  await post(`/sales/${v.id}/void`, { reason: 'typed twice' })

  await page.goto('/audit/products?preset=this_month')
  const kpis = page.getByTestId('prod-kpis')
  await expect(kpis).toContainText('3')
  await expect(kpis).toContainText('Rs. 2,500')
  await expect(kpis).toContainText('Rs. 750')
  const rows = page.getByTestId('prod-rows')
  await expect(rows.locator('a').first()).toContainText(brand.name)
  await expect(rows.locator('a').first()).toContainText('Top')
  await expect(rows.locator('a').first()).toContainText('avg price 1,100')
  await expect(rows.locator('a').nth(1)).toContainText('Charger')
  await expect(rows.locator('a').nth(1)).toContainText('Low')
  await expect(page.getByText(/Top = 20% of units/)).toBeVisible()
  await page.getByRole('button', { name: 'Low', exact: true }).click()
  await expect(rows.locator('a')).toHaveCount(1)
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await page.getByRole('button', { name: 'By brand', exact: true }).click()
  await expect(page).toHaveURL(/group=brand/)
  await expect(page.getByTestId('prod-rows').locator('a').first()).toContainText(brand.name)
  await page.screenshot({ path: 'test-results/audit-products.png', fullPage: true })

  await page.getByRole('main').getByRole('link', { name: 'Bills' }).click()
  await expect(page).toHaveURL(/\/audit\/bills/)
  const kinds = page.getByTestId('bills-kinds')
  await expect(kinds).toContainText('Sale bills')
  await expect(kinds).toContainText('1 voided')
  await expect(kinds).toContainText('Purchase bills')
  await expect(page.getByTestId('bills-users')).toContainText('Owner')
  const voided = page.getByTestId('bills-voided')
  await expect(voided).toContainText('typed twice')
  await expect(voided).toContainText('1,000')
  await page.screenshot({ path: 'test-results/audit-bills.png', fullPage: true })
  await kinds.getByRole('link', { name: /Sale bills/ }).click()
  await expect(page).toHaveURL(/\/invoices\?kind=sale/)
})
