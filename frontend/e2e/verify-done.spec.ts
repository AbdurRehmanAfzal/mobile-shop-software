/** Owner (2026-10-29): after saving the ID check nothing said it worked. Now a result screen: what
 *  is still missing, or "can be sold" with a Sell button. */

import { expect, test } from '@playwright/test'

test('saving the ID check shows a result screen; a cleared phone can be sold from it', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Verify Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(`039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // a used phone (ID check pending), made through the API with the browser's login
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (path: string) => (await page.request.get(`http://localhost:8000/api/v1${path}`, { headers })).json()
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${brand.id}&q=105`))[0]
  const dev = await (await page.request.post('http://localhost:8000/api/v1/devices/opening-stock', { headers, data: { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'used', pta_status: 'pta_approved', cost_price: 800, asking_price: 1000 } })).json()

  await page.goto(`/stock/${dev.id}/verify`)
  await page.getByRole('button', { name: 'Clear', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  // saved, but photos and the CNIC are still missing
  await expect(page.getByText('Verification saved')).toBeVisible()
  await expect(page.getByText(/Still missing: .*CNIC/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sell this phone now' })).toHaveCount(0)
  await page.screenshot({ path: 'test-results/verify-pending.png', fullPage: true })
  await page.getByRole('button', { name: 'Change something' }).click()
  await expect(page.getByRole('button', { name: 'Save' })).toBeVisible()

  // the owner overrides with a reason: cleared, and the phone can be sold from here
  await page.getByRole('button', { name: 'Override' }).click()
  await page.getByLabel('Reason').fill('Known customer, seen the card')
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText('ID check complete. This phone can be sold.')).toBeVisible()
  await page.screenshot({ path: 'test-results/verify-done.png', fullPage: true })
  await page.getByRole('button', { name: 'Sell this phone now' }).click()
  await expect(page).toHaveURL(/\/sale\/new\?device=/)
  await expect(page.getByText(/Nokia 105/).first()).toBeVisible()
})
