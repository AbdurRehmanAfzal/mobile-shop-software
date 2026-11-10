/** Owner brief 2026-11-10 (ADR-058): Open balances — lena / dena by phone, customer, dealer and
 *  technician; a row shows its bills and pays them with the usual form. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const I1234 = '356938035641234'

test('open balances: by phone, receive from the customer, pay the dealer', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Balance Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const party = async (name: string, p: string, kinds: string[]) => (await (await request.post('/api/v1/parties', { headers: h, data: { name, phone: p, kinds } })).json()).id as string
  const ali = await party('Ali Khan', '03211111111', ['customer'])
  const bilal = await party('Bilal Traders', '03213333333', ['supplier'])
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: bilal, devices: [{ device: { imei1: I1234, brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 20000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id
  const sale = await request.post('/api/v1/sales', { headers: h, data: { party_id: ali, devices: [{ device_id: dev, price: 15000 }], paid: 0, below_cost_ok: true } })
  expect(sale.ok(), await sale.text()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // one tap from the udhaar khata
  await page.goto('/khata')
  await page.getByTestId('khata-balances').click()
  await expect(page.getByTestId('bal-total-get')).toHaveText('15,000')
  await expect(page.getByTestId('bal-total-give')).toHaveText('20,000')
  const row = page.getByTestId(`bal-row-${I1234}`)
  await expect(row).toContainText('15,000')
  await expect(row).toContainText('20,000')
  await page.screenshot({ path: 'test-results/balances.png', fullPage: true })

  // receive 5,000 from Ali against his bill
  await row.click()
  await page.getByTestId('bal-receive').click()
  await expect(page.getByTestId('bal-settles')).toContainText('Sale bill')
  await page.getByLabel('Amount', { exact: true }).fill('5000')
  await page.getByRole('button', { name: 'Receive money' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('bal-total-get')).toHaveText('10,000')

  // the dealer tab: pay Bilal 8,000
  await page.getByTestId('bal-view-dealer').click()
  await page.getByTestId(`bal-row-${bilal}`).click()
  await page.getByTestId('bal-pay').click()
  await page.getByLabel('Amount', { exact: true }).fill('8000')
  await page.getByRole('button', { name: 'Pay money' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('bal-total-give')).toHaveText('12,000')
  const b = await (await request.get(`/api/v1/parties/${bilal}`, { headers: h })).json()
  expect(b.balance).toBe('-12000.00')
})
