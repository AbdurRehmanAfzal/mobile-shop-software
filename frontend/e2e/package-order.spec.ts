/** Owner 2026-11-17 (ADR-095): on the fees page the shop picks a package, an extra module and for
 *  how long (5% off for every year); the total is the server's; the super admin sees the order and
 *  approving it changes the shop's package. Needs 03990000099 in SUPERUSER_PHONES. */

import { expect, test, type Page } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
test.setTimeout(120_000)

async function login(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test('package, module and years chosen on the fees page; approved -> the shop gets them', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const owner = phone()
  const shopName = `Order Shop ${owner.slice(-4)}`
  const made = await request.post('/api/v1/auth/signup', { data: { shop_name: shopName, owner_name: 'Order Owner', phone: owner, password: 'owner1234' } })
  expect(made.ok()).toBeTruthy()
  // the provider's list prices, whatever an earlier run left
  const sup = await (await request.post('/api/v1/auth/login', { data: { phone: SUPER.phone, password: SUPER.password } })).json()
  const auth = { Authorization: `Bearer ${sup.tokens.access_token}` }
  const priced = await request.put('/api/v1/admin/pricing', { headers: auth, data: { prices: { basic: 2000, pro: 5000, chain: 7500 }, module_prices: { repairs: 500 }, discount_per_year: 5, max_years: 5, addons: [] } })
  expect(priced.ok()).toBeTruthy()

  await login(page, owner, 'owner1234')
  await page.goto('/more/fees')
  // the three packages with their fee; a new shop is on trial, so the first package is offered
  await expect(page.getByTestId('pick-pkg-basic')).toContainText('2,000')
  await expect(page.getByTestId('pick-pkg-pro')).toContainText('5,000')
  await expect(page.getByTestId('pick-pkg-chain')).toContainText('7,500')
  await expect(page.getByTestId('pick-total')).toHaveText('Rs. 2,000')
  // Pro for 5 years: 5,000 x 60 = 300,000 less 25%
  await page.getByTestId('pick-pkg-pro').click()
  await expect(page.getByTestId('pick-included')).toContainText('Repairs')
  await page.getByTestId('pick-term-60').click()
  await expect(page.getByTestId('pick-term-60')).toContainText('25% off')
  await expect(page.getByTestId('pick-discount')).toHaveText('− Rs. 75,000')
  await expect(page.getByTestId('pick-total')).toHaveText('Rs. 225,000')
  // Basic with Repairs added, one year: (2,000 + 500) x 12 less 5%
  await page.getByTestId('pick-pkg-basic').click()
  await page.getByTestId('pick-mod-repairs').click()
  await page.getByTestId('pick-term-12').click()
  await expect(page.getByTestId('pick-total')).toHaveText('Rs. 28,500')
  await expect(page.getByLabel('Amount (Rs)')).toHaveValue('28500')
  await page.screenshot({ path: 'test-results/package-order.png', fullPage: true })
  const ref = `ORD ${owner.slice(-6)}`
  await page.getByLabel('Transaction ID / reference').fill(ref)
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText('Thank you. The software provider will check it and extend your plan.')).toBeVisible()
  // nothing changes before the provider confirms: Repairs is still off
  const me = await (await request.post('/api/v1/auth/login', { data: { phone: owner, password: 'owner1234' } })).json()
  const mine = { Authorization: `Bearer ${me.tokens.access_token}`, 'X-Shop-Id': me.me.active_shop_id }
  expect((await request.get('/api/v1/repairs', { headers: mine })).status()).toBe(200) // trial has every module
  const before = await (await request.get('/api/v1/fees', { headers: mine })).json()
  expect(before.plan.plan).toBe('trial')

  // the super admin sees what was chosen and approves it
  await page.evaluate(() => localStorage.clear())
  await login(page, SUPER.phone, SUPER.password)
  await page.goto('/admin')
  const row = page.locator('div').filter({ hasText: ref }).filter({ has: page.getByTestId('fee-order') }).last()
  await expect(row.getByTestId('fee-order')).toContainText('Basic + Repairs · 1 year · 5% off')
  await expect(row.getByTestId('fee-order')).toContainText('28,500')
  await page.screenshot({ path: 'test-results/package-order-admin.png', fullPage: true })
  await row.getByRole('button', { name: /Received/ }).click()
  await expect(page.getByText(ref)).toHaveCount(0)

  const after = await (await request.get('/api/v1/fees', { headers: mine })).json()
  expect(after.plan.plan).toBe('basic')
  expect(after.plan.modules).toContain('repairs')
  expect(Number(after.plan.monthly_fee)).toBe(2500)
  expect(after.plan.days_left).toBeGreaterThan(360)
})
