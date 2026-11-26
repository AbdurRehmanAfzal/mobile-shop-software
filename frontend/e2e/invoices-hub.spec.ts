/** ADR-137 (owner 2026-11-26): the invoices page as the shop's bills centre — the five figures, the
 *  kind-of-stock and payment-mode filters, dealer-wise / customer-wise / edited / full ledger, a bill's
 *  quick view with print, settle from the list, the correction chooser, the delete hand-off, create a
 *  bill, the report, profit hidden, Urdu. Every figure is the server's `/bills-hub/bills`. */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('invoices: the bills centre — figures, views, quick view, settle, correct, delete, create, report', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Bills Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Sheikh Amir', phone: '03215550911', kinds: ['supplier'] })
  const a = await post('/parties', { name: 'Usman Tariq', phone: '03215550912', kinds: ['customer'] })
  const b = await post('/parties', { name: 'Awais Store', phone: '03215550913', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((x: { name: string }) => x.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35698${stamp}0${n}911`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 20000, asking_price: 24000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 30000, method: 'cash', devices: [dev(1), dev(2)] })
  const s1 = await post('/sales', { party_id: a.id, devices: [{ device_id: pur.lines[0].device_id, price: 25000 }], paid: 5000 })
  const s2 = await post('/sales', { party_id: a.id, devices: [{ device_id: pur.lines[1].device_id, price: 24000 }], paid: 24000 })
  // the second sale was put on the wrong person: corrected, so it is an edited bill
  await post(`/sales/${s2.id}/customer`, { party_id: b.id, reason: 'wrong name' })
  const now = new Date()
  const qs = `date_from=${iso(new Date(now.getFullYear(), now.getMonth(), 1))}&date_to=${iso(now)}`
  const d = await get(`/bills-hub/bills?${qs}`)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })

  await page.goto('/invoices')
  // the five figures are the server's
  await expect(page.getByTestId('ihub-f-sales')).toContainText(fmt(d.figures.sales))
  await expect(page.getByTestId('ihub-f-purchases')).toContainText(fmt(d.figures.purchases))
  await expect(page.getByTestId('ihub-f-toget')).toContainText(fmt(d.figures.to_get))
  await expect(page.getByTestId('ihub-f-topay')).toContainText(fmt(d.figures.to_pay))
  await expect(page.getByTestId('ihub-f-profit')).toContainText(fmt(d.figures.profit))
  await expect(page.getByTestId('ihub-row')).toHaveCount(3)
  await page.screenshot({ path: 'test-results/invoices-hub.png', fullPage: true })
  // profit hidden
  await page.getByTestId('ihub-eye').click()
  await expect(page.getByTestId('ihub-f-profit')).toContainText('••••••')
  await page.getByTestId('ihub-eye').click()

  // still to get: the card filters to the customers' udhaar
  await page.getByTestId('ihub-f-toget').click()
  await expect(page.getByTestId('ihub-row')).toHaveCount(1)
  await expect(page.getByTestId('ihub-row')).toContainText(s1.no)
  await page.getByTestId('ihub-reset').click()
  await expect(page.getByTestId('ihub-row')).toHaveCount(3)
  // kind of stock and payment mode
  await page.getByTestId('ihub-cat-phone').click()
  await expect(page.getByTestId('ihub-row')).toHaveCount(3)
  await page.getByTestId('ihub-mode').selectOption('udhaar')
  await expect(page.getByTestId('ihub-row')).toHaveCount(0)
  await page.getByTestId('ihub-reset').click()

  // dealer-wise, customer-wise, edited, the full ledger
  await page.getByTestId('ihub-view-dealers').click()
  await expect(page.getByTestId('ihub-group')).toHaveCount(1)
  await expect(page.getByTestId('ihub-group-due')).toContainText('10,000')
  await page.getByTestId('ihub-view-customers').click()
  await expect(page.getByTestId('ihub-group')).toHaveCount(2)
  await page.getByTestId('ihub-view-edited').click()
  await expect(page.getByTestId('ihub-row')).toHaveCount(1)
  await expect(page.getByTestId('ihub-row-change')).toContainText('wrong name')
  await page.getByTestId('ihub-view-ledger').click()
  await expect(page.getByTestId('ihub-ledger-row')).toHaveCount(3)
  await page.getByTestId('ihub-view-bills').click()

  // the quick view of the udhaar sale: its lines, print in Urdu on 80 mm
  const row = page.locator(`[data-testid="ihub-row"][data-no="${s1.no}"]`)
  await row.getByTestId('ihub-view').click()
  await expect(page.getByTestId('ihub-lines')).toContainText('Nokia')
  await expect(page.getByTestId('ihub-sheet-due')).toContainText('20,000')
  await page.getByTestId('ihub-doc-ur').click()
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('ihub-print').click()])
  await expect(pop.locator('body')).toContainText(s1.no, { timeout: 30_000 })
  await pop.close()
  // settle a part from the quick view: the live payment form against this bill
  await page.getByTestId('ihub-sheet-settle').click()
  await expect(page.getByTestId('ihub-settle-sheet')).toBeVisible()
  await page.getByLabel('Amount').fill('8000')
  await page.locator('[data-testid="ihub-settle-sheet"] form button[type="submit"]').click()
  await expect(page.getByText(/saved/i).first()).toBeVisible()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(row).toContainText('12,000')
  expect((await get(`/bills-hub/bills?${qs}`)).figures.to_get).toBe('12000.00')

  // correct: the live choices; delete: goes to the bill's own page
  await row.getByTestId('ihub-fix').click()
  await expect(page.getByTestId('ihub-fix-choice')).toHaveCount(3)
  await page.getByRole('button', { name: 'Close' }).click()
  await row.getByTestId('ihub-del').click()
  await page.getByTestId('ihub-del-go').click()
  await expect(page).toHaveURL(new RegExp(`/sales/${s1.id}\\?delete=1`))
  await page.goBack()

  // create a bill: each on its own form; the report sheet
  await page.getByTestId('ihub-create').click()
  await expect(page.getByTestId('ihub-create-choice').first()).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByTestId('ihub-report').click()
  await expect(page.getByTestId('ihub-rep-print')).toBeVisible()
  await expect(page.getByTestId('ihub-rep-xlsx')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  // tapping a bill still opens its own page
  await page.getByText(s2.no).first().click()
  await expect(page).toHaveURL(new RegExp(`/sales/${s2.id}`))

  // Urdu: one language, right to left, nothing wider than a phone
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.goto('/invoices')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByTestId('ihub-figures')).toBeVisible()
  await page.setViewportSize({ width: 360, height: 800 })
  await page.screenshot({ path: 'test-results/invoices-hub-ur.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
})
