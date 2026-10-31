/** Shop Audit → Security (docs/17 P8): the owner's feed with kinds, filters and per-employee flags;
 *  a manager does not get the section. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('security feed for the owner; hidden from a manager', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const owner = phone()
  const manager = phone() // user phones are unique across shops: never a fixed number
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Secure Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(owner)
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
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, devices: ['490154203237518', '356938035643809', '352099001761481'].map((i) => ({ device: dev(i), cost: 800, asking_price: 1000 })), paid: 2400 })
  const [a, b, c] = pur.lines.map((l: { device_id: string }) => l.device_id)
  await post('/sales', { devices: [{ device_id: a, price: 900, new_asking_price: 950, asking_reason: 'market' }], paid: 900 })
  await post('/sales', { devices: [{ device_id: b, price: 1000 }], discount: 100, paid: 900 })
  const v = await post('/sales', { devices: [{ device_id: c, price: 1000 }], paid: 1000 })
  await post(`/sales/${v.id}/void`, { reason: 'typed twice' })
  await post('/staff', { name: 'Mina', phone: manager, password: 'secret123', role: 'manager' })

  await page.goto('/audit/security?preset=this_month')
  const kinds = page.getByTestId('sec-kinds')
  await expect(kinds).toContainText('Asking changed · 1')
  await expect(kinds).toContainText('Sold under asking · 1')
  await expect(kinds).toContainText('Discount · 1')
  await expect(kinds).toContainText('Voided · 1')
  await expect(page.getByTestId('sec-users')).toContainText('Owner')
  const rows = page.getByTestId('sec-rows')
  await expect(rows).toContainText('market')
  await expect(rows).toContainText('typed twice')
  await expect(rows).toContainText('1,000 → 950')
  await kinds.getByRole('button', { name: /^Voided/ }).click()
  await expect(page).toHaveURL(/kind=void/)
  await expect(rows.locator('a, div.flex.items-center.gap-3.px-4')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/audit-security.png', fullPage: true })

  // a manager: the section chip is not offered and the page says owner only
  await page.evaluate(() => localStorage.removeItem('mobileshop.auth'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(manager)
  await page.getByLabel('Password').fill('secret123')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/audit')
  await expect(page.getByRole('main').getByRole('link', { name: 'Finance' })).toBeVisible()
  await expect(page.getByRole('main').getByRole('link', { name: 'Security' })).toHaveCount(0)
  await page.goto('/audit/security')
  await expect(page.getByText('The security audit is for the owner only.')).toBeVisible()
})
