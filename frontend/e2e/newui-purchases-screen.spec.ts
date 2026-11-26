/** ADR-134: the purchases screen (file 25's F3) at /new/purchases-screen — the five figures, kinds and
 *  brands, models bought with where each unit is now, dealers, bills with several paid at once, the
 *  full ledger, filters and Urdu; every figure is the server's `/bills-hub/purchases`. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('new product: the purchases screen — figures, brands, models and where they are, dealers, bills, ledger, Urdu', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Purchases Hub', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const d1 = await post('/parties', { name: 'Sheikh Amir', phone: '03215550611', kinds: ['supplier'] })
  const d2 = await post('/parties', { name: 'Hafeez Centre', phone: '03215550612', kinds: ['supplier'] })
  const cust = await post('/parties', { name: 'Usman Tariq', phone: '03215550613', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((x: { name: string }) => x.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35698${stamp}0${n}611`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 20000, asking_price: 24000 })
  const p1 = await post('/purchases', { kind: 'supplier', party_id: d1.id, paid: 30000, method: 'cash', devices: [dev(1), dev(2)] })
  await post('/purchases', { kind: 'supplier', party_id: d2.id, paid: 5000, method: 'cash', devices: [dev(3)] })
  const sale = await post('/sales', { party_id: cust.id, devices: [{ device_id: p1.lines[0].device_id, price: 25000 }], paid: 25000 })
  const now = new Date()
  const qs = `date_from=${iso(new Date(now.getFullYear(), now.getMonth(), 1))}&date_to=${iso(now)}`
  const d = await get(`/bills-hub/purchases?${qs}`)
  expect(d.figures.units).toBe(3)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  // from the sales screen's switch (F3 there)
  await page.goto('/new/sales')
  await page.getByTestId('nsales-purchases').click()
  await expect(page).toHaveURL(/\/new\/purchases-screen/)
  await expect(page.getByTestId('npsc')).toBeVisible()
  await expect(page.getByTestId('npsc-f-amount')).toContainText(fmt(d.figures.amount))
  await expect(page.getByTestId('npsc-f-paid')).toContainText(fmt(d.figures.paid))
  await expect(page.getByTestId('npsc-f-due')).toContainText(fmt(d.figures.due))
  await expect(page.getByTestId('npsc-f-avg')).toContainText(fmt(d.figures.avg))
  await expect(page.getByTestId('npsc-f-stock')).toContainText('2')
  await expect(page.getByTestId('npsc-f-stock')).toContainText('1')
  await expect(page.getByTestId('npsc-brand-row')).toHaveCount(d.brands.length)
  await page.screenshot({ path: 'test-results/newui-purchases-screen.png', fullPage: true })

  // the cost eye hides the bought-for figure on the screen
  await page.getByTestId('npsc-eye').click()
  await expect(page.getByTestId('npsc-f-amount')).toContainText('••••••')
  await page.getByTestId('npsc-eye').click()

  // the ledger: every line; the sold phone says to whom
  await page.getByTestId('npsc-tab-ledger').click()
  await expect(page.getByTestId('npsc-line')).toHaveCount(d.lines.length)
  await expect(page.getByTestId('npsc-ledger')).toContainText('Usman Tariq')
  await expect(page.getByTestId('npsc-ledger')).toContainText(sale.no)
  // only the bills with something left to pay
  await page.getByTestId('npsc-deal-udhaar').click()
  await expect(page.getByTestId('npsc-line')).toHaveCount(3)
  await page.getByTestId('npsc-deal-all').click()

  // a brand opens its models
  await page.getByTestId('npsc-tab-overview').click()
  await page.getByTestId('npsc-brand-row').first().click()
  await expect(page).toHaveURL(/tab=models/)
  await expect(page.getByTestId('npsc-model')).toHaveCount(1)
  await page.getByTestId('npsc-brand').selectOption('')

  // dealers, each opening its khata
  await page.getByTestId('npsc-tab-parties').click()
  await expect(page.getByTestId('npsc-party')).toHaveCount(2)

  // bills: pay both at once (one payment per bill)
  await page.getByTestId('npsc-tab-invoices').click()
  await expect(page.getByTestId('npsc-bill')).toHaveCount(2)
  await page.getByTestId('npsc-check-all').check()
  await page.getByTestId('npsc-pay-sel').click()
  await page.getByTestId('npsc-pay-sel-go').click()
  await expect(page.getByTestId('nbill-toast')).toBeVisible()
  const after = await get(`/bills-hub/purchases?${qs}`)
  expect(after.figures.due).toBe('0.00')
  await expect(page.getByTestId('npsc-f-due')).toContainText('0')

  // Urdu: one language, right to left
  await page.getByTestId('npsc-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-purchases-screen-ur.png', fullPage: true })
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
})
