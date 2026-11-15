/** Owner 2026-11-15 (ADR-090 part 2): a payment's amount is corrected from its row (the old one kept
 *  as Deleted), and a galla → bank move made by mistake is undone, each after the warning. */

import { expect, test, type Page } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function login(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test('payment edit and cash move undo', async ({ browser, request }) => {
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Undo Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const party = await (await request.post('/api/v1/parties', { headers: h, data: { kinds: ['customer'], name: 'Bilal Edit', phone: '03001239999' } })).json()
  expect((await request.post('/api/v1/payments', { headers: h, data: { party_id: party.id, direction: 'in', amount: 3000 } })).ok()).toBeTruthy()
  const accounts = await (await request.get('/api/v1/ledger/accounts', { headers: h })).json()
  const bank = await (await request.post('/api/v1/ledger/accounts', { headers: h, data: { kind: 'bank', name: 'Meezan Test' } })).json()
  expect((await request.post('/api/v1/ledger/transfers', { headers: h, data: { from_account_id: accounts[0].id, to_account_id: bank.id, amount: 2000 } })).ok()).toBeTruthy()

  const ctx = await browser.newContext()
  await ctx.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const page = await ctx.newPage()
  await login(page, ph, 'e2e-secret-1')

  // the payment: 3,000 typed instead of 30,000 → Edit from the row
  await page.goto('/payments')
  await page.getByTestId('bill-edit').first().click()
  await expect(page.getByTestId('payment-edit')).toBeVisible()
  await page.getByTestId('pedit-amount').fill('30000')
  await page.getByTestId('pedit-reason').fill('typed 3000')
  await page.screenshot({ path: 'test-results/pay-edit.png' })
  await page.getByTestId('pedit-save').click()
  await expect(page.getByTestId('payment-edit')).toHaveCount(0)
  await expect(page.getByText('30,000').first()).toBeVisible()
  await expect(page.getByText('Deleted').first()).toBeVisible()

  // the cash move: undo after the warning
  await page.goto('/more/cash')
  await page.getByTestId('transfers').getByTestId('row-delete').click()
  await expect(page.getByTestId('delete-warning')).toContainText('the money goes back')
  await page.getByLabel('Why?').fill('wrong account')
  await page.getByTestId('sheet-backdrop').getByRole('button', { name: 'Undo this move' }).click()
  await expect(page.getByTestId('transfers').locator('.line-through')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/cash-undo.png' })
})

test('edit a sale bill: price corrected, the old bill kept as Deleted (ADR-090)', async ({ browser, request }) => {
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Edit Bill', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brand = (await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await (await request.get(`/api/v1/catalogue/models?brand_id=${brand.id}&q=105`, { headers: h })).json())[0]
  const dev = await (await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 800, asking_price: 1500 } })).json()
  const ali = await (await request.post('/api/v1/parties', { headers: h, data: { kinds: ['customer'], name: 'Ali Edit', phone: '03001237777' } })).json()
  const sale = await (await request.post('/api/v1/sales', { headers: h, data: { party_id: ali.id, devices: [{ device_id: dev.id, price: 1500 }], paid: 1500 } })).json()

  const ctx = await browser.newContext()
  await ctx.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const page = await ctx.newPage()
  await login(page, ph, 'e2e-secret-1')

  await page.goto(`/sales/${sale.id}`)
  await page.getByTestId('sale-edit-bill').click()
  await expect(page.getByTestId('sale-editing')).toContainText(sale.no)
  await expect(page.getByLabel('Sold for (Rs)')).toHaveValue('1500')
  await page.getByLabel('Sold for (Rs)').fill('1200')
  await page.getByTestId('sale-editing').getByLabel('Reason').fill('price was 1200')
  await page.screenshot({ path: 'test-results/sale-edit.png', fullPage: true })
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  const old = await (await request.get(`/api/v1/sales/${sale.id}`, { headers: h })).json()
  expect(old.status).toBe('void')
  expect(old.void_reason).toContain('Edited, replaced by')
  const list = await (await request.get('/api/v1/sales?limit=5', { headers: h })).json()
  const rows = Array.isArray(list) ? list : list.items
  expect(rows.some((r: { status: string; total: string }) => r.status !== 'void' && r.total === '1200.00')).toBeTruthy()
})

test('edit a purchase bill: the form opens filled, saving replaces it (ADR-090)', async ({ browser, request }) => {
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Edit Purchase', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brand = (await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await (await request.get(`/api/v1/catalogue/models?brand_id=${brand.id}&q=105`, { headers: h })).json())[0]
  const sup = await (await request.post('/api/v1/parties', { headers: h, data: { kinds: ['supplier'], name: 'Ali Traders', phone: '03001236666' } })).json()
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: sup.id, devices: [{ device: { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 5000, asking_price: 6500 }], paid: 2000 } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const pur = await pr.json()

  const ctx = await browser.newContext()
  await ctx.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const page = await ctx.newPage()
  await login(page, ph, 'e2e-secret-1')

  await page.goto(`/purchases/${pur.id}`)
  await page.getByTestId('purchase-edit-bill').click()
  await expect(page.getByTestId('purchase-editing')).toContainText(pur.no)
  await expect(page.getByText('490154203237518').first()).toBeVisible()
  await page.getByTestId('purchase-edit-reason').fill('wrong dealer bill no.')
  await page.screenshot({ path: 'test-results/purchase-edit.png', fullPage: true })
  await page.getByTestId('purchase-review-open').click()
  await page.getByTestId('review-ok').check()
  await page.getByTestId('purchase-save').click()
  await expect.poll(async () => (await (await request.get(`/api/v1/purchases/${pur.id}`, { headers: h })).json()).status).toBe('voided')
  const dev = (await (await request.get('/api/v1/devices?q=490154203237518', { headers: h })).json())[0]
  expect(dev.status).toBe('in_stock')
  const bal = (await (await request.get(`/api/v1/parties/${sup.id}`, { headers: h })).json()).balance
  expect(bal).toBe('-3000.00')
})
