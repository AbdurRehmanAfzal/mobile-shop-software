/** ADR-134: the new product's stock summary, drawn from mock-up `…pos_stock_ui (4)` screen 1 —
 *  the obsidian hero with the worth, what a unit costs, the top category and the stock's health;
 *  the kinds that hold stock as big cards with their share bar; the empty kinds as a compact row
 *  with "+ Add"; and the three export cards. Every figure is the server's. */

import { expect, test } from '@playwright/test'

test('new product: the stock summary as the mock-up draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Stock Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  for (const [imei, cost] of [['490154203237518', 4000], ['356938035643809', 6000]] as const) {
    const r = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: imei, brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: cost, asking_price: cost + 1000 } })
    expect(r.ok(), await r.text()).toBeTruthy()
  }
  for (const data of [
    { name: 'Fast Charger', category: 'charger', price: 800, reorder_level: 3, opening_qty: 10, opening_cost: 450 },
    { name: 'Back Cover', category: 'cover', price: 300, reorder_level: 5, opening_qty: 2, opening_cost: 100 },
  ]) expect((await request.post('/api/v1/accessories', { headers: h, data })).ok()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/stock/summary')
  await expect(page.getByTestId('nsum')).toBeVisible()
  // the hero: 10,000 of phones + 4,700 of accessories
  await expect(page.getByTestId('nsum-worth')).toHaveText('Rs. 14,700')
  const sub = page.getByTestId('nsum-sub')
  await expect(sub).toContainText('2 phones')
  await expect(sub).toContainText('1 brands')
  await expect(sub).toContainText('1 models')
  await expect(sub).toContainText('12 pieces of accessories')
  await expect(page.getByTestId('nsum-avg')).toContainText('Rs. 5,000') // 10,000 over two phones
  await expect(page.getByTestId('nsum-top')).toContainText('Mobiles')
  await expect(page.getByTestId('nsum-top')).toContainText('Nokia')
  await expect(page.getByTestId('nsum-health')).toContainText('1 items running low')

  // the kinds that hold stock, with their share of the whole
  const cards = page.getByTestId('nsum-cards')
  await expect(cards.getByRole('link')).toHaveCount(2)
  const phones = page.getByTestId('nsum-card-phone')
  await expect(phones).toContainText('2 phones')
  await expect(phones).toContainText('Rs. 10,000')
  await expect(phones).toContainText('Most: Nokia (2)')
  await expect(phones).toContainText('68%')
  await expect(page.getByTestId('nsum-card-items')).toContainText('1 items running low')

  // the empty kinds, and the three sheets
  const empty = page.getByTestId('nsum-empty')
  await expect(empty.getByRole('link')).toHaveCount(2) // tablets and smartwatches
  await expect(page.getByTestId('nsum-empty-watch')).toContainText('+ Add')
  await expect(page.getByTestId('nsum-sheets').locator('> div')).toHaveCount(3)
  await expect(page.getByTestId('nsum-print-owner')).toBeVisible() // the owner may print both
  await expect(page.getByTestId('nsum-print-staff')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/newui-stock.png', fullPage: true })
  await page.getByTestId('newui-theme').click()
  await page.screenshot({ path: 'test-results/newui-stock-dark.png', fullPage: true })
  await page.getByTestId('newui-theme').click()

  // a card opens that kind; the drill-down is drawn next, so it says so for now
  await phones.click()
  await expect(page).toHaveURL(/\/new\/stock\/summary\?kind=phone$/)
  await expect(page.getByTestId('newui-open-old')).toHaveAttribute('href', '/stock/summary?kind=phone')

  // a salesman sees the selling price, never the cost
  const sm = `034${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  expect((await request.post('/api/v1/staff', { headers: h, data: { name: 'Sales', phone: sm, password: 'e2e-secret-2', role: 'salesman' } })).ok()).toBeTruthy()
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('locale', 'en') })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(sm.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-2')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })
  await page.goto('/new/stock/summary')
  await expect(page.getByTestId('nsum-worth')).toHaveText('Rs. 20,600') // 12,000 asking + 8,600
  await expect(page.getByTestId('nsum-print-owner')).toHaveCount(0) // he must ask the owner first
  await expect(page.getByTestId('nsum-ask')).toBeVisible()
})
