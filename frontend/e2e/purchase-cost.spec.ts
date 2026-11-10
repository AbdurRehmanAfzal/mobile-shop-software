/** Owner 2026-11-10 (ADR-063): the purchase price typed wrong is changed from the phone's page;
 *  the dealer's khata and the phone's cost follow. */

import { expect, test } from '@playwright/test'

test.setTimeout(120_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('change a phone purchase price', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Cost Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Price Traders', phone: '03215556666', kinds: ['supplier'] } })).json()).id
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: '356938035644444', brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 10000, asking_price: 15000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto(`/stock/${dev}`)

  await page.getByTestId('fix-cost').click()
  const sheet = page.getByTestId('cost-sheet')
  await expect(sheet).toContainText('10,000')
  await page.getByTestId('cost-new').fill('12000')
  await expect(page.getByTestId('cost-effect')).toContainText('Price Traders')
  await expect(page.getByTestId('cost-effect')).toContainText('2,000 more to give')
  await expect(page.getByTestId('cost-save')).toBeDisabled() // the reason is still to write
  await sheet.getByLabel('Reason').fill('typed 10 instead of 12')
  await page.screenshot({ path: 'test-results/purchase-cost.png', fullPage: true })
  await page.getByTestId('cost-save').click()
  await expect(sheet).toBeHidden()

  const d = await (await request.get(`/api/v1/devices/${dev}`, { headers: h })).json()
  expect(d.cost_price).toBe('12000.00')
  const party = await (await request.get(`/api/v1/parties/${dealer}`, { headers: h })).json()
  expect(party.balance).toBe('-12000.00')

  // the Smart style has it beside the cost
  await page.getByTestId('dstyle-smart').click()
  await expect(page.getByTestId('dl-row-cost')).toContainText('12,000')
  await page.getByTestId('dl-row-cost').getByRole('button', { name: 'Change purchase price' }).click()
  await expect(page.getByTestId('cost-sheet')).toContainText('12,000')
})
