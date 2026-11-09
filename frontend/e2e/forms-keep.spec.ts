/** Owner 2026-11-09: a tap beside a form by mistake must not close it; Back in a step-by-step form
 *  goes to the previous step with everything kept; stickers show even when the browser blocks the
 *  new tab (tablets). */

import { expect, test, type APIRequestContext } from '@playwright/test'

test.setTimeout(120_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function shop(request: APIRequestContext) {
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Keep Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const r = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: '490154203237518', brand_id: nokia.id, model_id: models[0].id, condition: 'used', pta_status: 'pta_approved', cost_price: 800, asking_price: 1000 } })
  expect(r.ok(), await r.text()).toBeTruthy()
  return { ph, device: (await r.json()).id as string, model: models[0].name as string }
}

test('forms keep what was filled in', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const { ph, device, model } = await shop(request)
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // 1. a tap beside a half-filled form does not close it
  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill('356938035643809')
  await page.getByTestId('sheet-backdrop').click({ position: { x: 5, y: 5 } })
  await expect(page.getByTestId('sheet-keep')).toBeVisible()
  await expect(page.getByLabel('IMEI', { exact: true })).toHaveValue('356938035643809')
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByLabel('IMEI', { exact: true })).toHaveCount(0)

  // 2. sell: step 2 → Back → step 1 with the phone kept; forward again; the step bar
  await page.goto(`/sale/new?device=${device}`)
  await expect(page.getByText('2/3')).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByText('1/3')).toBeVisible()
  await expect(page).toHaveURL(/\/sale\/new/)
  await page.goForward()
  await expect(page.getByText('2/3')).toBeVisible()
  await expect(page.getByText(model).first()).toBeVisible()
  await page.getByTestId('step-1').click()
  await expect(page.getByText('1/3')).toBeVisible()

  // 3. stickers when the browser blocks the new tab: shown inside the app
  await page.addInitScript(() => { window.open = () => null })
  await page.goto(`/stock/${device}`)
  await page.getByRole('button', { name: /print sticker/i }).first().click()
  await page.getByRole('button', { name: 'Print', exact: true }).last().click()
  await expect(page.getByTestId('print-overlay')).toBeVisible()
  await expect(page.frameLocator('[data-testid="print-overlay"] iframe').locator('svg').first()).toBeVisible()
  await page.getByTestId('print-overlay').getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('print-overlay')).toHaveCount(0)
})
