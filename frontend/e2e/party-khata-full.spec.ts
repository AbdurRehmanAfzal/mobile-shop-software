/** ADR-136 (owner 2026-11-26): a person's page with the full khata — the account's dates, WhatsApp
 *  khata, their phones in the shop / sold, money by channel, profit with hide, the book in four tabs
 *  with search, kind filter and Fix / Edit, sell now from the tracker, the full ledger report, a
 *  backdated entry, a payment deleted with a reason, the promised date changed, Urdu. Every figure is
 *  the server's (`/parties/{id}/khata`). */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('person page: the full khata of a dealer', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Khata Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Bilal Traders', phone: '03215550811', kinds: ['supplier'] })
  const cust = await post('/parties', { name: 'Usman Tariq', phone: '03215550812', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((x: { name: string }) => x.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35698${stamp}0${n}811`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 20000 + n * 1000, asking_price: 26000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 20000, method: 'cash', devices: [dev(1), dev(2), dev(3)] })
  await post('/sales', { party_id: cust.id, devices: [{ device_id: pur.lines[0].device_id, price: 25000 }], paid: 25000 })
  const pay = await post('/payments', { party_id: dealer.id, direction: 'out', amount: 5000, notes: 'part payment' })
  await post('/payments', { party_id: dealer.id, direction: 'out', amount: 3000, purpose: 'lending', due_date: '2027-01-10', allocations: [] })
  const kh = await get(`/parties/${dealer.id}/khata`)
  expect(kh.stock.in_shop.count).toBe(2)
  expect(kh.stock.sold.count).toBe(1)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })

  await page.goto(`/parties/${dealer.id}`)
  // what the page always had is still there
  await expect(page.getByTestId('party-got')).toBeVisible()
  // ADR-138: the profile, every action in one block, then the sections as tabs (Summary first)
  await expect(page.getByTestId('pkh-bio')).toBeVisible()
  await expect(page.getByTestId('party-actions')).toBeVisible()
  await expect(page.getByTestId('party-tab-summary')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('party-journey')).toBeVisible()
  // the dates of the account and the promise
  await expect(page.getByTestId('pkh-created')).toBeVisible()
  await expect(page.getByTestId('pkh-first')).toBeVisible()
  await expect(page.getByTestId('pkh-promise')).toContainText('10-01-2027')
  // the three cards, the server's figures
  await expect(page.getByTestId('pkh-stock-in')).toContainText('2')
  await expect(page.getByTestId('pkh-stock-sold')).toContainText('1')
  await expect(page.getByTestId('pkh-channel')).toHaveCount(kh.channels.length)
  await expect(page.getByTestId('pkh-profit-val')).toContainText(fmt(kh.stock.sold.profit))
  await page.getByTestId('pkh-eye').click()
  await expect(page.getByTestId('pkh-profit-val')).toHaveText('••••')
  await page.getByTestId('pkh-eye').click()
  await page.screenshot({ path: 'test-results/party-khata-full.png', fullPage: true })

  // the ledger: every line, kind filter, search by amount, running balance
  const st = await get(`/ledger/parties/${dealer.id}/statement`)
  await page.getByTestId('party-tab-ledger').click()
  await expect(page).toHaveURL(/tab=ledger/)
  await expect(page.getByTestId('party-ledger')).toBeVisible()
  await expect(page.getByTestId('pkh-row')).toHaveCount(st.rows.length)
  await page.getByTestId('pkh-type').selectOption('purchase')
  await expect(page.getByTestId('pkh-row')).toHaveCount(1)
  await page.getByTestId('pkh-type').selectOption('all')
  await page.getByPlaceholder('Search bill no, IMEI, model, bank, note…').fill('5,000')
  await expect(page.getByTestId('pkh-row')).toHaveCount(1)
  await page.getByPlaceholder('Search bill no, IMEI, model, bank, note…').fill('')

  // Fix / Edit on the purchase: the live corrections; on a payment: delete with a reason
  await page.getByTestId('pkh-type').selectOption('purchase')
  await page.getByTestId('pkh-fix').click()
  await expect(page.getByTestId('pkh-fx-open')).toBeVisible()
  await expect(page.getByTestId('pkh-fx-seller')).toBeVisible()
  await expect(page.getByTestId('pkh-fx-paid')).toBeVisible()
  await expect(page.getByTestId('pkh-fx-del')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByTestId('pkh-type').selectOption('all')
  await page.getByPlaceholder('Search bill no, IMEI, model, bank, note…').fill('5,000')
  await page.getByTestId('pkh-fix').click()
  await page.getByTestId('pkh-fx-void').click()
  await page.getByTestId('pkh-undo-why').fill('typed on the wrong person')
  await page.getByTestId('pkh-undo-yes').click()
  await expect(page.getByTestId('pkh-fix-sheet')).toBeHidden()
  expect((await get(`/payments/${pay.id}`)).status).not.toBe('posted')
  await page.getByPlaceholder('Search bill no, IMEI, model, bank, note…').fill('')

  // the tracker: three phones, only the unsold, sell now opens the sale with the phone
  await page.getByTestId('party-tab-phones').click()
  await expect(page.getByTestId('pkh-item')).toHaveCount(3)
  await page.getByTestId('pkh-type').selectOption('unsold')
  await expect(page.getByTestId('pkh-item')).toHaveCount(2)
  await expect(page.getByTestId('pkh-item-return').first()).toBeVisible()
  await page.getByTestId('pkh-type').selectOption('sold')
  await expect(page.getByTestId('pkh-item')).toHaveCount(1)
  await expect(page.getByTestId('pkh-item')).toContainText(fmt(kh.units.find((u: { state: string }) => u.state === 'sold').profit))
  await page.getByTestId('pkh-type').selectOption('all')

  // brand & model, the payment method log
  await expect(page.getByTestId('pkh-model')).toHaveCount(kh.models.length)
  await page.getByTestId('party-tab-payments').click()
  await expect(page.getByTestId('pkh-method').first()).toBeVisible()
  await expect(page.getByTestId('pkh-pay').first()).toBeVisible()

  // the promised date changed
  await page.getByTestId('pkh-promise-change').click()
  await page.getByTestId('pkh-promise-date').fill('2027-02-15')
  await page.getByTestId('pkh-promise-save').click()
  await expect(page.getByTestId('pkh-promise')).toContainText('15-02-2027')

  // a backdated payment from the page's own button
  await page.getByTestId('party-gave').click()
  await page.getByLabel('Amount').fill('1000')
  await page.getByTestId('pay-date').fill('2026-11-01')
  await page.locator('form button[type="submit"]').click()
  await expect(page.getByText(/saved/i).first()).toBeVisible()
  const pays = await get(`/payments?party_id=${dealer.id}`)
  expect((pays.items ?? pays).some((p: { date: string; amount: string }) => p.date === '2026-11-01' && Number(p.amount) === 1000)).toBeTruthy()
  await page.getByRole('button', { name: 'Done', exact: true }).click()

  // an action that lives in another section opens that section
  await page.getByTestId('party-act-old').click()
  await expect(page.getByTestId('old-balance')).toBeVisible()
  await page.getByTestId('party-act-lenden').click()
  await expect(page.getByTestId('party-lending')).toBeVisible()

  // WhatsApp khata: the balance in a message that can be edited
  await expect(page.getByTestId('pkh-wa')).toContainText('WhatsApp khata')
  await page.getByTestId('pkh-wa').click()
  await expect(page.getByTestId('pkh-wa-text')).toHaveValue(/Bilal Traders/)
  await page.getByRole('button', { name: 'Close' }).click()

  // the full ledger report: the server's A4 page, this month, a section unticked
  await page.getByTestId('pkh-report-open').click()
  await expect(page.getByTestId('pkh-rep-frame')).toBeVisible({ timeout: 30_000 })
  await page.getByTestId('pkh-rep-month').click()
  await page.getByTestId('pkh-rep-sec-models').uncheck()
  await expect(page.getByTestId('pkh-rep-frame')).toBeVisible()
  await page.screenshot({ path: 'test-results/party-khata-report.png' })
  await page.getByTestId('pkh-rep-close').click()

  // a sold-to customer's page shows the phone sold to them
  await page.goto(`/parties/${cust.id}`)
  await page.getByTestId('party-tab-phones').click()
  await expect(page.getByTestId('pkh-item')).toHaveCount(1)

  // Urdu: one language, right to left, nothing wider than a phone
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.goto(`/parties/${dealer.id}`)
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByTestId('party-tabs')).toBeVisible()
  await page.setViewportSize({ width: 360, height: 800 })
  await page.screenshot({ path: 'test-results/party-khata-full-ur.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()
})
