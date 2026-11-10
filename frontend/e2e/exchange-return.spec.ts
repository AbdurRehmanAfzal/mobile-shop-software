/** Owner 2026-11-10 (ADR-057): a phone sold days ago comes back. Exchanged for a cheaper phone with
 *  part of the difference paid now (the rest "To give to customer"), and returned with part handed
 *  back now and the rest kept in the khata. */

import { expect, test, type APIRequestContext } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const A = '490154203237518'
const B = '356938035643809'
const C = '353456789012348'

async function setup(request: APIRequestContext) {
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Back Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const stock = async (imei: string, cost: number, asking: number) => (await (await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: imei, brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: cost, asking_price: asking } })).json()).id as string
  const cus = async (name: string, p: string) => (await (await request.post('/api/v1/parties', { headers: h, data: { name, phone: p, kinds: ['customer'] } })).json()).id as string
  const ali = await cus('Ali Khan', '03211111111')
  const bilal = await cus('Bilal Ahmed', '03212222222')
  const a = await stock(A, 60000, 80000)
  await stock(B, 40000, 55000)
  const c = await stock(C, 60000, 80000)
  const sell = async (party: string, dev: string) => (await (await request.post('/api/v1/sales', { headers: h, data: { party_id: party, devices: [{ device_id: dev, price: 80000 }], paid: 80000 } })).json()).id as string
  await sell(ali, a)
  const billC = await sell(bilal, c)
  return { ph, h, ali, bilal, billC }
}

test('exchange with part paid back, return with the rest in the khata', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const { ph, h, ali, bilal, billC } = await setup(request)
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // exchange: old phone back at 70,000, new phone 55,000, the shop pays 5,000 now
  await page.goto('/exchange/new')
  await page.getByPlaceholder('Name, phone or CNIC').fill('Ali')
  await page.getByRole('button', { name: /Ali Khan/ }).first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add the old phone' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill(A)
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('70000')
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Pick the new phone from stock' }).click()
  await page.getByText(B).first().click()
  await page.getByLabel('Sale price').fill('55000')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByTestId('exchange-give').fill('5000')
  await expect(page.getByTestId('exchange-balance')).toContainText('To give to customer')
  await expect(page.getByTestId('exchange-balance')).toContainText('10,000')
  await page.screenshot({ path: 'test-results/exchange-settle.png', fullPage: true })
  await page.getByRole('button', { name: 'Complete exchange' }).click()
  await expect(page.getByTestId('exchange-result-balance')).toContainText('To give to customer: 10,000')
  const aliNow = await (await request.get(`/api/v1/parties/${ali}`, { headers: h })).json()
  expect(aliNow.balance).toBe('-10000.00')

  // return: 80,000 back, 30,000 now, the rest in the khata
  await page.goto(`/return/new?invoice=${billC}`)
  await expect(page.getByTestId('return-credit')).toHaveValue('80000')
  await page.getByLabel('Give back to customer (Rs)').fill('30000')
  await page.getByTestId('rest-khata').click()
  await expect(page.getByTestId('return-after')).toContainText('To give to customer')
  await expect(page.getByTestId('return-after')).toContainText('50,000')
  await page.screenshot({ path: 'test-results/return-settle.png', fullPage: true })
  await page.getByRole('button', { name: 'Take it back' }).click()
  await expect(page.getByText('2/3')).toHaveCount(0)
  const bilalNow = await (await request.get(`/api/v1/parties/${bilal}`, { headers: h })).json()
  expect(bilalNow.balance).toBe('-50000.00')
})
