/** Shop Audit → Stock (docs/17 P6): dimensions and values, the age bands with alerts, the
 *  thresholds card in Settings, and the ID-check bypass audit. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const iso = (daysAgo: number) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

test('stock audit: dimensions, ageing bands and alerts, thresholds, bypasses', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Stock Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const brand = (await get('/catalogue/brands'))[0]
  const model = (await get(`/catalogue/models?brand_id=${brand.id}`))[0]
  const dev = (imei: string, extra: Record<string, unknown> = {}) => ({ imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', ...extra })
  const dealer = await post('/parties', { name: 'Dealer', phone: '03005556666', kinds: ['supplier'] })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, date: iso(40), devices: [{ device: dev('490154203237518', { condition: 'used' }), cost: 60000, asking_price: 70000 }, { device: dev('356938035643809'), cost: 800, asking_price: 805 }, { device: dev('352099001761481', { condition: 'used', pta_status: 'non_pta', sim_time_months: 4 }), cost: 500 }], paid: 61300 })
  const [a] = pur.lines.map((l: { device_id: string }) => l.device_id)

  // summary: 3 in stock, dimensions, top lists
  await page.goto('/audit/stock')
  const kpis = page.getByTestId('inv-kpis')
  await expect(kpis).toContainText('3')
  await expect(kpis).toContainText('Rs. 61,300')
  await expect(kpis).toContainText('Rs. 70,805')
  const dims = page.getByTestId('inv-dims')
  await expect(dims).toContainText('Used')
  await expect(dims).toContainText('Non-PTA')
  await expect(page.getByTestId('top-cost')).toContainText('490154203237518')
  await expect(page.getByTestId('low-margin')).toContainText('356938035643809')
  await page.screenshot({ path: 'test-results/audit-stock.png', fullPage: true })

  // ageing: all three 40 days old → "Slow"; alerts for the dear pending phone, the thin margin and the missing asking
  await page.getByRole('button', { name: 'Age of stock', exact: true }).click()
  await expect(page).toHaveURL(/tab=ageing/)
  await expect(page.getByTestId('age-bands')).toContainText('Slow 31–60 · 3')
  const alerts = page.getByTestId('age-alerts')
  await expect(alerts).toContainText('High value, slow')
  await expect(alerts).toContainText('ID check pending')
  await expect(alerts).toContainText('Thin margin')
  await expect(alerts).toContainText('No asking price')
  await expect(page.getByTestId('age-rows').locator('a')).toHaveCount(3)
  await page.getByRole('button', { name: /^Slow 31–60/ }).click()
  await expect(page.getByTestId('age-rows').locator('a')).toHaveCount(3)
  await page.screenshot({ path: 'test-results/audit-ageing.png', fullPage: true })

  // thresholds in Settings: tighten the bands → the phones are now "Dead"
  await page.goto('/more/settings')
  const card = page.locator('section', { hasText: 'Stock audit thresholds' }).first()
  await expect(card).toBeVisible()
  await card.getByLabel('Fresh up to (days)').fill('5')
  await card.getByLabel('Normal up to (days)').fill('10')
  await card.getByLabel('Slow up to (days)').fill('20')
  await card.getByLabel('Attention up to (days)').fill('30')
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
  expect((await get('/shops/current')).audit_prefs.age_bands).toEqual([5, 10, 20, 30])
  await page.goto('/audit/stock?tab=ageing')
  await expect(page.getByTestId('age-bands')).toContainText('Dead >30 · 3')
  await expect(page.getByTestId('age-alerts')).toContainText('Dead stock')

  // bypasses: the owner skips the ID check on the dear phone; the audit names them
  await post(`/devices/${a}/verification/override`, { reason: 'known person' })
  await page.goto('/audit/stock?tab=verification&preset=this_month')
  await expect(page.getByTestId('ver-kpis')).toContainText('ID checked')
  const users = page.getByTestId('ver-users')
  await expect(users).toContainText('Owner')
  await expect(users).toContainText('1 skipped')
  const rows = page.getByTestId('ver-rows')
  await expect(rows).toContainText('490154203237518')
  await expect(rows).toContainText('known person')
  await expect(rows).toContainText('was ID check pending')
  await page.screenshot({ path: 'test-results/audit-verification.png', fullPage: true })
})
