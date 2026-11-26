/** ADR-143 (owner 2026-11-26): Shop Audit → Sales & purchases → by brand & model — every phone sold
 *  or bought with its trail, the server's model totals and picks, the links to the books; the bills
 *  view is unchanged. Figures are the server's (`/shop-audit/sales/units`, `/purchases/units`). */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('audit: sales & purchases by brand & model, the books links', async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Audit Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Sheikh Amir', phone: '03215551411', kinds: ['supplier'] })
  const cust = await post('/parties', { name: 'Usman Tariq', phone: '03215551412', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((x: { name: string }) => x.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number, cost: number) => ({ device: { imei1: imei(`35698${stamp}0${n}141`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost, asking_price: 26000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 30000, method: 'cash', devices: [dev(1, 20000), dev(2, 22000), dev(3, 21000)] })
  const s1 = await post('/sales', { party_id: cust.id, devices: [{ device_id: pur.lines[0].device_id, price: 25000 }], paid: 10000 })
  await post('/sales', { party_id: cust.id, devices: [{ device_id: pur.lines[1].device_id, price: 24000 }], paid: 24000 })
  const su = await get('/shop-audit/sales/units?preset=this_month')
  const bu = await get('/shop-audit/purchases/units?preset=this_month')
  expect(su.models[0].units).toBe(2)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })

  // the bills view is as before, and the books are one tap away
  await page.goto('/audit/sales?preset=this_month')
  await expect(page.getByTestId('trade-hero')).toBeVisible()
  await expect(page.getByTestId('audit-books')).toContainText('Master ledger')

  // sales by brand & model: the server's totals, picks and every phone's trail
  await page.getByTestId('trade-view-models').click()
  await expect(page).toHaveURL(/view=models/)
  await expect(page.getByTestId('trade-model')).toHaveCount(su.models.length)
  await expect(page.getByTestId('trade-model-profit')).toContainText(fmt(su.models[0].profit))
  await expect(page.getByTestId('trade-best')).toContainText(fmt(su.models[0].highest_profit.profit))
  await expect(page.getByTestId('trade-unit')).toHaveCount(2)
  const rows = page.getByTestId('trade-unit-rows')
  await expect(rows).toContainText(s1.no)
  await expect(rows).toContainText('Sheikh Amir')
  await expect(rows).toContainText('Usman Tariq')
  await expect(rows).toContainText(pur.no)
  await page.screenshot({ path: 'test-results/audit-trade-units.png', fullPage: true })
  // search by a buyer leaves the model; by nonsense leaves none
  await page.getByTestId('trade-units-q').fill('usman')
  await expect(page.getByTestId('trade-model')).toHaveCount(1)
  await page.getByTestId('trade-units-q').fill('zzzz')
  await expect(page.getByTestId('trade-model')).toHaveCount(0)
  await page.getByTestId('trade-units-q').fill('')
  // a phone's IMEI opens its page
  await rows.getByRole('link', { name: su.models[0].rows[0].imei1 }).click()
  await expect(page).toHaveURL(new RegExp(`/stock/${su.models[0].rows[0].device_id}`))
  await page.goBack()

  // purchases by brand & model: bought, sold, in the shop; the cheapest and the dearest
  await page.goto('/audit/sales?preset=this_month&tab=purchases&view=models')
  await expect(page.getByTestId('trade-model')).toHaveCount(bu.models.length)
  await expect(page.getByTestId('trade-unit')).toHaveCount(3)
  await expect(page.getByTestId('trade-cheapest')).toContainText('20,000')
  await expect(page.getByTestId('trade-dearest')).toContainText('22,000')
  await expect(page.getByTestId('trade-unit-rows')).toContainText('In the shop')
  await expect(page.getByTestId('trade-unit-rows')).toContainText('Sold')

  // Urdu: right to left, nothing wider than a phone
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByTestId('trade-model').first()).toBeVisible()
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
})
