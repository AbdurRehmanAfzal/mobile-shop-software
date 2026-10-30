/** Owner (2026-10-29): the laptop layout. Side menu with F-keys, wide content, home in two columns,
 *  and the sale screen side by side: stock on the left, the bill on the right, no step switching. */

import { devices, expect, test } from '@playwright/test'

test.use({ ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } })

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('laptop: side menu, two-column home, side-by-side sale, F-keys', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Laptop Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // the side menu carries the jobs with their keys; the phone's bottom tabs are gone
  const aside = page.locator('aside')
  await expect(aside.getByRole('link', { name: /Sell/ })).toBeVisible()
  await expect(aside.getByText('F2')).toBeVisible()
  await expect(page.locator('nav.fixed')).toBeHidden()
  // home: hisaab card and the khata cards sit side by side (same row)
  const hisaab = page.getByText('Sales', { exact: true }).first()
  const toGet = page.getByText('I will get', { exact: true }).first()
  const [hb, kb] = [await hisaab.boundingBox(), await toGet.boundingBox()]
  expect(hb && kb && Math.abs(hb.y - kb.y) < 200 && kb.x > hb.x + 200).toBeTruthy()
  await page.screenshot({ path: 'test-results/laptop-home.png', fullPage: true })

  // a phone in stock
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${brand.id}&q=105`))[0]
  const r = await page.request.post('http://localhost:8000/api/v1/devices/opening-stock', { headers, data: { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 800, asking_price: 1000 } })
  expect(r.ok()).toBeTruthy()

  // sale: the stock list and the bill at once; a tap fills the bill, the list stays
  await page.keyboard.press('F2')
  await expect(page).toHaveURL(/\/sale\/new$/)
  await expect(page.getByRole('button', { name: 'Complete sale' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Complete sale' })).toBeDisabled()
  const row = page.getByRole('button', { name: /Nokia/ }).first()
  await expect(row).toBeVisible()
  const [rb, cb] = [await row.boundingBox(), await page.getByRole('button', { name: 'Complete sale' }).boundingBox()]
  expect(rb && cb && cb.x > rb.x + rb.width - 1).toBeTruthy()
  await row.click()
  await expect(page.getByLabel('Sold for (Rs)')).toHaveValue('1000')
  await expect(row).toBeVisible()
  await expect(page.getByRole('button', { name: 'Complete sale' })).toBeEnabled()
  await page.screenshot({ path: 'test-results/laptop-sale.png', fullPage: true })
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  // F3 opens add stock; the stock list is two cards wide
  await page.keyboard.press('F3')
  await expect(page).toHaveURL(/\/purchase\/new$/)
  await page.goto('/stock?status=all')
  await page.screenshot({ path: 'test-results/laptop-stock.png', fullPage: true })
  await page.goto('/khata')
  await page.screenshot({ path: 'test-results/laptop-khata.png', fullPage: true })
})
