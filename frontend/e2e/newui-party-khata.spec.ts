/** ADR-134: what mock-up 21 adds to a person's khata — their phones in the shop / sold / returned, the
 *  stock tracker, brand & model, money by channel, Fix / Edit on a ledger line (a payment deleted with a
 *  reason), the promised date, and the full ledger report (the server's A4 page) — every figure the
 *  server's `/parties/{id}/khata`. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: a person\'s khata, full version (file 21) — stock, models, channels, fix, promise, report', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Khata Poora', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Bilal Software Dubai', phone: '03215550211', kinds: ['supplier'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35695${stamp}0${n}211`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 30000, asking_price: 36000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 30000, method: 'cash', devices: [dev(1), dev(2), dev(3)] })
  await post('/sales', { devices: [{ device_id: pur.lines[0].device_id, price: 37000 }], paid: 37000 })
  await post('/returns/purchase', { purchase_id: pur.id, line_ids: [pur.lines[2].id] })
  const bank = await post('/payments', { party_id: dealer.id, direction: 'out', amount: 10000, method: 'bank', notes: 'Meezan slip 8821' })
  const due = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10)
  await post('/payments', { party_id: dealer.id, direction: 'out', amount: 2000, purpose: 'lending', due_date: due })
  const kh = await get(`/parties/${dealer.id}/khata`)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto(`/new/parties/${dealer.id}`)
  await expect(page.getByTestId('nkh-name')).toHaveText('Bilal Software Dubai')
  // the four cards are the server's
  await expect(page.getByTestId('nkh-bal')).toContainText(fmt((await get(`/parties/${dealer.id}`)).balance))
  await expect(page.getByTestId('nkh-stock-in_shop')).toContainText(String(kh.stock.in_shop.count))
  await expect(page.getByTestId('nkh-stock-sold')).toContainText(String(kh.stock.sold.count))
  await expect(page.getByTestId('nkh-stock-returned')).toContainText(String(kh.stock.returned.count))
  await expect(page.getByTestId('nkh-profit-val')).toContainText(fmt(kh.stock.sold.profit))
  await expect(page.getByTestId('nkh-channels')).toContainText('Bank')
  await expect(page.getByTestId('nkh-promise')).toContainText(new Date(due).getFullYear().toString())
  await page.screenshot({ path: 'test-results/newui-party-khata.png', fullPage: true })

  // the stock tracker: the one in the shop can be sold or returned to the dealer
  await page.getByTestId('nkh-stock-in_shop').click()
  await expect(page.getByTestId('nkh-items')).toBeVisible()
  await expect(page.getByTestId('nkh-item')).toHaveCount(1)
  await expect(page.getByTestId('nkh-item-sell')).toBeVisible()
  await page.getByTestId('nkh-type').selectOption('all')
  await expect(page.getByTestId('nkh-item')).toHaveCount(3)
  // by model, by channel
  await page.getByTestId('nkh-tab-models').click()
  await expect(page.getByTestId('nkh-models')).toContainText(model.name)
  await page.getByTestId('nkh-tab-methods').click()
  await expect(page.getByTestId('nkh-methods')).toContainText('Meezan slip 8821')
  await expect(page.getByTestId('nkh-channel')).toHaveCount(kh.channels.length)

  // Fix / Edit on the bank payment: deleted with a reason, the balance moves back
  const before = Number((await get(`/parties/${dealer.id}`)).balance)
  await page.getByTestId('nkh-tab-ledger').click()
  await page.getByTestId('nkh-q').fill('10000')
  await page.getByTestId('nkh-fix').first().click()
  await expect(page.getByTestId('nkh-fix-window')).toBeVisible()
  await page.getByTestId('nkh-fx-void').click()
  await page.getByTestId('nkh-undo-why').fill('slip bounced')
  await page.getByTestId('nkh-undo-yes').click()
  await expect.poll(async () => Number((await get(`/parties/${dealer.id}`)).balance)).toBe(before - 10000)
  expect((await get(`/payments/${bank.id}`)).status).toBe('voided')
  await page.getByTestId('nkh-q').fill('')

  // the promised date
  const later = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10)
  await page.getByTestId('nkh-promise-change').click()
  await page.getByTestId('nkh-promise-date').fill(later)
  await page.getByTestId('nkh-promise-save').click()
  await expect.poll(async () => (await get(`/parties/${dealer.id}/khata`)).promise.date).toBe(later)

  // the full ledger report: the server's A4 page, its period and sections
  await page.getByTestId('nkh-report').click()
  const frame = page.frameLocator('[data-testid="nkh-rep-frame"]')
  await expect(frame.locator('body')).toContainText(pur.no)
  await expect(frame.locator('body')).toContainText('Money by channel')
  await page.screenshot({ path: 'test-results/newui-party-khata-report.png' })
  await page.getByTestId('nkh-rep-sec-channels').uncheck()
  await expect(frame.locator('body')).not.toContainText('Money by channel')
  await page.getByTestId('nkh-rep-today').click()
  await expect(frame.locator('body')).toContainText(new Date().getFullYear().toString())
  await expect(frame.locator('body')).toContainText(pur.no)
  const csv = page.waitForEvent('download')
  await page.getByTestId('nkh-rep-csv').click()
  expect((await csv).suggestedFilename()).toContain('.csv')
  await page.getByTestId('nkh-rep-close').click()

  // Urdu: one language, right to left
  await page.getByTestId('nkh-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-party-khata-ur.png', fullPage: true })
})
