/** Shop Audit → People and Udhaar (docs/17 P5): rankings by a named metric, the udhaar book
 *  with both sides apart and the age of each debt, and the journey card on a person's page. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const iso = (daysAgo: number) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

test('people rankings, udhaar book and the journey card', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('People Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const brand = (await get('/catalogue/brands'))[0]
  const model = (await get(`/catalogue/models?brand_id=${brand.id}`))[0]
  const dev = (imei: string) => ({ imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' })
  const dealer = await post('/parties', { name: 'Dealer', phone: '03005556666', kinds: ['supplier'] })
  const ahmed = await post('/parties', { name: 'Ahmed', phone: '03001111111', kinds: ['customer'] })
  const bilal = await post('/parties', { name: 'Bilal', phone: '03002222222', kinds: ['customer'] })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, date: iso(50), devices: [{ device: dev('490154203237518'), cost: 800, asking_price: 1000 }, { device: dev('356938035643809'), cost: 800, asking_price: 1200 }, { device: dev('352099001761481'), cost: 30000, asking_price: 37000 }], paid: 1600 })
  const [a, b, c] = pur.lines.map((l: { device_id: string }) => l.device_id)
  const inv1 = await post('/sales', { party_id: ahmed.id, date: iso(45), devices: [{ device_id: a, price: 1000 }], paid: 0 })
  await post('/payments', { party_id: ahmed.id, direction: 'in', amount: 400, date: iso(10), allocations: [{ document_type: 'invoice', document_id: inv1.id, amount: 400 }] })
  await post('/sales', { party_id: ahmed.id, devices: [{ device_id: c, price: 37000 }], paid: 37000 })
  await post('/sales', { party_id: bilal.id, date: iso(20), devices: [{ device_id: b, price: 1200 }], paid: 1200 })

  // rankings: customers by sales, then by profit, then suppliers by phones
  await page.goto('/audit/people?preset=all_time')
  const rows = page.getByTestId('rank-rows')
  await expect(rows.locator('a').first()).toContainText('Ahmed')
  await expect(rows.locator('a').first()).toContainText('Rs. 38,000')
  await expect(rows.locator('a').nth(1)).toContainText('Bilal')
  await expect(page.getByTestId('rank-total')).toContainText('Rs. 39,200')
  await page.getByRole('button', { name: 'Customers by profit' }).click()
  await expect(page).toHaveURL(/metric=customers_profit/)
  await expect(rows.locator('a').first()).toContainText('Rs. 7,200')
  await page.getByRole('button', { name: 'Suppliers by phones' }).click()
  await expect(rows.locator('a').first()).toContainText('Dealer')
  await expect(rows.locator('a').first()).toContainText('3')
  await page.getByRole('button', { name: 'Largest amounts we owe' }).click()
  await expect(rows.locator('a').first()).toContainText('Rs. 30,000')
  await page.screenshot({ path: 'test-results/audit-people.png', fullPage: true })

  // udhaar: Ahmed owes 600 (45 days old), we owe the dealer 30,000 (50 days)
  await page.getByRole('main').getByRole('link', { name: 'Udhaar' }).click()
  await expect(page).toHaveURL(/\/audit\/udhaar/)
  await expect(page.getByTestId('udhaar-receivable')).toContainText('Rs. 600')
  await expect(page.getByTestId('udhaar-payable')).toContainText('Rs. 30,000')
  const mv = page.getByTestId('udhaar-movement')
  await expect(mv).toContainText('Udhaar given on sales')
  await expect(mv).toContainText('1,000')
  await expect(mv).toContainText('Received from people')
  await expect(mv).toContainText('400')
  const recv = page.getByTestId('rows-receivable')
  await expect(recv).toContainText('Ahmed')
  await expect(recv).toContainText('45 days')
  await expect(page.getByTestId('rows-payable')).toContainText('Dealer')
  await expect(page.getByTestId('age-receivable')).toBeVisible()
  const phones = page.getByTestId('udhaar-phones')
  await expect(phones).toContainText('490154203237518')
  await expect(phones).toContainText('they owe')
  await expect(phones).toContainText('we owe')
  await page.screenshot({ path: 'test-results/audit-udhaar.png', fullPage: true })

  // the journey card on Ahmed's page, then as of 20 days ago
  await recv.getByRole('link', { name: /Ahmed/ }).click()
  await expect(page).toHaveURL(new RegExp(`/parties/${ahmed.id}`))
  const j = page.getByTestId('party-journey')
  await expect(j).toContainText('Whole journey')
  await expect(j).toContainText('Phones sold to them')
  await expect(j).toContainText('Rs. 37,400')
  await expect(j).toContainText('Rs. 7,200')
  await expect(j).toContainText('they owe')
  await page.getByLabel('journey as of').fill(iso(20))
  await expect(j).toContainText('Balance on that day')
  await expect(j).toContainText('Rs. 1,000')
  await j.getByText('Every dealing').click()
  await expect(page.getByTestId('journey-timeline')).toContainText('Sale')
  await page.screenshot({ path: 'test-results/audit-journey.png', fullPage: true })
})
