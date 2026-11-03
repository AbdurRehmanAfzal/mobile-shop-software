/** Owner 2026-11-03 ("consent sign"): the seller signs the purchase declaration on the screen; the
 *  signature is kept with the ID check and printed on the declaration. */

import { expect, test } from '@playwright/test'

test('seller signs on the screen; the declaration prints the signature', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Sign Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(`039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (path: string) => (await page.request.get(`http://localhost:8000/api/v1${path}`, { headers })).json()
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${brand.id}&q=105`))[0]
  const dev = await (await page.request.post('http://localhost:8000/api/v1/devices/opening-stock', { headers, data: { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'used', pta_status: 'pta_approved', cost_price: 800, asking_price: 1000 } })).json()

  await page.goto(`/stock/${dev.id}/verify`)
  const pad = page.getByTestId('signature-pad').locator('canvas')
  await pad.scrollIntoViewIfNeeded()
  const box = (await pad.boundingBox())!
  await page.mouse.move(box.x + 20, box.y + box.height / 2)
  await page.mouse.down()
  for (let i = 1; i <= 12; i++) await page.mouse.move(box.x + 20 + i * 18, box.y + box.height / 2 + (i % 2 ? -25 : 25))
  await page.mouse.up()
  await page.getByRole('button', { name: 'Use this signature' }).click()
  await expect(page.getByTestId('signature-saved')).toBeVisible()
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Verification saved')).toBeVisible()
  // the declaration carries the signature image
  const html = await (await page.request.get(`http://localhost:8000/api/v1/devices/${dev.id}/verification/declaration?lang=en`, { headers })).text()
  expect(html).toContain('data:image/png;base64,')
})
