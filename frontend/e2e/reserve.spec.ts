/** Owner 2026-11-10 (ADR-060): reserve a phone and some pieces of an item for a customer; a shelf
 *  for a phone; change the seller of a purchase from the phone's page. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const IMEI = '356938035641234'

test('reserve a phone and an item, shelf, change the seller from the phone', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Hold Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const party = async (name: string, p: string, kinds: string[]) => (await (await request.post('/api/v1/parties', { headers: h, data: { name, phone: p, kinds } })).json()).id as string
  await party('Ali Khan', '03211111111', ['customer'])
  const wrong = await party('Wrong Traders', '03213333333', ['supplier'])
  await party('Right Traders', '03214444444', ['supplier'])
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: wrong, devices: [{ device: { imei1: IMEI, brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved', location: 'Rack A2' }, cost: 1000, asking_price: 1500 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id
  const item = await (await request.post('/api/v1/accessories', { headers: h, data: { name: 'Type-C charger', category: 'charger', price: 800, opening_qty: 6, opening_cost: 300 } })).json()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // reserve the phone for Ali
  await page.goto(`/stock/${dev}`)
  await page.getByTestId('reserve-open').click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Ali')
  await page.getByRole('button', { name: /Ali Khan/ }).first().click()
  await page.getByTestId('reserve-save').click()
  await expect(page.getByTestId('device-reserved')).toContainText('Ali Khan')
  await page.screenshot({ path: 'test-results/reserved.png', fullPage: true })

  // the stock screen counts it as reserved, not available; the shelf finds it
  await page.goto('/stock')
  await expect(page.getByTestId('card-reserved')).toContainText('1')
  await expect(page.getByTestId('card-available')).toContainText('0')
  await page.getByPlaceholder("IMEI, model, brand, name or phone").fill('Rack A2')
  await expect(page.getByText(IMEI).first()).toBeVisible()

  // release it
  await page.goto(`/stock/${dev}`)
  await page.getByTestId('reserve-release').click()
  await expect(page.getByTestId('reserve-open')).toBeVisible()

  // change the seller from the phone's page
  await page.getByTestId('device-change-seller').click()
  await expect(page).toHaveURL(/\/purchases\/.+change=1/)
  await page.getByPlaceholder('Name, phone or CNIC').fill('Right')
  await page.getByRole('button', { name: /Right Traders/ }).first().click()
  await page.getByLabel('Reason').fill('wrong dealer picked')
  await page.getByTestId('purchase-party-save').click()
  await expect(page.getByRole('button', { name: 'Right Traders' })).toBeVisible()

  // hold 2 of 6 chargers
  await page.goto(`/accessories/${item.id}`)
  await page.getByTestId('item-reserve-open').click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Ali')
  await page.getByRole('button', { name: /Ali Khan/ }).first().click()
  await page.getByTestId('reserve-qty').fill('2')
  await page.getByTestId('reserve-save').click()
  await expect(page.getByTestId('item-reserve')).toContainText('4 free to sell')
})
