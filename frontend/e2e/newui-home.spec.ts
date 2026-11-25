/** ADR-134: home in the new product, the third screen of `11-frame-stock-summary-and-dashboard.html`.
 *  Every card is the live home's figure (`/reports/day`, `/reports/dashboard`); what needs attention is
 *  the dashboard's counts; the bars are the dashboard's 7 days. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: home — greeting, periods, the eight cards, needs attention, the 7 days, as file 11 draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Home Naya', owner_name: 'Abdur Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Hall Road Traders', phone: '03215550101', kinds: ['supplier'] })
  const ali = await post('/parties', { name: 'Ali Jaranwala', phone: '03215550102', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35693${stamp}0${n}101`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 9000, asking_price: 12000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 5000, method: 'cash', devices: [dev(1), dev(2), dev(3)] })
  await post('/sales', { party_id: ali.id, devices: [{ device_id: pur.lines[0].device_id, price: 15000 }], paid: 10000 })
  const codes = await get('/repairs/fault-codes')
  await post('/repairs', { party_id: ali.id, device_desc: 'Vivo V30', fault_codes: [codes[0].code], estimate: 3000 })
  const day = await get('/reports/day')
  const dash = await get('/reports/dashboard')
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new')
  await expect(page.getByTestId('nhome')).toBeVisible()
  await expect(page.getByTestId('newui-panel')).toBeVisible()
  await expect(page.getByTestId('nhome-greet')).toContainText('Abdur')
  await expect(page.getByTestId('nhome-sales')).toContainText(fmt(day.sales_total))
  await expect(page.getByTestId('nhome-sales')).toContainText('Phones sold: 1')
  await expect(page.getByTestId('nhome-profit')).toContainText(fmt(day.profit))
  await expect(page.getByTestId('nhome-get')).toContainText(fmt(dash.receivable))
  await expect(page.getByTestId('nhome-give')).toContainText(fmt(dash.payable))
  await expect(page.getByTestId('nhome-stock')).toContainText(String(dash.stock_count))
  await expect(page.getByTestId('nhome-bank')).toContainText(fmt(dash.cash_in_hand))
  await expect(page.getByTestId('nhome-attention')).toContainText('1 repairs open')
  await expect(page.getByTestId('nhome-bar')).toHaveCount(7)
  await expect(page.getByTestId('nhome-sits')).toContainText(fmt(dash.receivable))
  await page.screenshot({ path: 'test-results/newui-home.png', fullPage: true })

  // periods: yesterday had nothing
  await page.getByTestId('nhome-p-yesterday').click()
  await expect(page.getByTestId('nhome-sales')).toContainText('Phones sold: 0')
  await page.getByTestId('nhome-p-month').click()
  await expect(page.getByTestId('nhome-sales')).toContainText(fmt(day.sales_total))

  // the cards open their screens
  await page.getByTestId('nhome-attention').getByTestId('nhome-att').first().click()
  await expect(page).toHaveURL(/\/new\/repairs$/)
  await page.goto('/new')
  await page.getByTestId('nhome-stock').click()
  await expect(page).toHaveURL(/\/new\/stock\/summary$/)
  await page.goto('/new')

  // Urdu: one language, right to left
  await page.getByTestId('newui-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-home-ur.png', fullPage: true })
})
