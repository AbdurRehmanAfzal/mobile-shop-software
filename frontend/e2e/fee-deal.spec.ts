/** Owner 2026-11-19 (ADR-098): the super admin gives one shop Pro at 3,000 instead of 5,000 for
 *  some months; the shop sees 5,000 crossed out and pays 3,000; and the super admin records a
 *  payment together with the package and months. Needs 03990000099 in SUPERUSER_PHONES. */

import { expect, test, type Page } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
test.setTimeout(180_000)

async function login(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview').or(page.getByText('Super admin').first())).toBeVisible({ timeout: 20_000 })
}

test('special price for one shop, and a payment recorded with its package', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const owner = phone()
  const shopName = `Deal Shop ${owner.slice(-4)}`
  const made = await request.post('/api/v1/auth/signup', { data: { shop_name: shopName, owner_name: 'Deal Owner', phone: owner, password: 'owner1234' } })
  expect(made.ok()).toBeTruthy()
  const sup = await (await request.post('/api/v1/auth/login', { data: { phone: SUPER.phone, password: SUPER.password } })).json()
  const auth = { Authorization: `Bearer ${sup.tokens.access_token}` }
  // list prices and no sale, whatever an earlier run left
  const priced = await request.put('/api/v1/admin/pricing', { headers: auth, data: { prices: { basic: 2000, pro: 5000, chain: 7500 }, module_prices: { loans: 500 }, discount_per_year: 5, max_years: 5, sale_pct: 0, addons: [] } })
  expect(priced.ok()).toBeTruthy()

  // the super admin: this shop gets Pro for 3,000 a month, for 6 months
  await login(page, SUPER.phone, SUPER.password)
  await page.goto('/admin')
  await page.getByPlaceholder('Search').fill(shopName)
  await page.getByRole('button', { name: new RegExp(shopName) }).first().click()
  const card = page.getByTestId('admin-deal')
  await card.scrollIntoViewIfNeeded()
  await card.getByTestId('deal-plan-pro').click()
  await card.getByTestId('deal-price').fill('3000')
  await card.getByTestId('deal-months').fill('6')
  await card.getByTestId('deal-note').fill('Old price, as promised')
  await card.getByTestId('deal-save').click()
  await expect(card.getByTestId('deal-now')).toContainText('Pro')
  await expect(card.getByTestId('deal-now')).toContainText('3,000')
  await expect(card.getByTestId('deal-now')).toContainText('6 months left')
  await card.screenshot({ path: 'test-results/fee-deal-admin.png' })

  // the shop: Pro shows 5,000 crossed out and 3,000, with the note; one month is 3,000
  await page.evaluate(() => localStorage.clear())
  await login(page, owner, 'owner1234')
  await page.goto('/more/fees')
  const deal = page.getByTestId('pick-deal')
  await expect(deal).toContainText('A special price for you')
  await expect(deal).toContainText('Rs. 3,000')
  await expect(deal).toContainText('Rs. 5,000')
  await expect(deal).toContainText('6 more months')
  await expect(deal).toContainText('Old price, as promised')
  await expect(page.getByTestId('pick-list-pro')).toHaveText('Rs. 5,000')
  await expect(page.getByTestId('pick-pkg-pro')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('pick-total')).toHaveText('Rs. 3,000')
  await expect(page.getByTestId('pick-saved')).toHaveText('Rs. 2,000')
  await expect(page.getByLabel('Amount (Rs)')).toHaveValue('3000')
  // a year: 6 months at 3,000, 6 at 5,000, less 5%
  await page.getByTestId('pick-term-12').click()
  await expect(page.getByTestId('pick-total')).toHaveText('Rs. 45,600')
  await expect(page.getByTestId('pick-summary')).toContainText('6 months at your special price')
  await page.screenshot({ path: 'test-results/fee-deal-shop.png', fullPage: true })

  // the customer sent the money on WhatsApp instead: the super admin records it with the package
  await page.evaluate(() => localStorage.clear())
  await login(page, SUPER.phone, SUPER.password)
  await page.goto('/admin')
  await page.getByPlaceholder('Search').fill(shopName)
  await page.getByRole('button', { name: new RegExp(shopName) }).first().click()
  const card2 = page.getByTestId('admin-deal')
  await card2.scrollIntoViewIfNeeded()
  await card2.getByTestId('order-plan-pro').click()
  await card2.getByTestId('order-mod-loans').click()
  await card2.getByTestId('order-months').fill('3')
  // (3,000 + 500) x 3
  await expect(card2.getByTestId('order-quote')).toContainText('10,500')
  await expect(card2.getByTestId('order-amount')).toHaveValue('10500')
  await card2.getByTestId('order-apply').click()
  await expect(card2.getByText(/Activated\. Receipt SUB-\d+/)).toBeVisible({ timeout: 30_000 })
  await expect(card2.getByTestId('deal-now')).toContainText('3 months left', { timeout: 30_000 })

  const me = await (await request.post('/api/v1/auth/login', { data: { phone: owner, password: 'owner1234' } })).json()
  const mine = { Authorization: `Bearer ${me.tokens.access_token}`, 'X-Shop-Id': me.me.active_shop_id }
  const fees = await (await request.get('/api/v1/fees', { headers: mine })).json()
  expect(fees.plan.plan).toBe('pro')
  expect(fees.plan.modules).toContain('loans')
  expect(Number(fees.plan.monthly_fee)).toBe(3500)
})
