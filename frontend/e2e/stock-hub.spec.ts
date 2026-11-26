/** ADR-141 (owner 2026-11-26): the stock screens one tap apart, the worth at asking and what is still
 *  to pay suppliers on the summary, the stock by dealer & customer with their khata, and the stock
 *  ledger with its figures and filters; a salesman sees no cost. Every figure is the server's
 *  (`/stock-hub/overview`, `/parties`, `/ledger`). */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('stock: tabs, summary strip, dealer-wise stock, the stock ledger', async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Stock Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Sheikh Amir', phone: '03215551211', kinds: ['supplier'] })
  const cust = await post('/parties', { name: 'Usman Tariq', phone: '03215551212', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((x: { name: string }) => x.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35698${stamp}0${n}121`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 20000, asking_price: 24000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 30000, method: 'cash', devices: [dev(1), dev(2), dev(3)] })
  await post('/sales', { party_id: cust.id, devices: [{ device_id: pur.lines[0].device_id, price: 25000 }], paid: 25000 })
  const ov = await get('/stock-hub/overview')
  const pr = (await get('/stock-hub/parties')).find((r: { party_id: string }) => r.party_id === dealer.id)
  const now = new Date()
  const led = await get(`/stock-hub/ledger?date_from=${iso(new Date(now.getFullYear(), now.getMonth(), 1))}&date_to=${iso(now)}`)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })

  // the summary: the tabs, the worth at asking and what is still to pay
  await page.goto('/stock/summary')
  await expect(page.getByTestId('stock-tabs')).toBeVisible()
  await expect(page.getByTestId('sth-asking')).toContainText(fmt(ov.asking))
  await expect(page.getByTestId('sth-payable')).toContainText(fmt(ov.payable))
  await page.screenshot({ path: 'test-results/stock-hub-summary.png', fullPage: true })

  // every item still has the tabs; then dealer & customer-wise
  await page.getByTestId('stock-tab-stock').click()
  await expect(page).toHaveURL(/\/stock$/)
  await expect(page.getByTestId('stock-tabs')).toBeVisible()
  await page.getByTestId('stock-tab-people').click()
  await expect(page).toHaveURL(/\/stock\/people$/)
  await expect(page.getByTestId('sth-party')).toHaveCount(1)
  await expect(page.getByTestId('sth-party')).toContainText('Sheikh Amir')
  await expect(page.getByTestId('sth-party')).toContainText('Nokia')
  await expect(page.getByTestId('sth-party')).toContainText(fmt(pr.billed))
  await expect(page.getByTestId('sth-party-balance')).toContainText(fmt(pr.balance))
  await page.getByTestId('sth-who-customer').click()
  await expect(page.getByTestId('sth-party')).toHaveCount(0)
  await page.getByTestId('sth-who-all').click()
  await page.screenshot({ path: 'test-results/stock-hub-people.png', fullPage: true })
  // the person's page opens on their phones
  await page.getByTestId('sth-party-open').click()
  await expect(page).toHaveURL(new RegExp(`/parties/${dealer.id}\\?tab=phones`))
  await page.goBack()

  // the stock ledger: the server's figures, every movement, a filter by movement
  await page.getByTestId('stock-tab-ledger').click()
  await expect(page).toHaveURL(/\/stock\/ledger$/)
  await expect(page.getByTestId('sth-l-in')).toContainText(`+${led.in_units}`)
  await expect(page.getByTestId('sth-l-out')).toContainText(`−${led.out_units}`)
  await expect(page.getByTestId('sth-l-profit')).toContainText(fmt(led.profit))
  await expect(page.getByTestId('sth-l-row')).toHaveCount(led.rows.length)
  await page.screenshot({ path: 'test-results/stock-hub-ledger.png', fullPage: true })
  await page.getByTestId('sth-move').selectOption('out')
  await expect(page.getByTestId('sth-l-row')).toHaveCount(1)
  await expect(page.getByTestId('sth-ledger')).toContainText('Usman Tariq')
  await page.getByTestId('sth-move').selectOption('')
  await page.getByTestId('sth-party-filter').selectOption(dealer.id)
  await expect(page.getByTestId('sth-l-row').first()).toBeVisible()

  // the list of every report has both
  await page.goto('/reports')
  await expect(page.getByText('Stock ledger').first()).toBeVisible()
  await expect(page.getByText('Stock by dealer & customer').first()).toBeVisible()

  // Urdu: right to left, nothing wider than a phone
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.goto('/stock/ledger')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByTestId('sth-l-figures')).toBeVisible()
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
  await page.goto('/stock/people')
  await expect(page.getByTestId('sth-party')).toHaveCount(1)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()

  // a salesman: no cost, profit or balances
  const sp = `032${Math.floor(10_000_000 + Math.random() * 89_999_999)}`.slice(0, 11)
  await post('/staff', { name: 'Ali', phone: sp, password: 'e2e-secret-2', role: 'salesman' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('locale', 'en') })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(sp.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-2')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })
  await page.goto('/stock/people')
  await expect(page.getByTestId('sth-party')).toHaveCount(1)
  await expect(page.getByTestId('sth-party-balance')).toHaveCount(0)
  await page.goto('/stock/ledger')
  await expect(page.getByTestId('sth-l-in')).toBeVisible()
  await expect(page.getByTestId('sth-l-profit')).toHaveCount(0)
})
