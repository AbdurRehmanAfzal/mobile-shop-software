/** Owner 2026-11-13:
 *  1. PTA has a CP ID option;
 *  2. a phone already in stock gets its SIM lock by Edit details;
 *  3. changing a dealer bill's person finds customers too, and an existing number offers that person. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('CP ID, SIM lock by edit, change a purchase to a customer', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'CPID Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Wrong Dealer', phone: '03215550001', kinds: ['supplier'] } })).json()).id
  const cust = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Right Customer', phone: '03215550002', kinds: ['customer'] } })).json()).id
  // the API takes CP ID
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: '356938035650002', brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'cpid' }, cost: 9000, asking_price: 11000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const p = await pr.json()
  const dev = p.lines[0].device_id
  expect((await (await request.get(`/api/v1/devices/${dev}`, { headers: h })).json()).pta_status).toBe('cpid')

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // 1 + 2: the phone shows CP ID; Edit details sets the SIM lock afterwards
  await page.goto(`/stock/${dev}`)
  await expect(page.getByText('CP ID').first()).toBeVisible()
  await page.getByRole('button', { name: 'Edit details' }).click()
  await expect(page.getByRole('button', { name: 'CP ID', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('sim-lock-locked').click()
  await page.getByTestId('sim-lock-carrier').fill('Verizon')
  await page.getByRole('button', { name: 'Save', exact: true }).last().click()
  await expect(page.getByText('SIM locked · Verizon').first()).toBeVisible()
  const d = await (await request.get(`/api/v1/devices/${dev}`, { headers: h })).json()
  expect([d.sim_lock, d.sim_lock_carrier]).toEqual(['locked', 'Verizon'])

  // 3: the dealer bill's person → a customer, found by search
  await page.goto(`/purchases/${p.id}?change=1`)
  await page.getByPlaceholder('Name, phone or CNIC').fill('Right')
  await expect(page.getByRole('button', { name: /Right Customer/ }).first()).toBeVisible()
  // a new person with a number already saved offers that person instead
  await page.getByRole('button', { name: 'New person' }).last().click()
  await page.getByLabel('Name', { exact: true }).fill('Right Cust')
  await page.getByLabel('Mobile number').last().fill('3215550002')
  await page.getByRole('button', { name: 'Save', exact: true }).last().click()
  await expect(page.getByTestId('party-exists')).toContainText('Right Customer')
  await page.screenshot({ path: 'test-results/party-exists.png', fullPage: true })
  await page.getByTestId('party-exists-use').first().click()
  await page.getByLabel('Reason').fill('it was a customer')
  await page.getByTestId('purchase-party-save').click()
  const after = await (await request.get(`/api/v1/purchases/${p.id}`, { headers: h })).json()
  expect(after.party_id).toBe(cust)
})
