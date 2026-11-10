/** Owner 2026-11-10: on udhaar, the part paid now is asked how it was paid (cash / online /
 *  cheque) and saved that way — the bill shows it and the money lands in that account. */

import { expect, test } from '@playwright/test'

test.setTimeout(120_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('udhaar sale: the part paid now by JazzCash', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Part Pay Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Dealer Part', phone: '03213334444', kinds: ['supplier'] } })).json()).id
  await request.post('/api/v1/parties', { headers: h, data: { name: 'Ahmed Udhaar', phone: '03214445555', kinds: ['customer'] } })
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: '356938035643339', brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 900, asking_price: 1000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto('/sale/new')
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await page.getByRole('button', { name: 'Udhaar', exact: true }).click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Ahmed')
  await page.getByRole('button', { name: /Ahmed Udhaar/ }).first().click()
  await expect(page.getByTestId('part-pay')).toHaveCount(0) // nothing paid now: nothing to ask
  await page.getByLabel('Paid now (if any)').fill('400')
  const part = page.getByTestId('part-pay')
  await expect(part).toBeVisible()
  await part.getByRole('button', { name: 'Online', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Complete sale' })).toBeDisabled() // bank still to choose
  await part.getByRole('button', { name: 'JazzCash', exact: true }).click()
  await part.getByLabel('TID / reference (optional)').fill('TID4040')
  await page.screenshot({ path: 'test-results/udhaar-part-pay.png', fullPage: true })
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  const sales = await (await request.get('/api/v1/sales?limit=1', { headers: h })).json()
  const inv = (Array.isArray(sales) ? sales : sales.items)[0]
  const bill = await (await request.get(`/api/v1/sales/${inv.id}`, { headers: h })).json()
  expect(bill.paid).toBe('400.00')
  expect(bill.payment.method).toBe('online')
  expect(bill.payment.bank).toBe('JazzCash')
  expect(bill.payment.reference).toBe('TID4040')
})
