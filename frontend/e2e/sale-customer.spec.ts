/** Owner 2026-11-12 (ADR-065): the sale asks "Who is buying?" — choose the customer or tick
 *  Walk-in on purpose; a walk-in sale made by mistake is put on the customer later from the bill. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('walk-in on purpose, then put the bill on a customer', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Walk Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Walk Dealer', phone: '03216667777', kinds: ['supplier'] } })).json()).id
  const imran = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Imran Ali', phone: '03217778888', kinds: ['customer'] } })).json()).id
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: '356938035645557', brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 900, asking_price: 1000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // the sale: the customer search is open; nothing chosen = cannot finish
  await page.goto('/sale/new')
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await expect(page.getByTestId('customer-box')).toContainText('Who is buying?')
  await expect(page.getByPlaceholder('Name, phone or CNIC')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Complete sale' })).toBeDisabled()
  await page.screenshot({ path: 'test-results/sale-who-buys.png', fullPage: true })
  await page.getByTestId('walk-in-tick').check()
  await expect(page.getByPlaceholder('Name, phone or CNIC')).toHaveCount(0)
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  // it was Imran Ali: put the bill on him from the phone's page
  await page.goto(`/stock/${dev}`)
  await page.getByTestId('device-change-buyer').click()
  const sheet = page.getByTestId('sale-customer-sheet')
  await expect(sheet).toBeVisible()
  await sheet.getByPlaceholder('Name, phone or CNIC').fill('Imran')
  await sheet.getByRole('button', { name: /Imran Ali/ }).first().click()
  await sheet.getByLabel('Reason').fill('salesman picked walk-in')
  await page.screenshot({ path: 'test-results/sale-customer-change.png', fullPage: true })
  await page.getByTestId('sale-customer-save').click()
  await expect(sheet).toBeHidden()
  await expect(page.getByText('Imran Ali').first()).toBeVisible()

  const d = await (await request.get(`/api/v1/devices/${dev}`, { headers: h })).json()
  expect(d.current_party_id).toBe(imran)
  const p = await (await request.get(`/api/v1/parties/${imran}`, { headers: h })).json()
  expect(p.balance).toBe('0.00')
})
