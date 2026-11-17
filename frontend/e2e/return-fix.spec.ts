/** Owner 2026-11-17 (ADR-101): a return is confirmed on a summary before it is saved; a damaged
 *  phone goes to Faulty; a wrong amount is corrected in one step; an undo shows what it puts back
 *  and then offers the right kind of return. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('return: confirm summary, damaged to Faulty, correct the amount, undo', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Fix Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Fix Dealer', phone: '03219998881', kinds: ['supplier'] } })).json()).id
  const buyer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Fix Buyer', phone: '03219998882', kinds: ['customer'] } })).json()).id
  const code = imei(`35693803580${String(Date.now()).slice(-3)}`)
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, paid: 65000, method: 'cash', devices: [{ device: { imei1: code, brand_id: b.id, model_id: ms[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 65000, asking_price: 70000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id
  const sale = await request.post('/api/v1/sales', { headers: h, data: { party_id: buyer, devices: [{ device_id: dev, price: 70000 }], paid: 70000 } })
  expect(sale.ok(), await sale.text()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })

  // the return: 68,000 handed back (2,000 cut), the phone came back damaged
  await page.goto(`/return/new?device=${dev}`)
  await page.getByLabel('Give back to customer (Rs)').fill('68000')
  await page.getByTestId('cond-damaged').click()
  await page.getByRole('button', { name: 'Take it back' }).click()
  const cf = page.getByTestId('return-confirm')
  await expect(cf).toContainText(code)
  // every figure below is the server's: the real posting, run and rolled back (ADR-102)
  await expect(cf.getByTestId('pv-cost')).toHaveText('Rs. 65,000') // what it cost, read from the bill
  await expect(cf.getByTestId('pv-stock')).toHaveText('1 phone(s) go to Faulty (not for normal sale)')
  await expect(cf.getByTestId('pv-cash')).toContainText('Rs. 68,000 goes out of')
  await expect(cf.getByTestId('pv-kept')).toHaveText('Rs. 2,000 is kept by the shop')
  // the owner also sees the books: stock value back at cost, the sale taken back, the profit effect
  await expect(cf.getByTestId('pv-stock-value')).toHaveText('+ Rs. 65,000')
  await expect(cf.getByTestId('pv-sales')).toHaveText('− Rs. 70,000')
  await expect(cf.getByTestId('pv-income')).toHaveText('+ Rs. 2,000')
  await expect(cf.getByTestId('pv-profit')).toContainText('3,000')
  // nothing was written by looking
  expect((await (await request.get('/api/v1/returns', { headers: h })).json()).length).toBe(0)
  // Go back keeps the form; then confirm
  await cf.getByTestId('return-confirm-back').click()
  await expect(page.getByTestId('return-confirm')).toHaveCount(0)
  await page.getByRole('button', { name: 'Take it back' }).click()
  await expect(page.getByTestId('pv-profit')).toBeVisible()
  await page.screenshot({ path: 'test-results/return-confirm.png', fullPage: true })
  await cf.getByTestId('return-confirm-btn').click()
  await expect(page.getByTestId('return-see-all')).toBeVisible({ timeout: 15_000 })
  const d1 = await (await request.get(`/api/v1/devices/${dev}`, { headers: h })).json()
  expect(d1.status).toBe('faulty')
  expect(Number(d1.cost_price)).toBe(65000)

  // the report shows how it came back; the amount is corrected in one step
  await page.getByTestId('return-see-all').click()
  const rep = page.getByTestId('returns-report')
  await rep.getByTestId('ret-row').getByRole('button').first().click()
  const det = page.getByTestId('ret-detail')
  await expect(det).toContainText('Damaged — keep it apart (Faulty)')
  await det.getByTestId('ret-edit').click()
  await expect(page).toHaveURL(/\/return\/new\?replace=/)
  await expect(page.getByTestId('return-fix')).toContainText('You are correcting RET-000001')
  await page.getByLabel('Give back to customer (Rs)').fill('69000')
  await expect(page.getByRole('button', { name: 'Take it back' })).toBeDisabled() // needs the reason
  await page.getByTestId('return-fix-why').fill('typed the wrong amount')
  await page.getByRole('button', { name: 'Take it back' }).click()
  await expect(page.getByTestId('return-confirm').getByTestId('pv-replace-note')).toContainText('RET-000001')
  await expect(page.getByTestId('return-confirm').getByTestId('pv-kept')).toHaveText('Rs. 1,000 is kept by the shop')
  await page.getByTestId('return-confirm-btn').click()
  await expect(page.getByTestId('return-see-all')).toBeVisible({ timeout: 15_000 })
  const all = await (await request.get('/api/v1/returns', { headers: h })).json()
  expect(all.map((x: { status: string }) => x.status).sort()).toEqual(['posted', 'voided'])
  const live = all.find((x: { status: string }) => x.status === 'posted')
  expect(live.refund_amount).toBe('69000.00')
  expect(live.replaces_no).toBe('RET-000001')

  // undo: the sheet says what it puts back; afterwards the right kind of return is offered
  await page.getByTestId('return-see-all').click()
  await page.getByTestId('returns-report').getByTestId('bill-delete').first().click()
  const undo = page.getByTestId('return-preview')
  await expect(undo.getByTestId('pv-undo-note')).toContainText('RET-000002')
  await expect(undo.getByTestId('pv-stock')).toHaveText('1 phone(s) go back to the customer as sold')
  await expect(undo.getByTestId('pv-cash')).toContainText('Rs. 69,000 comes into')
  await page.screenshot({ path: 'test-results/return-undo.png' })
  await page.getByPlaceholder(/./).last().fill('entered by mistake')
  await page.getByTestId('bill-delete-confirm').click()
  await expect(page.getByTestId('ret-after-undo')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('after-sale')).toBeVisible()
  await expect(page.getByTestId('after-purchase')).toBeVisible()
  const d2 = await (await request.get(`/api/v1/devices/${dev}`, { headers: h })).json()
  expect(d2.status).toBe('sold')
})
