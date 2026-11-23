/** Owner 2026-11-22 (ADR-131): tapping Stock opens a card per kind of stock — mobiles, tablets,
 *  watches, accessories — each with its pieces, worth, brands and models. A card opens that kind:
 *  its brands, then models, then those pieces in the stock list; accessories open by their kind. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)

test('stock: a card per kind, then brands, models and the list', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Kinds Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const brands = await get('/catalogue/brands')
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await get(`/catalogue/models?brand_id=${nokia.id}`)
  // two phones (cost 4,000 + 6,000), one tablet (cost 50,000)
  for (const [imei, cost] of [['490154203237518', 4000], ['356938035643809', 6000]] as const) {
    const r = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: imei, brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: cost, asking_price: cost + 1000 } })
    expect(r.ok(), await r.text()).toBeTruthy()
  }
  const tabBrand = await (await request.post('/api/v1/catalogue/brands', { headers: h, data: { name: 'Tabco' } })).json()
  const tabModel = await (await request.post('/api/v1/catalogue/models', { headers: h, data: { brand_id: tabBrand.id, name: 'Tab One', category: 'tablet' } })).json()
  const tab = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { category: 'tablet', cellular: true, imei1: '352099001761481', brand_id: tabBrand.id, model_id: tabModel.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 50000, asking_price: 60000 } })
  expect(tab.ok(), await tab.text()).toBeTruthy()
  // accessories: 10 chargers at cost 450, 2 covers at cost 100 (low), a glass with none
  for (const data of [
    { name: 'Fast Charger', category: 'charger', price: 800, reorder_level: 3, opening_qty: 10, opening_cost: 450 },
    { name: 'Back Cover', category: 'cover', price: 300, reorder_level: 5, opening_qty: 2, opening_cost: 100 },
    { name: 'Glass', category: 'glass', price: 200, reorder_level: 5, opening_qty: 0 },
  ]) {
    const r = await request.post('/api/v1/accessories', { headers: h, data })
    expect(r.ok(), await r.text()).toBeTruthy()
  }

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })

  // Stock opens the cards
  await page.getByRole('link', { name: 'Stock', exact: true }).first().click()
  await expect(page).toHaveURL(/\/stock\/summary$/)
  const cards = page.getByTestId('kind-cards')
  await expect(cards.locator('a')).toHaveCount(4) // mobiles, tablets, watches, accessories: a new shop has no laptops line
  // the heading is every card together: 10,000 + 50,000 + 4,700
  await expect(page.getByTestId('stock-hero-value')).toHaveText('Rs. 64,700')
  await expect(page.getByTestId('kind-card-count-phone')).toHaveText('2 phones')
  await expect(page.getByTestId('kind-card-value-phone')).toHaveText('Rs. 10,000')
  await expect(page.getByTestId('kind-card-facts-phone')).toHaveText('1 brands · 1 models')
  await expect(page.getByTestId('kind-card-count-tablet')).toHaveText('1 tablets')
  await expect(page.getByTestId('kind-card-value-tablet')).toHaveText('Rs. 50,000')
  await expect(page.getByTestId('kind-card-count-watch')).toHaveText('0 smartwatches')
  await expect(page.getByTestId('kind-card-count-items')).toHaveText('12 pieces')
  await expect(page.getByTestId('kind-card-value-items')).toHaveText('Rs. 4,700')
  await expect(page.getByTestId('kind-card-facts-items')).toHaveText('2 items · 1 running low · 1 finished')
  // the tally sheet and the item-wise sheet are still on this screen
  await expect(page.getByTestId('tally-card')).toBeVisible()
  await expect(page.getByTestId('stock-items-card')).toBeVisible()
  await page.screenshot({ path: 'test-results/stock-kind-cards.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })

  // tablets: only the tablet's brand, its model opens the list with that tablet only
  await page.getByTestId('kind-card-tablet').click()
  await expect(page).toHaveURL(/\/stock\/summary\?kind=tablet$/)
  await expect(page.getByTestId('stock-hero-value')).toHaveText('Rs. 50,000')
  const rows = page.getByTestId('summary-brands')
  await expect(rows.getByRole('button')).toHaveCount(1)
  await expect(rows).toContainText('Tabco')
  await expect(rows).not.toContainText('Nokia')
  await rows.getByRole('button', { name: /Tabco/ }).click()
  await page.screenshot({ path: 'test-results/stock-kind-tablet.png', fullPage: true })
  await rows.getByRole('link', { name: /Tab One/ }).click()
  await expect(page.getByTestId('model-filter')).toContainText('Tab One')
  await expect(page.getByText('352099001761481').first()).toBeVisible()
  await expect(page.getByText('490154203237518')).toHaveCount(0)

  // back to the cards; mobiles show Nokia with both phones
  await page.goto('/stock/summary')
  await page.getByTestId('kind-card-phone').click()
  await expect(page.getByTestId('stock-hero-value')).toHaveText('Rs. 10,000')
  await expect(page.getByTestId('summary-brands')).toContainText('2 phones')
  await expect(page.getByTestId('summary-brands')).not.toContainText('Tabco')
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByTestId('kind-cards')).toBeVisible()

  // a kind with nothing says so
  await page.getByTestId('kind-card-watch').click()
  await expect(page.getByText('Nothing of this kind in stock')).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()

  // accessories by their kind, and a kind opens its items
  await page.getByTestId('kind-card-items').click()
  await expect(page.getByTestId('stock-hero-value')).toHaveText('Rs. 4,700')
  const kinds = page.getByTestId('item-kind-row')
  await expect(kinds).toHaveCount(2)
  await expect(kinds.first()).toContainText('10 pieces · 1 items')
  await expect(kinds.first()).toContainText('4,500')
  await page.screenshot({ path: 'test-results/stock-kind-items.png', fullPage: true })
  await kinds.first().click()
  await expect(page).toHaveURL(/\/accessories\?category=charger$/)
  await expect(page.getByText('Fast Charger').first()).toBeVisible()
  await expect(page.getByText('Back Cover')).toHaveCount(0)

  // ADR-132 / ADR-133, the new design's summary: what a piece comes to, the biggest part and each card's part of the money
  await expect(page.getByTestId('hero-avg')).toHaveCount(0) // the page the shops know has none of it
  await page.goto('/more/appearance')
  await page.getByTestId('look-layout-counter').click() // ADR-133: the mock-ups' version is the "New design"
  await page.goto('/stock/summary')
  await expect(page.getByTestId('hero-avg')).toContainText('Rs. 20,000') // 60,000 over three devices
  await expect(page.getByTestId('hero-top')).toContainText('Tablets')
  await expect(page.getByTestId('hero-top')).toContainText('77.3%')
  await expect(page.getByTestId('hero-health')).toContainText('1 running low')
  await expect(page.getByTestId('kind-card-tablet')).toContainText('Most: Tabco (1)')
  await expect(page.getByTestId('kind-card-phone')).toContainText('15.5%')
  // a kind: its average, biggest brand, the brands searched and put in another order
  await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: '352099001761499', brand_id: tabBrand.id, model_id: (await (await request.post('/api/v1/catalogue/models', { headers: h, data: { brand_id: tabBrand.id, name: 'Phone Zed', category: 'phone' } })).json()).id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 30000, asking_price: 32000 } })
  await page.goto('/stock/summary?kind=phone')
  await expect(page.getByTestId('stock-hero-value')).toHaveText('Rs. 40,000')
  await expect(page.getByTestId('hero-avg')).toContainText('Rs. 13,333')
  await expect(page.getByTestId('hero-top')).toContainText('Tabco')
  await expect(page.getByTestId('hero-top')).toContainText('75%')
  await expect(page.getByTestId('brand-parts')).toContainText('Nokia')
  const list = page.getByTestId('summary-brands')
  await expect(list.getByRole('button').first()).toContainText('Tabco') // highest value first
  await page.getByTestId('sort-units').click()
  await expect(list.getByRole('button').first()).toContainText('Nokia') // two pieces against one
  await page.getByTestId('sort-avg').click()
  await expect(list.getByRole('button').first()).toContainText('Tabco')
  await page.getByPlaceholder('Search a brand or model').fill('zed')
  await expect(list.getByRole('button')).toHaveCount(1)
  await expect(list.getByRole('link', { name: /Phone Zed/ })).toBeVisible() // a searched brand is open
  await expect(list.getByRole('link', { name: /Phone Zed/ })).toContainText('100% of Tabco')
  await page.getByPlaceholder('Search a brand or model').fill('nothing-like-this')
  await expect(page.getByText('No brand or model matches')).toBeVisible()
  // a laptop; then a kind with nothing offers the way to add some
  await page.getByPlaceholder('Search a brand or model').fill('')
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/stock/summary')
  await expect(page.getByTestId('kind-cards')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/stock-summary-laptop.png', fullPage: true })
  await page.getByTestId('kind-card-phone').click()
  await page.getByTestId('summary-brands').getByRole('button').first().click()
  await page.screenshot({ path: 'test-results/stock-kind-laptop.png', fullPage: true })
  await page.goto('/stock/summary?kind=watch')
  await page.getByTestId('summary-add').click()
  await expect(page).toHaveURL(/\/purchase\/new/)
})
