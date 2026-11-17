/** Owner 2026-11-15 (ADR-081): a bought phone turns out faulty and goes back to the seller. 50,000
 *  phone, 25,000 paid, 25,000 owed → returned: the 25,000 owed is cancelled, the seller gives the
 *  25,000 back, balance zero; the phone's record keeps both. A second phone goes back with a cut. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('return a faulty phone to the seller', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Return Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const seller = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Seller Khan', phone: '03217776666', kinds: ['supplier'] } })).json()
  const buy = async (base: string, cost: number, paid: number) => {
    const r = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: seller.id, devices: [{ device: { imei1: imei(base), brand_id: b.id, model_id: ms[0].id, condition: 'used', pta_status: 'pta_approved' }, cost }], paid } })
    expect(r.ok(), await r.text()).toBeTruthy()
    return r.json()
  }
  const p1 = await buy(`35693803592${String(Date.now()).slice(-3)}`, 50000, 25000)
  const bal = async () => (await (await request.get(`/api/v1/parties/${seller.id}`, { headers: h })).json()).balance

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // from the phone's page
  await page.goto(`/stock/${p1.lines[0].device_id}`)
  await page.getByTestId('device-more-toggle').click() // ADR-091: the less used jobs are under More
  await page.getByTestId('device-return-seller').click()
  await expect(page.getByTestId('pret-sheet')).toBeVisible()
  await expect(page.getByTestId('pret-cancelled')).toContainText('25,000')
  await expect(page.getByTestId('pret-back')).toContainText('25,000')
  await expect(page.getByTestId('pret-zero')).toBeVisible()
  await page.screenshot({ path: 'test-results/pret-sheet.png', fullPage: true })
  await page.getByTestId('pret-confirm').click()
  await page.getByTestId('pret-confirm-final').click() // ADR-102: after the impact preview
  await expect(page.getByTestId('pret-sheet')).toBeHidden()
  expect(await bal()).toBe('0.00')
  const dev = await (await request.get(`/api/v1/devices/${p1.lines[0].device_id}`, { headers: h })).json()
  expect(dev.status).toBe('returned_to_supplier')

  // a second one: 40,000 fully paid, the seller takes it back for 5,000 less and gives 20,000 today
  const p2 = await buy(`35693803593${String(Date.now()).slice(-3)}`, 40000, 40000)
  await page.goto(`/purchases/${p2.id}`)
  await page.getByTestId('purchase-return').click()
  await page.getByTestId('pret-cut').fill('5000')
  await expect(page.getByTestId('pret-back')).toContainText('35,000')
  await page.getByTestId('pret-got').fill('20000')
  await expect(page.getByTestId('pret-later')).toContainText('15,000')
  await page.getByTestId('pret-confirm').click()
  await page.getByTestId('pret-confirm-final').click() // ADR-102: after the impact preview
  await expect(page.getByTestId('pret-sheet')).toBeHidden()
  expect(await bal()).toBe('15000.00') // he owes the shop 15,000
})
