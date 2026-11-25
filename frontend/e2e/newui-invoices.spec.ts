/** ADR-134: every bill in one screen (file 24, F10) at /new/invoices — the five figures, the type /
 *  state / kind filters, dealer- and customer-wise views, edited bills, the full ledger, a bill's
 *  window, settling a bill with a payment, the corrections chooser and Urdu; every figure is the
 *  server's `/bills-hub/bills`. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('new product: every bill — figures, filters, views, a bill, settle, corrections, Urdu', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Bills Hub', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Bilal Software Dubai', phone: '03215550411', kinds: ['supplier'] })
  const cust = await post('/parties', { name: 'Kamran Tariq', phone: '03215550412', kinds: ['customer'] })
  const other = await post('/parties', { name: 'Haseeb Mob', phone: '03215550413', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35697${stamp}0${n}411`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 20000, asking_price: 24000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 30000, method: 'cash', devices: [dev(1), dev(2), dev(3)] })
  const s1 = await post('/sales', { party_id: cust.id, devices: [{ device_id: pur.lines[0].device_id, price: 25000 }], paid: 10000 })
  const s2 = await post('/sales', { party_id: other.id, devices: [{ device_id: pur.lines[1].device_id, price: 26000 }], paid: 26000 })
  await post(`/sales/${s2.id}/customer`, { party_id: cust.id, reason: 'wrong name' })
  const now = new Date()
  const qs = `date_from=${iso(new Date(now.getFullYear(), now.getMonth(), 1))}&date_to=${iso(now)}`
  const d = await get(`/bills-hub/bills?${qs}`)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  // the five figures are the server's
  await page.goto('/new/invoices')
  await expect(page.getByTestId('nbill')).toBeVisible()
  await expect(page.getByTestId('nbill-f-sales')).toContainText(fmt(d.figures.sales))
  await expect(page.getByTestId('nbill-f-purchases')).toContainText(fmt(d.figures.purchases))
  await expect(page.getByTestId('nbill-f-toget')).toContainText(fmt(d.figures.to_get))
  await expect(page.getByTestId('nbill-f-topay')).toContainText(fmt(d.figures.to_pay))
  await expect(page.getByTestId('nbill-f-profit')).toContainText(fmt(d.figures.profit))
  await expect(page.getByTestId('nbill-row')).toHaveCount(d.rows.length)
  await page.screenshot({ path: 'test-results/newui-invoices.png', fullPage: true })

  // filters: type, state, search by IMEI
  await page.getByTestId('nbill-type-purchase').click()
  await expect(page.getByTestId('nbill-row')).toHaveCount(1)
  await page.getByTestId('nbill-type-all').click()
  await page.getByTestId('nbill-state-due').click()
  await expect(page.getByTestId('nbill-row')).toHaveCount(2)
  await page.getByTestId('nbill-state-all').click()
  await page.getByTestId('nbill-q').fill(s1.no)
  await expect(page.getByTestId('nbill-row')).toHaveCount(1)
  await page.getByTestId('nbill-reset').click()
  await expect(page.getByTestId('nbill-row')).toHaveCount(d.rows.length)

  // edited bills: the customer change
  await page.getByTestId('nbill-view-edited').click()
  await expect(page.getByTestId('nbill-row')).toHaveCount(1)
  await expect(page.getByTestId('nbill-row')).toContainText(s2.no)

  // customer-wise: Kamran has both sales and the udhaar
  await page.getByTestId('nbill-view-customers').click()
  const g = d.parties.find((x: { party_id: string }) => x.party_id === cust.id)
  await expect(page.getByTestId('nbill-group').filter({ hasText: 'Kamran Tariq' }).getByTestId('nbill-group-due')).toContainText(fmt(g.to_get))
  await page.getByTestId('nbill-view-dealers').click()
  await expect(page.getByTestId('nbill-group')).toContainText('Bilal Software Dubai')

  // the full ledger
  await page.getByTestId('nbill-view-ledger').click()
  await expect(page.getByTestId('nbill-ledger-row')).toHaveCount(d.rows.length)

  // a bill's window, then settle what is left on it with a payment
  await page.getByTestId('nbill-view-bills').click()
  const row = page.locator(`[data-testid="nbill-row"][data-no="${s1.no}"]`)
  await row.getByTestId('nbill-view').click()
  await expect(page.getByTestId('nbill-window')).toBeVisible()
  await expect(page.getByTestId('nbill-window-due')).toContainText('15,000')
  await page.getByTestId('nbill-window-settle').click()
  await expect(page.getByTestId('nbill-settle-amount')).toHaveValue('15000')
  await page.getByTestId('nbill-settle-go').click()
  await expect(page.getByTestId('nbill-toast')).toBeVisible()
  const after = await get(`/bills-hub/bills?${qs}`)
  expect(after.figures.to_get).toBe('0.00')
  await expect(page.getByTestId('nbill-f-toget')).toContainText('0')

  // corrections open the live screens; a delete goes to the bill's own page
  await row.getByTestId('nbill-edit-btn').click()
  await expect(page.getByTestId('nbill-edit-choice')).toHaveCount(3)
  await page.getByTestId('nbill-edit').getByRole('button').first().click()
  await row.getByTestId('nbill-del-btn').click()
  await page.getByTestId('nbill-del-go').click()
  await expect(page).toHaveURL(new RegExp(`/sales/${s1.id}\\?delete=1`))
  await page.goBack()

  // Urdu: one language, right to left
  await page.getByTestId('nbill-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-invoices-ur.png', fullPage: true })
  // phone width: no sideways scroll
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
})
