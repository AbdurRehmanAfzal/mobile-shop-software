/** ADR-134: one item's page in the new product (file 17). Its figures are the server's (`/devices/{id}`,
 *  `/money`), and its jobs are the live phone page's: asking price, a note, the purchase price, amanat,
 *  sell (the counter opens with the phone on the bill). */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: an item’s page — figures, asking, note, purchase price, sell, amanat, Urdu', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Item Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Hall Road Traders', phone: '03215550171', kinds: ['supplier'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35694${stamp}0${n}171`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 30000, asking_price: 36000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 20000, method: 'cash', devices: [dev(1), dev(2)] })
  const id = pur.lines[0].device_id
  await post('/sales', { devices: [{ device_id: pur.lines[1].device_id, price: 37000 }], paid: 37000 })
  const money = await get(`/devices/${id}/money`)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto(`/new/item/${id}`)
  await expect(page.getByTestId('nitem')).toBeVisible()
  await expect(page.getByTestId('nitem-title')).toContainText(model.name)
  await expect(page.getByTestId('nitem-status')).toContainText('In stock')
  await expect(page.getByTestId('nitem-identity')).toContainText(pur.lines[0].imei1 ?? (await get(`/devices/${id}`)).imei1)
  // the money is the server's
  await expect(page.getByTestId('nitem-c-cost')).toContainText(fmt(money.summary.cost))
  await expect(page.getByTestId('nitem-c-paid')).toContainText(fmt(money.summary.paid_out))
  await expect(page.getByTestId('nitem-c-owed')).toContainText(fmt(money.summary.payable))
  await expect(page.getByTestId('nitem-side-purchase')).toContainText('Hall Road Traders')
  // the same model sold here once
  await expect(page.getByTestId('nitem-range')).toContainText('37,000')
  // the unit's own ledger (mock-up 20): the server's out / in / net and its lines
  await expect(page.getByTestId('nitem-lg-out')).toContainText(fmt(money.ledger.out))
  await expect(page.getByTestId('nitem-lg-net')).toContainText(fmt(money.ledger.net))
  await expect(page.getByTestId('nitem-lg-row')).toHaveCount(money.ledger.rows.length)
  await page.screenshot({ path: 'test-results/newui-item.png', fullPage: true })
  await page.getByTestId('nitem-ledger-open').click()
  await expect(page.getByTestId('nitem-lg-frame')).toBeVisible()
  await expect(page.frameLocator('[data-testid="nitem-lg-frame"]').locator('body')).toContainText(pur.no)
  await page.screenshot({ path: 'test-results/newui-item-ledger.png' })
  const csv = page.waitForEvent('download')
  await page.getByTestId('nitem-lg-csv').click()
  expect((await csv).suggestedFilename()).toContain('.csv')
  await page.getByTestId('nitem-lg-share').click()
  await expect(page.getByTestId('nitem-toast')).toContainText('Summary copied')
  await page.getByTestId('nitem-lg-close').click()

  // asking price
  await page.getByTestId('nitem-asking').click()
  await page.getByTestId('nitem-price-input').fill('38000')
  await page.getByTestId('nitem-price-save').click()
  await expect(page.getByTestId('nitem-price-drawer')).toBeHidden()
  await expect.poll(async () => Number((await get(`/devices/${id}`)).asking_price)).toBe(38000)
  await expect(page.getByTestId('nitem-asking')).toContainText('38,000')

  // a note, into the timeline
  await page.getByTestId('nitem-tile-note').click()
  await page.getByTestId('nitem-note-text').fill('Customer Ali asked for it')
  await page.getByTestId('nitem-note-save').click()
  await expect(page.getByTestId('nitem-timeline')).toContainText('Customer Ali asked for it')

  // the purchase price, onto the dealer's khata
  await page.getByTestId('nitem-fixcost').click()
  await page.getByTestId('nitem-cost-input').fill('31000')
  await page.getByTestId('nitem-cost-khata').click()
  await page.getByTestId('nitem-cost-reason').fill('Dealer rate changed')
  await page.getByTestId('nitem-cost-save').click()
  await expect(page.getByTestId('nitem-cost-drawer')).toBeHidden()
  await expect.poll(async () => Number((await get(`/devices/${id}/money`)).summary.cost)).toBe(31000)
  await expect(page.getByTestId('nitem-c-cost')).toContainText('31,000')

  // an expense on the unit (mock-up 20): added to its cost, then deleted with a reason
  await page.getByTestId('nitem-add-expense').click()
  await page.getByTestId('nitem-expense-amount').fill('1500')
  await page.getByTestId('nitem-expense-screen_guard').click()
  await page.getByTestId('nitem-expense-note').fill('Glass protector')
  await page.getByTestId('nitem-expense-save').click()
  await expect(page.getByTestId('nitem-c-added')).toContainText('1,500')
  await expect(page.getByTestId('nitem-c-net')).toContainText('32,500')
  await expect.poll(async () => (await get(`/devices/${id}/money`)).summary.net_cost).toBe('32500.00')
  await expect(page.getByTestId('nitem-lg-row')).toHaveCount((await get(`/devices/${id}/money`)).ledger.rows.length)
  await page.getByTestId('nitem-cost-undo').click()
  await page.getByTestId('nitem-expense-undo-why').fill('typed on the wrong phone')
  await page.getByTestId('nitem-expense-undo-yes').click()
  await expect(page.getByTestId('nitem-c-net')).toContainText('31,000')
  await expect.poll(async () => (await get(`/devices/${id}/money`)).summary.added).toBe('0.00')

  // the QC matrix marks and clears a fault through the live faulty events
  await page.getByTestId('nitem-qc-display').click()
  await expect(page.getByTestId('nitem-status')).toContainText('Faulty')
  await expect(page.getByTestId('nitem-qc-display')).toContainText('Issue')
  await page.getByTestId('nitem-qc-display').click()
  await expect(page.getByTestId('nitem-status')).toContainText('In stock')
  expect((await get(`/devices/${id}`)).faults ?? []).toEqual([])

  // the pitch is copied, the sticker is the server's
  await page.getByTestId('nitem-pitch').click()
  await expect(page.getByTestId('nitem-toast')).toContainText('copied')
  await expect(page.getByTestId('nitem-sticker-frame')).toBeVisible()

  // Sell opens the counter with this phone on the bill
  await page.getByTestId('nitem-sell').click()
  await expect(page).toHaveURL(new RegExp(`/new/sale/new\\?device=${id}`))
  await expect(page.getByTestId('npos-line')).toHaveCount(1)
  await page.goto(`/new/item/${id}`)

  // amanat to the dealer
  await page.getByTestId('nitem-loan').click()
  await page.getByTestId('nitem-loan-q').fill('Hall Road')
  await page.getByTestId('nitem-loan-people').getByText('Hall Road Traders').click()
  await page.getByTestId('nitem-loan-save').click()
  await expect(page.getByTestId('nitem-status')).toContainText('On loan')
  expect((await get(`/devices/${id}`)).status).toBe('on_loan')

  // every other job is under More actions
  await page.getByTestId('nitem-more').click()
  await expect(page.getByTestId('nitem-act-edit')).toBeVisible()
  await page.getByTestId('nitem-more').click()

  // Urdu: one language, right to left
  await page.getByTestId('nitem-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-item-ur.png', fullPage: true })
})
