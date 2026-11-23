/** ADR-134: one kind of stock brand by brand, from `11-frame-stock-summary-and-dashboard.html`
 *  screen 2 — the heading with the kind's worth and counts, the capital bar of the biggest brands
 *  and the rest (the server's percentages), search, the three orders, brands opening into models,
 *  a model opening the stock list; accessories by their kind. */

import { expect, test } from '@playwright/test'

test('new product: a kind brand by brand, as the mock-up draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Drill Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const brands = await get('/catalogue/brands')
  const brand = (name: string) => brands.find((b: { name: string }) => b.name === name)
  const add = async (b: string, imei: string, cost: number, at = 0) => {
    const models = await get(`/catalogue/models?brand_id=${brand(b).id}`)
    const r = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: imei, brand_id: brand(b).id, model_id: models[at].id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: cost, asking_price: cost + 1000 } })
    expect(r.ok(), await r.text()).toBeTruthy()
  }
  // Nokia: two phones of one model (4,000 + 6,000) and one of another (2,000); Samsung: one (8,000)
  await add('Nokia', '490154203237518', 4000)
  await add('Nokia', '356938035643809', 6000)
  await add('Nokia', '352099001761481', 2000, 1)
  await add('Samsung', '354017325928014', 8000)
  expect((await request.post('/api/v1/accessories', { headers: h, data: { name: 'Fast Charger', category: 'charger', price: 800, opening_qty: 10, opening_cost: 450 } })).ok()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/stock/summary')
  await page.getByTestId('nsum-card-phone').click()
  await expect(page.getByTestId('ndrill')).toBeVisible()
  await expect(page.getByTestId('ndrill-worth')).toHaveText('Rs. 20,000')
  await expect(page.getByTestId('ndrill-counts')).toHaveText('4 phones · 2 brands · 3 models')
  // the capital bar: Nokia 60%, Samsung 40% — the server's figures
  const bar = page.getByTestId('ndrill-bar')
  await expect(bar).toContainText('Nokia (60%)')
  await expect(bar).toContainText('Samsung (40%)')
  await expect(bar).toContainText('Top 2 brands hold 100% of the Mobiles investment')
  // highest value first: Nokia; by units: Nokia; by average: Samsung (8,000 against 4,000)
  const list = page.getByTestId('ndrill-brand')
  await expect(list).toHaveCount(2)
  await expect(list.first()).toContainText('Nokia')
  await expect(list.first()).toContainText('3 phones · Avg Rs. 4,000')
  await page.getByTestId('ndrill-sort-avg').click()
  await expect(list.first()).toContainText('Samsung')
  await page.getByTestId('ndrill-sort-value').click()
  // a brand opens into its models, with each one's part of the brand
  await list.first().getByRole('button').click()
  const models = page.getByTestId('ndrill-model')
  await expect(models).toHaveCount(2)
  await expect(models.first()).toContainText('2 phones')
  await expect(models.first()).toContainText('Rs. 10,000')
  await expect(models.first()).toContainText('83.3% of Nokia')
  await page.screenshot({ path: 'test-results/newui-drill.png', fullPage: true })
  // a search opens the brand that has the model
  await page.getByTestId('ndrill-search').fill('zzz-none')
  await expect(page.getByTestId('ndrill-none')).toContainText('No brand or model matched')
  await page.getByTestId('ndrill-search').fill('Samsung')
  await expect(list).toHaveCount(1)
  await page.getByTestId('ndrill-search').fill('')
  // a model opens its pieces in the stock list (not drawn yet → the live list, filtered);
  // Nokia is still open from before
  await expect(list.first()).toHaveAttribute('class', /border-obsidian-900/)
  await models.first().click()
  await expect(page).toHaveURL(/\/new\/stock\?model_id=/)
  await expect(page.getByTestId('newui-open-old')).toHaveAttribute('href', /^\/stock\?model_id=.+&category=phone$/)
  // accessories have no brands: their kinds, in the same cards
  await page.goto('/new/stock/summary?kind=items')
  await expect(page.getByTestId('ndrill-worth')).toHaveText('Rs. 4,500')
  await expect(page.getByTestId('ndrill-item-kind')).toHaveCount(1)
  await expect(page.getByTestId('ndrill-item-kind')).toContainText('10 pieces')
  // back to the summary
  await page.getByTestId('ndrill-back').click()
  await expect(page.getByTestId('nsum')).toBeVisible()
  // Urdu: no sideways scroll, the page reads right to left
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.goto('/new/stock/summary?kind=phone')
  await expect(page.getByTestId('ndrill')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/newui-drill-ur.png', fullPage: true })
})
