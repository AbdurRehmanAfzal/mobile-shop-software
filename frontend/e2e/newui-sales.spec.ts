/** ADR-134: the sales screen (file 25) at /new/sales — the six figures, kinds and brands, models with
 *  profit / loss, customers, invoices with several settled at once, the full ledger, filters and Urdu;
 *  every figure is the server's `/bills-hub/sales`. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

test('new product: the sales screen — figures, brands, models, people, invoices, ledger, Urdu', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Sales Hub', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Sheikh Amir', phone: '03215550511', kinds: ['supplier'] })
  const a = await post('/parties', { name: 'Usman Tariq', phone: '03215550512', kinds: ['customer'] })
  const b = await post('/parties', { name: 'Awais Store', phone: '03215550513', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((x: { name: string }) => x.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35698${stamp}0${n}511`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 20000, asking_price: 24000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 60000, method: 'cash', devices: [dev(1), dev(2), dev(3)] })
  await post('/sales', { party_id: a.id, devices: [{ device_id: pur.lines[0].device_id, price: 25000 }], paid: 5000 })
  await post('/sales', { party_id: b.id, devices: [{ device_id: pur.lines[1].device_id, price: 24000 }], paid: 4000 })
  await post('/sales', { party_id: b.id, devices: [{ device_id: pur.lines[2].device_id, price: 18000 }], paid: 18000, below_cost_ok: true })
  const now = new Date()
  const qs = `date_from=${iso(new Date(now.getFullYear(), now.getMonth(), 1))}&date_to=${iso(now)}`
  const d = await get(`/bills-hub/sales?${qs}`)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/sales')
  await expect(page.getByTestId('nsales')).toBeVisible()
  await expect(page.getByTestId('nsales-f-sales')).toContainText(fmt(d.figures.sale))
  await expect(page.getByTestId('nsales-f-cost')).toContainText(fmt(d.figures.cost))
  await expect(page.getByTestId('nsales-f-received')).toContainText(fmt(d.figures.received))
  await expect(page.getByTestId('nsales-f-udhaar')).toContainText(fmt(d.figures.udhaar))
  await expect(page.getByTestId('nsales-f-gain')).toContainText(fmt(d.figures.gain))
  await expect(page.getByTestId('nsales-f-loss')).toContainText(fmt(d.figures.loss))
  await expect(page.getByTestId('nsales-kind-phone')).toContainText(fmt(d.kinds.find((k: { key: string }) => k.key === 'phone').sale))
  await expect(page.getByTestId('nsales-brand-row')).toHaveCount(d.brands.length)
  await page.screenshot({ path: 'test-results/newui-sales.png', fullPage: true })

  // loss deals: one line
  await page.getByTestId('nsales-deal-loss').click()
  await page.getByTestId('nsales-tab-ledger').click()
  await expect(page.getByTestId('nsales-line')).toHaveCount(1)
  await page.getByTestId('nsales-deal-all').click()
  await expect(page.getByTestId('nsales-line')).toHaveCount(d.lines.length)

  // a brand opens its models
  await page.getByTestId('nsales-tab-overview').click()
  await page.getByTestId('nsales-brand-row').first().click()
  await expect(page).toHaveURL(/tab=models/)
  await expect(page.getByTestId('nsales-model')).toHaveCount(1)

  // people
  await page.getByTestId('nsales-brand').selectOption('')
  await page.getByTestId('nsales-tab-parties').click()
  await expect(page.getByTestId('nsales-party')).toHaveCount(d.parties.length)

  // invoices: settle two at once (one payment per bill)
  await page.getByTestId('nsales-tab-invoices').click()
  await expect(page.getByTestId('nsales-bill')).toHaveCount(3)
  await page.getByTestId('nsales-check-all').check()
  await page.getByTestId('nsales-settle-sel').click()
  await page.getByTestId('nsales-settle-sel-go').click()
  await expect(page.getByTestId('nbill-toast')).toBeVisible()
  const after = await get(`/bills-hub/sales?${qs}`)
  expect(after.figures.udhaar).toBe('0.00')
  await expect(page.getByTestId('nsales-f-udhaar')).toContainText('0')

  // Urdu: one language, right to left
  await page.getByTestId('nsales-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-sales-ur.png', fullPage: true })
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
})
