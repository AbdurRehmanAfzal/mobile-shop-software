/** Core flow on a phone viewport: sign up a fresh shop → add a customer → sell from stock on credit →
 *  dashboard shows the sale, customer owes the remainder. Each run uses a new throwaway shop. */

import { expect, test, type Page } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function token(page: Page): Promise<string> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state.accessToken as string)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
})

test('signup → customer → credit sale → dashboard and balance', async ({ page, request }) => {
  const ownerPhone = phone()
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('E2E Mobiles')
  await page.getByLabel('Your name').fill('E2E Owner')
  await page.getByLabel('Mobile number').fill(ownerPhone)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // Stock via API (the purchase wizard has its own test later)
  const auth = { Authorization: `Bearer ${await token(page)}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: auth })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}&q=105`, { headers: auth })).json()
  const dev = await request.post('/api/v1/devices/opening-stock', {
    headers: auth,
    data: { imei1: '490154203237518', brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 800, asking_price: 1000 },
  })
  expect(dev.status()).toBe(201)

  // Customer via UI
  await page.goto('/parties')
  await page.getByRole('button', { name: 'New person' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Ahmed Khan')
  await page.getByLabel('Mobile number').fill('03219876543')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Ahmed Khan').first()).toBeVisible()

  // Sale in three steps: tap the phone -> price is filled -> udhaar to Ahmed, 400 paid now
  await page.goto('/sale/new')
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await expect(page.getByLabel('Sold for (Rs)')).toHaveValue('1000')
  await page.getByRole('button', { name: 'Udhaar', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Complete sale' })).toBeDisabled()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Ahmed')
  await page.getByRole('button', { name: /Ahmed Khan/ }).first().click()
  await page.getByLabel('Paid now (if any)').fill('400')
  await page.screenshot({ path: 'test-results/sale-step2.png', fullPage: true })
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()
  await expect(page.getByRole('button', { name: /Print receipt/ })).toBeVisible()

  // Home answers "how much sold today, how much on udhaar" without any tapping
  await page.goto('/')
  await expect(page.getByTestId('glance')).toContainText('1,000') // at a glance: today's sales
  await expect(page.locator('section').getByText('600', { exact: true }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/home-after-sale.png', fullPage: true })

  // Customer owes 600
  const parties = await (await request.get('/api/v1/parties?q=Ahmed', { headers: auth })).json()
  expect(parties[0].balance).toBe('600.00')
})
