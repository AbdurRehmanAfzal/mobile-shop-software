/** Owner 2026-11-13 (ADR-067): a purchase entered "paid in full in cash" that came on udhaar is put
 *  right after its phone was sold — the cash comes back, the dealer's khata shows what is owed. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('cash purchase made udhaar after the phone was sold', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Paid Fix Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Udhaar Traders', phone: '03219990000', kinds: ['supplier'] } })).json()).id
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, paid: 20000, devices: [{ device: { imei1: '356938035647777', brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 20000, asking_price: 25000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id
  const sale = await request.post('/api/v1/sales', { headers: h, data: { devices: [{ device_id: dev, price: 25000 }], paid: 25000 } })
  expect(sale.ok(), await sale.text()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // from the sold phone's page
  await page.goto(`/stock/${dev}`)
  await page.getByTestId('device-change-paid').click()
  const sheet = page.getByTestId('paid-fix-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet).toContainText('20,000')
  await page.getByTestId('paid-fix-none').click()
  await expect(page.getByTestId('paid-fix-effect')).toContainText('Udhaar Traders')
  await expect(page.getByTestId('paid-fix-effect')).toContainText('20,000 more to give')
  await expect(page.getByTestId('paid-fix-save')).toBeDisabled() // the reason is still to write
  await sheet.getByLabel('Reason').fill('it came on udhaar')
  await page.screenshot({ path: 'test-results/purchase-paid-fix.png', fullPage: true })
  await page.getByTestId('paid-fix-save').click()
  await expect(sheet).toBeHidden()

  const party = await (await request.get(`/api/v1/parties/${dealer}`, { headers: h })).json()
  expect(party.balance).toBe('-20000.00')
  const d = await (await request.get(`/api/v1/devices/${dev}`, { headers: h })).json()
  expect(d.status).toBe('sold')
})
