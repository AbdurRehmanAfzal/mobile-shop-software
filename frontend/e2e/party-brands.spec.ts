/** Owner 2026-11-13: a person's page shows their phones by brand and model, with how many and what
 *  is left to give / to get at each level and in all; a brand or model pays its open bills at once. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('dealer phones by brand and model, pay a whole model', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Brand Khata Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brand = await (await request.post('/api/v1/catalogue/brands', { headers: h, data: { name: 'Orbit' } })).json()
  const mA = await (await request.post('/api/v1/catalogue/models', { headers: h, data: { brand_id: brand.id, name: 'Orbit 9' } })).json()
  const mB = await (await request.post('/api/v1/catalogue/models', { headers: h, data: { brand_id: brand.id, name: 'Orbit 9 Max' } })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Model Traders', phone: '03211112222', kinds: ['supplier'] } })).json()).id
  const dev = (imei: string, model: string, cost: number) => ({ device: { imei1: imei, brand_id: brand.id, model_id: model, condition: 'box_pack', pta_status: 'pta_approved' }, cost, asking_price: cost + 2000 })
  // two bills on udhaar: two Orbit 9 (10,000 + 10,000) and one Orbit 9 Max (30,000)
  for (const body of [[dev('356938035648882', mA.id, 10000), dev('356938035648890', mA.id, 10000)], [dev('356938035648908', mB.id, 30000)]]) {
    const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, paid: 0, devices: body } })
    expect(pr.ok(), await pr.text()).toBeTruthy()
  }

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto(`/parties/${dealer}`)
  await expect(page.getByTestId('units-total')).toContainText('50,000')
  const b = page.getByTestId('units-brand-Orbit')
  await expect(b).toContainText('3 bought')
  await expect(b).toContainText('to give 50,000')
  const m9 = page.getByTestId('units-model-Orbit 9')
  await expect(m9).toContainText('× 2')
  await expect(m9).toContainText('to give 20,000')
  await expect(page.getByTestId('units-model-Orbit 9 Max')).toContainText('to give 30,000')
  await m9.getByRole('button', { name: /Orbit 9/ }).first().click()
  await expect(m9.getByTestId('unit-row')).toHaveCount(2)
  await page.screenshot({ path: 'test-results/party-brands.png', fullPage: true })

  // pay the whole model (its one bill)
  await m9.getByTestId('units-pay-group').click()
  await expect(page.getByTestId('pay-many')).toContainText('20,000')
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('20000')
  await page.getByRole('button', { name: 'Pay money' }).last().click() // the sheet's own button (the page header has one too)
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('units-total')).toContainText('30,000')
  const p = await (await request.get(`/api/v1/parties/${dealer}`, { headers: h })).json()
  expect(p.balance).toBe('-30000.00')

  // the plain list is one tap away
  await page.getByRole('button', { name: 'One list' }).click()
  await expect(page.getByTestId('unit-row')).toHaveCount(3)
})
