/** ADR-139 (owner 2026-11-26): Sale & purchase in the side panel — the sales side (six figures, kinds
 *  and brands, models with profit / loss, people, bills settled several at once, the ledger) and the
 *  purchases side (five figures, where each bought phone is now, dealers, bills paid several at once),
 *  filters, the report sheet, a salesman without the purchases side, Urdu. Every figure is the
 *  server's `/bills-hub/sales` and `/bills-hub/purchases`. */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('sale & purchase: both sides, their views, settle several, report, Urdu', async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Trade Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Sheikh Amir', phone: '03215551011', kinds: ['supplier'] })
  const a = await post('/parties', { name: 'Usman Tariq', phone: '03215551012', kinds: ['customer'] })
  const b = await post('/parties', { name: 'Awais Store', phone: '03215551013', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((x: { name: string }) => x.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35698${stamp}0${n}101`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 20000, asking_price: 24000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 30000, method: 'cash', devices: [dev(1), dev(2), dev(3)] })
  const s1 = await post('/sales', { party_id: a.id, devices: [{ device_id: pur.lines[0].device_id, price: 25000 }], paid: 5000 })
  await post('/sales', { party_id: b.id, devices: [{ device_id: pur.lines[1].device_id, price: 18000 }], paid: 10000, below_cost_ok: true })
  const now = new Date()
  const qs = `date_from=${iso(new Date(now.getFullYear(), now.getMonth(), 1))}&date_to=${iso(now)}`
  const sd = await get(`/bills-hub/sales?${qs}`)
  const pd = await get(`/bills-hub/purchases?${qs}`)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })

  // the side panel has the page
  await page.getByTestId('side-panel').getByRole('link', { name: 'Sale & purchase' }).click()
  await expect(page).toHaveURL(/\/sale-purchase$/)
  await expect(page.getByTestId('stp')).toBeVisible()

  // ---- the sales side: the server's six figures
  await expect(page.getByTestId('stp-f-amount')).toContainText(fmt(sd.figures.sale))
  await expect(page.getByTestId('stp-f-cost')).toContainText(fmt(sd.figures.cost))
  await expect(page.getByTestId('stp-f-paid')).toContainText(fmt(sd.figures.received))
  await expect(page.getByTestId('stp-f-due')).toContainText(fmt(sd.figures.udhaar))
  await expect(page.getByTestId('stp-f-gain')).toContainText(fmt(sd.figures.gain))
  await expect(page.getByTestId('stp-f-loss')).toContainText(fmt(sd.figures.loss))
  await expect(page.getByTestId('stp-kind-phone')).toContainText(fmt(sd.kinds.find((k: { key: string }) => k.key === 'phone').sale))
  await expect(page.getByTestId('stp-brand-row')).toHaveCount(sd.brands.length)
  await page.screenshot({ path: 'test-results/sale-purchase.png', fullPage: true })
  // cost hidden
  await page.getByTestId('stp-eye').click()
  await expect(page.getByTestId('stp-f-cost')).toContainText('••••••')
  await page.getByTestId('stp-eye').click()
  // loss deals: one line in the ledger
  await page.getByTestId('stp-deal-loss').click()
  await page.getByTestId('stp-tab-ledger').click()
  await expect(page.getByTestId('stp-line')).toHaveCount(1)
  await page.getByTestId('stp-reset').click()
  await expect(page.getByTestId('stp-line')).toHaveCount(sd.lines.length)
  // a brand opens its models; the people
  await page.getByTestId('stp-tab-overview').click()
  await page.getByTestId('stp-brand-row').first().click()
  await expect(page).toHaveURL(/tab=models/)
  await expect(page.getByTestId('stp-model')).toHaveCount(1)
  await page.getByTestId('stp-reset').click()
  await page.getByTestId('stp-tab-parties').click()
  await expect(page.getByTestId('stp-party')).toHaveCount(2)
  // the bills: settle both at once (one payment per bill)
  await page.getByTestId('stp-tab-bills').click()
  await expect(page.getByTestId('stp-bill')).toHaveCount(2)
  await page.getByTestId('stp-check-all').check()
  await page.getByTestId('stp-settle-sel').click()
  await page.getByTestId('stp-settle-sel-go').click()
  await expect(page.getByTestId('stp-f-due')).toContainText('Rs. 0')
  expect((await get(`/bills-hub/sales?${qs}`)).figures.udhaar).toBe('0.00')

  // ---- the purchases side: five figures, where each phone is now
  await page.getByTestId('stp-side-purchases').click()
  await expect(page).toHaveURL(/side=purchases/)
  await expect(page.getByTestId('stp-f-amount')).toContainText(fmt(pd.figures.amount))
  await expect(page.getByTestId('stp-f-paid')).toContainText(fmt(pd.figures.paid))
  await expect(page.getByTestId('stp-f-due')).toContainText(fmt(pd.figures.due))
  await expect(page.getByTestId('stp-f-avg')).toContainText(fmt(pd.figures.avg))
  await expect(page.getByTestId('stp-f-stock')).toContainText('1 in shop')
  await page.screenshot({ path: 'test-results/sale-purchase-purchases.png', fullPage: true })
  await page.getByTestId('stp-tab-ledger').click()
  await expect(page.getByTestId('stp-line')).toHaveCount(3)
  await expect(page.getByTestId('stp-ledger')).toContainText('Usman Tariq')
  await expect(page.getByTestId('stp-ledger')).toContainText(s1.no)
  await page.getByTestId('stp-tab-parties').click()
  await expect(page.getByTestId('stp-party-due')).toContainText('30,000')
  // one bill, paid from the list
  await page.getByTestId('stp-tab-bills').click()
  await page.getByTestId('stp-check').check()
  await page.getByTestId('stp-settle-sel').click()
  await page.getByTestId('stp-settle-sel-go').click()
  await expect(page.getByTestId('stp-f-due')).toContainText('Rs. 0')
  // correct and delete hand over; the report sheet
  await page.getByTestId('stp-bill').getByRole('button', { name: 'Correct this bill' }).click()
  await expect(page.getByTestId('ihub-fix-choice')).toHaveCount(4)
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByTestId('stp-report').click()
  await expect(page.getByTestId('ihub-rep-print')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()

  // the list of every report has it
  await page.goto('/reports')
  await expect(page.getByText('Sale & purchase').first()).toBeVisible()

  // Urdu: one language, right to left, nothing wider than a phone
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.goto('/sale-purchase')
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByTestId('stp-figures')).toBeVisible()
  await page.setViewportSize({ width: 360, height: 800 })
  await page.screenshot({ path: 'test-results/sale-purchase-ur.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()

  // a salesman: the sales side without cost, no purchases side
  await post('/staff', { name: 'Ali', phone: `032${Math.floor(10_000_000 + Math.random() * 89_999_999)}`.slice(0, 11), password: 'e2e-secret-2', role: 'salesman' }).then(async (u) => {
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem('locale', 'en') })
    await page.goto('/login')
    await page.getByLabel('Mobile number').fill(String(u.phone).slice(1))
    await page.getByLabel('Password').fill('e2e-secret-2')
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })
    await page.goto('/sale-purchase?side=purchases')
    await expect(page.getByTestId('stp-side-sales')).toBeVisible()
    await expect(page.getByTestId('stp-side-purchases')).toHaveCount(0)
    await expect(page.getByTestId('stp-f-cost')).toHaveCount(0)
    await expect(page.getByTestId('stp-f-amount')).toBeVisible()
  })
})
