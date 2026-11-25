/** ADR-134: one stock item's page in the new product (an accessory, the "Accessories" view of files
 *  17 / 20): its figures are the server's (`/accessories/{id}`), the item ledger is its timeline with
 *  the pieces after each movement, an adjustment needs a reason and is undone with one, Sell opens the
 *  counter with the item on the bill. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)

test('new product: a stock item\'s page — stock, cost, ledger, adjust and undo, sell, sticker, Urdu', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Item Stock', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const r = await request.post('/api/v1/accessories', { headers: h, data: { name: 'AirPods Pro 2 Case', category: 'charger', price: 1200, opening_qty: 10, opening_cost: 700, location: 'Wall hook B-4', warranty_days: 7 } })
  expect(r.ok(), await r.text()).toBeTruthy()
  const item = await r.json()
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto(`/new/stock-item/${item.id}`)
  await expect(page.getByTestId('nsi-title')).toHaveText('AirPods Pro 2 Case')
  await expect(page.getByTestId('nsi-status')).toContainText('10 in stock')
  const it = await get(`/accessories/${item.id}`)
  await expect(page.getByTestId('nsi-avg')).toContainText(fmt(it.avg_cost))
  await expect(page.getByTestId('nsi-value')).toContainText(fmt(it.stock_value))
  await expect(page.getByTestId('nsi-profit')).toContainText(fmt(it.profit))
  await expect(page.getByTestId('nsi-identity')).toContainText('Wall hook B-4')
  await expect(page.getByTestId('nsi-warranty')).toContainText('7 days')
  await expect(page.getByTestId('nsi-batch')).toHaveCount(1)
  await expect(page.getByTestId('nsi-row')).toHaveCount((await get(`/accessories/${item.id}/timeline`)).length)
  await page.screenshot({ path: 'test-results/newui-stock-item.png', fullPage: true })

  // adjust: two broken, with a reason; then undone with a reason
  await page.getByTestId('nsi-adjust').click()
  await page.getByTestId('nsi-delta').fill('-2')
  await page.getByTestId('nsi-adjust-note').fill('Two cracked in the box')
  await page.getByTestId('nsi-adjust-save').click()
  await expect(page.getByTestId('nsi-status')).toContainText('8 in stock')
  expect((await get(`/accessories/${item.id}`)).qty).toBe(8)
  await page.getByTestId('nsi-undo').first().click()
  await page.getByTestId('nsi-undo-why').fill('counted wrong')
  await page.getByTestId('nsi-undo-yes').click()
  await expect(page.getByTestId('nsi-status')).toContainText('10 in stock')
  expect((await get(`/accessories/${item.id}`)).qty).toBe(10)

  // the sticker is the server's; the pitch is copied
  await expect(page.getByTestId('nitem-sticker-frame')).toBeVisible()
  await page.getByTestId('nsi-pitch').click()
  await expect(page.getByTestId('nsi-toast')).toContainText('copied')

  // Sell opens the counter with one piece on the bill
  await page.getByTestId('nsi-sell').click()
  await expect(page).toHaveURL(new RegExp(`/new/sale/new\\?item=${item.id}`))
  await expect(page.getByTestId('npos-line')).toHaveCount(1)

  // Urdu: one language, right to left
  await page.goto(`/new/stock-item/${item.id}`)
  await page.getByTestId('nsi-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-stock-item-ur.png', fullPage: true })
})
