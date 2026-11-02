/** Reports audit (docs/31): sales & purchases report (at the counter vs credit, payment status,
 *  filters, drill-down to the bill), the staff report, people counts, the new report sections,
 *  a download on each screen, and an error that shows a retry instead of loading forever. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('sales, purchases, staff and the report sections', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Report Shop')
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
  const cus = await post('/parties', { name: 'Ahmed', phone: '03219876543', kinds: ['customer'] })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, devices: ['490154203237518', '356938035643809', '352099001761481'].map((i) => ({ device: dev(i), cost: 800, asking_price: 1000 })), paid: 2400 })
  const [a, b] = pur.lines.map((l: { device_id: string }) => l.device_id)
  await post('/sales', { devices: [{ device_id: a, price: 1000 }], paid: 1000 })
  const credit = await post('/sales', { party_id: cus.id, devices: [{ device_id: b, price: 1200 }], paid: 700 })

  // sales: billed, at the counter vs credit, status filter, drill-down
  await page.goto('/audit/sales?preset=this_month')
  await expect(page.getByTestId('trade-hero')).toContainText('Rs. 2,200')
  const counter = page.getByTestId('trade-counter')
  await expect(counter).toContainText('Rs. 1,700')
  await expect(counter).toContainText('Rs. 500')
  await expect(page.getByTestId('trade-rows').locator('a')).toHaveCount(2)
  await page.getByTestId('trade-status').getByRole('button', { name: /Part paid/ }).click()
  await expect(page).toHaveURL(/status=partial/)
  await expect(page.getByTestId('trade-rows').locator('a')).toHaveCount(1)
  await expect(page.getByTestId('trade-rows')).toContainText('Ahmed')
  await expect(page.getByTestId('section-download')).toBeVisible()
  await page.screenshot({ path: 'test-results/reports-sales.png', fullPage: true })
  await page.getByTestId('trade-rows').locator('a').first().click()
  await expect(page).toHaveURL(new RegExp(`/sales/${credit.id}`))

  // purchases tab
  await page.goto('/audit/sales?preset=this_month&tab=purchases')
  await expect(page.getByTestId('trade-hero')).toContainText('Rs. 2,400')
  await expect(page.getByTestId('trade-by-party')).toContainText('Dealer')

  // staff: the owner's card with the sales
  await page.getByRole('main').getByRole('link', { name: 'Staff' }).click()
  await expect(page).toHaveURL(/\/audit\/staff/)
  await expect(page.getByTestId('staff-total')).toContainText('Rs. 2,200')
  await expect(page.getByTestId('staff-rows')).toContainText('Owner')
  await page.screenshot({ path: 'test-results/reports-staff.png', fullPage: true })

  // people counts open the people list on that kind
  await page.goto('/audit/people?preset=this_month')
  const counts = page.getByTestId('people-counts')
  await expect(counts).toContainText('Customers')
  await counts.getByRole('link', { name: /Suppliers/ }).click()
  await expect(page).toHaveURL(/\/parties\?kind=supplier/)
  await expect(page.getByText('03005556666')).toBeVisible()

  // the report center offers the new sections
  await page.goto('/audit/reports?preset=this_month')
  for (const s of ['Business insights', 'Sales', 'Purchases', 'Employee activity']) {
    await expect(page.getByTestId('full-report').getByRole('button', { name: s, exact: true })).toBeVisible()
  }

  // a failed request shows the reason and a retry, never a skeleton forever
  await page.route('**/api/v1/shop-audit/staff**', (r) => r.fulfill({ status: 500, body: 'boom' }))
  // a period not in the cache yet, so the screen really has to load it
  await page.goto('/audit/staff?preset=custom&from=2020-01-01&to=2020-01-31')
  await expect(page.getByTestId('load-error')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})
