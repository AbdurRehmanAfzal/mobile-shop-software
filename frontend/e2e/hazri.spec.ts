/** Owner (2026-10-30): hazri from Home (check in / out), the owner's attendance and activity tabs
 *  under Staff. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('hazri on home, attendance summary and marking, staff activity with the log', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Hazri Shop')
  await page.getByLabel('Your name').fill('Owner Sahib')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // Home: check in, then check out
  await expect(page.getByText('Not checked in yet today')).toBeVisible()
  await page.getByRole('button', { name: 'Check in' }).click()
  await expect(page.getByText(/^In at /)).toBeVisible()
  await page.screenshot({ path: 'test-results/hazri-home.png', fullPage: false })
  await page.getByRole('button', { name: 'Check out' }).click()
  await expect(page.getByText(/^In .* · Out /)).toBeVisible()
  await expect(page.getByText('Day done')).toBeVisible()

  // a sale by the owner through the API, for the activity tab
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${brand.id}&q=105`))[0]
  const dev = await (await page.request.post('http://localhost:8000/api/v1/devices/opening-stock', { headers, data: { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 800, asking_price: 1000 } })).json()
  const sale = await page.request.post('http://localhost:8000/api/v1/sales', { headers, data: { devices: [{ device_id: dev.id, price: 1000 }], paid: 1000 } })
  expect(sale.ok()).toBeTruthy()

  // Staff → Hazri: the owner is present today with hours; mark yesterday as leave
  await page.goto('/more/staff?tab=hazri')
  const card = page.locator('button.card').first()
  await expect(card).toContainText('Owner Sahib')
  await expect(card).toContainText('Present')
  await page.screenshot({ path: 'test-results/hazri-tab.png', fullPage: true })
  await card.click()
  const y = new Date(Date.now() - 86_400_000)
  const iso = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`
  await page.getByLabel('Day').fill(iso)
  await page.getByRole('button', { name: 'Leave', exact: true }).click()
  await page.getByLabel('Notes').fill('Eid')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Eid')).toBeVisible()
  await page.keyboard.press('Escape')

  // Staff → Activity: one sale of 1,000 today; the log names the bill
  await page.goto('/more/staff?tab=activity')
  const act = page.locator('button.card').first()
  await expect(act).toContainText('Owner Sahib')
  await expect(act).toContainText('1 · 1,000')
  await page.screenshot({ path: 'test-results/activity-tab.png', fullPage: true })
  await act.click()
  await expect(page.getByText(/Made · sale bill · INV-/)).toBeVisible()
  await expect(page.getByText(/Marked · hazri/)).toBeVisible()
})
