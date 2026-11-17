/** Owner 2026-11-17 (ADR-096): graphs on the home screen and the business overview — sales and
 *  purchases, profit / loss by day, to get and to give — for 7 or 30 days. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('graphs on the home screen and the business overview', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Graph Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Graph Dealer', phone: '03219993333', kinds: ['supplier'] } })).json()).id
  const buyer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Graph Buyer', phone: '03219994444', kinds: ['customer'] } })).json()).id
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, paid: 4000, method: 'cash', devices: [{ device: { imei1: imei(`35693803576${String(Date.now()).slice(-3)}`), brand_id: b.id, model_id: ms[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 10000, asking_price: 13000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id
  const sale = await request.post('/api/v1/sales', { headers: h, data: { party_id: buyer, devices: [{ device_id: dev, price: 13000 }], paid: 8000 } })
  expect(sale.ok(), await sale.text()).toBeTruthy()

  // the series: sold 13,000, bought 10,000, profit 3,000, buyer owes 5,000, dealer is owed 6,000
  const t = await (await request.get('/api/v1/reports/trends?days=7', { headers: h })).json()
  expect(t.rows).toHaveLength(7)
  expect(t.totals).toEqual({ sales: '13000.00', to_get: '5000.00', to_give: '6000.00', purchases: '10000.00', profit: '3000.00' })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })
  const charts = page.getByTestId('trend-charts')
  await expect(charts.getByTestId('trend-trade')).toContainText('13,000')
  await expect(charts.getByTestId('trend-trade')).toContainText('10,000')
  await expect(charts.getByTestId('trend-profit')).toContainText('3,000')
  await expect(charts.getByTestId('trend-debt')).toContainText('5,000')
  await expect(charts.getByTestId('trend-debt')).toContainText('6,000')
  // each pair of lines has a legend, and the second line is dashed (told apart by more than colour)
  await expect(charts.getByTestId('trend-trade').locator('path[stroke-dasharray]')).toHaveCount(1)
  await charts.scrollIntoViewIfNeeded()
  await charts.screenshot({ path: 'test-results/trend-charts-home.png' })
  // 30 days: thirty buckets, the same totals
  await charts.getByTestId('trend-30').click()
  await expect(charts.getByTestId('trend-30')).toHaveAttribute('aria-pressed', 'true')
  await expect(charts.getByTestId('trend-profit').locator('svg g')).toHaveCount(30)
  await expect(charts.getByTestId('trend-trade')).toContainText('13,000')

  // the same graphs on the business overview
  await page.goto('/overview')
  await expect(page.getByTestId('trend-charts').getByTestId('trend-debt')).toContainText('6,000')
  await expect(page.getByTestId('ov-purchases')).toContainText('10,000')
  await page.screenshot({ path: 'test-results/trend-charts-overview.png', fullPage: true })
})
