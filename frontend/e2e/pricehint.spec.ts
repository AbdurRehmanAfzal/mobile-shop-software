/** Owner (2026-10-30): the rate suggestion from the shop's own sales, in the sale, in add-stock and
 *  in the change-price sheet. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('rate suggestion: last sold, range, one tap to use it', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Rate Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${brand.id}&q=105`))[0]
  const stock = (imei: string, cost: number, asking: number) => post('/devices/opening-stock', { imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'used', pta_status: 'pta_approved', cost_price: cost, asking_price: asking })
  const a = await stock('490154203237518', 800, 1000)
  const b = await stock('356938035643809', 850, 1100)
  await post('/sales', { devices: [{ device_id: a.id, price: 1000 }], paid: 1000, override_reason: 'known' })
  await post('/sales', { devices: [{ device_id: b.id, price: 1240 }], paid: 1240, override_reason: 'known' })
  const c = await stock('353879234567891', 900, 1300)

  // the sale: the hint under the price, one tap sets 1,100 (median rounded)
  await page.goto(`/sale/new?device=${c.id}`)
  const hint = page.getByTestId('price-hint')
  await expect(hint).toContainText('Last sold Rs. 1,240')
  await expect(hint).toContainText('2 sold in 6 months: Rs. 1,000 – 1,240')
  await expect(hint).toContainText('Usually bought at Rs. 825')
  await page.screenshot({ path: 'test-results/price-hint-sale.png', fullPage: true })
  await hint.getByRole('button', { name: 'Use 1,100' }).click()
  await expect(page.getByLabel('Sold for (Rs)')).toHaveValue('1100')

  // change price on the phone's page
  await page.goto(`/stock/${c.id}`)
  await page.getByRole('button', { name: 'Change asking price' }).click()
  await expect(page.getByTestId('price-hint')).toContainText('Last sold Rs. 1,240')
  await page.getByRole('button', { name: 'Use 1,100' }).click()
  await expect(page.getByLabel('Asking price')).toHaveValue('1100')
  await page.keyboard.press('Escape')

  // add stock: the hint appears once the model is picked
  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill('358812091717195')
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await expect(page.getByTestId('price-hint')).toContainText('Last sold Rs. 1,240')
  await page.getByRole('button', { name: 'Use 1,100' }).click()
  await expect(page.getByLabel('Asking price')).toHaveValue('1100')
})
