/** Owner (2026-10-29): a stock alert on Home for counted items that ran low, and search by the
 *  customer's phone in the stock list and in repairs. */

import { expect, test } from '@playwright/test'

test('low-stock alert on Home opens the low tab; sold phone and repair found by the customer phone', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Alert Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(`039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post(`http://localhost:8000/api/v1${path}`, { headers, data })
    expect(r.ok(), `${path}: ${await r.text()}`).toBeTruthy()
    return r.json()
  }
  const get = async (path: string) => (await page.request.get(`http://localhost:8000/api/v1${path}`, { headers })).json()
  // a cable with 2 left and a reorder level of 3; a phone sold to Ahmed; a repair for Ahmed
  await post('/accessories', { name: 'Type-C cable', category: 'cable', price: 300, reorder_level: 3, opening_qty: 2, opening_cost: 150 })
  const ahmed = await post('/parties', { name: 'Ahmed Khan', phone: '03219876543', kinds: ['customer'] })
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${brand.id}&q=105`))[0]
  const dev = await post('/devices/opening-stock', { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 800, asking_price: 1000 })
  await post('/sales', { party_id: ahmed.id, devices: [{ device_id: dev.id, price: 1000 }], paid: 1000 })
  await post('/repairs', { party_id: ahmed.id, device_desc: 'Samsung A54', imei: '356938035643809', fault_codes: ['screen'], estimate: 6000 })

  await page.goto('/')
  const alert = page.getByRole('link', { name: /1 items low on stock/ })
  await expect(alert).toBeVisible()
  await page.screenshot({ path: 'test-results/home-low-stock.png', fullPage: true })
  await alert.click()
  await expect(page).toHaveURL(/\/accessories\?tab=low/)
  await expect(page.getByText('Type-C cable')).toBeVisible()
  await expect(page.getByText('Low stock').first()).toBeVisible()

  // the sold phone by the buyer's phone number
  await page.goto('/stock')
  await page.getByRole('button', { name: 'Sold', exact: true }).click()
  await page.getByPlaceholder('IMEI, model, brand, name or phone').fill('03219876543')
  await expect(page.getByText(/Nokia 105/).first()).toBeVisible()
  await page.getByPlaceholder('IMEI, model, brand, name or phone').fill('03001112233')
  await expect(page.getByText(/Nokia 105/)).toHaveCount(0)

  // the repair by phone, then by job number
  await page.goto('/repairs')
  await page.getByPlaceholder('Job no, IMEI, name or phone').fill('0321987')
  await expect(page.getByText(/REP-000001/).first()).toBeVisible()
  await page.getByPlaceholder('Job no, IMEI, name or phone').fill('Nobody')
  await expect(page.getByText(/REP-000001/)).toHaveCount(0)
})
