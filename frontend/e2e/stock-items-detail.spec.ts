/** Owner 2026-11-22 (ADR-130): a shopkeeper who taps Stock sees the accessories there too, with
 *  their details — code, kind, brand, what it fits, pieces, price, running low / finished. The
 *  first ten, the rest opened in place; the phones stay below, and a row opens the item. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)

test('accessories with their details on the stock screen', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Mixed Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  // twelve items (names sort A01 … A12): one finished, one running low, one with every detail
  for (let n = 1; n <= 12; n++) {
    const two = String(n).padStart(2, '0')
    const data = n === 1
      ? { name: `A${two} Fast Charger`, category: 'charger', brand: 'Anker', color: 'White', compatible: 'iPhone 15', wattage: '25W', location: 'Shelf 2', price: 2200, reorder_level: 2, opening_qty: 12, opening_cost: 1500 }
      : n === 2
        ? { name: `A${two} Back Cover`, category: 'cover', price: 500, reorder_level: 5, opening_qty: 0 }
        : n === 3
          ? { name: `A${two} Glass`, category: 'glass', price: 300, reorder_level: 5, opening_qty: 3, opening_cost: 100 }
          : { name: `A${two} Cable`, category: 'cable', price: 400, reorder_level: 1, opening_qty: 20, opening_cost: 150 }
    const r = await request.post('/api/v1/accessories', { headers: h, data })
    expect(r.ok(), await r.text()).toBeTruthy()
  }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: '490154203237518', brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 4000, asking_price: 5000 } })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })

  await page.goto('/stock')
  const box = page.getByTestId('stock-items')
  const rows = box.getByTestId('stock-item-row')
  await expect(rows).toHaveCount(10)
  // the details of an item, as on the items' own screen
  const first = rows.first()
  await expect(first).toContainText('A01 Fast Charger')
  for (const fact of ['Charger', 'Anker', 'White', 'iPhone 15', 'Shelf 2']) await expect(first.getByTestId('stock-item-facts')).toContainText(fact)
  await expect(first.getByTestId('stock-item-qty')).toHaveText('12')
  await expect(first.getByTestId('stock-item-price')).toHaveText('Rs. 2,200')
  await expect(first.getByTestId('stock-item-flag')).toHaveCount(0)
  // finished and running low are said on the row
  await expect(rows.nth(1).getByTestId('stock-item-flag')).toHaveText('Out of stock')
  await expect(rows.nth(1).getByTestId('stock-item-qty')).toHaveText('0')
  await expect(rows.nth(2).getByTestId('stock-item-flag')).toHaveText('Low stock')
  // the rest opens in place, and folds back
  await box.getByTestId('stock-items-all').click()
  await expect(rows).toHaveCount(12)
  await expect(box.getByTestId('stock-items-all')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/stock-items-detail.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  await box.getByTestId('stock-items-less').click()
  await expect(rows).toHaveCount(10)
  // the phones are still there, below
  await expect(page.getByTestId('stock-summary-line')).toContainText('1 phones')
  await expect(page.getByText('490154203237518').first()).toBeVisible()
  // the search finds an item by what it fits; a row opens the item
  await page.getByPlaceholder('IMEI, model, brand, name').fill('A03')
  await expect(rows).toHaveCount(1)
  await rows.first().click()
  await expect(page).toHaveURL(/\/accessories\/[0-9a-f-]+$/)
})
