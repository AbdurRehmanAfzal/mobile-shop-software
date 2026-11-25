/** ADR-134 / ADR-115: the control room's shop management in the new product (/control/new?tab=manage)
 *  — no file draws it, so it is drawn like file 10. Every action is the live control room's.
 *  Needs 03990000099 in SUPERUSER_PHONES (as the live control-room tests). */

import { expect, test } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
test.setTimeout(240_000)

test('new product: manage shops — open a shop, fee and time, what it trades, a payment, its password, a renewal code, a branch, a payment account', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const login = await (await request.post('/api/v1/auth/login', { data: { phone: SUPER.phone, password: SUPER.password } })).json()
  const h = { Authorization: `Bearer ${login.tokens?.access_token ?? login.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const accountsBefore = await get('/admin/payment-accounts')
  const owner = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const shopName = `Managed Naya ${owner.slice(-4)}`
  const find = async () => (await get(`/admin/shops?q=${encodeURIComponent(shopName)}`))[0]

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(SUPER.phone.slice(1))
  await page.getByLabel('Password').fill(SUPER.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
  await page.goto('/control/new?tab=manage')
  await expect(page.getByTestId('nctl-manage')).toBeVisible()
  await expect(page.getByTestId('nctl-fees')).toBeVisible()
  await expect(page.getByTestId('nctl-requests')).toBeVisible()

  // open a new shop with the owner's login
  await page.getByTestId('nctl-new-shop').click()
  await page.getByTestId('nctl-n-shop').fill(shopName)
  await page.getByTestId('nctl-n-owner').fill('Naya Owner')
  await page.getByTestId('nctl-new-drawer').getByRole('textbox').nth(3).fill(owner.slice(1))
  const pw = await page.getByTestId('nctl-n-pw').inputValue()
  expect(pw.length).toBeGreaterThanOrEqual(6)
  await page.getByTestId('nctl-n-save').click()
  await expect(page.getByTestId('nctl-made')).toContainText(shopName, { timeout: 30_000 })
  await expect(page.getByTestId('nctl-made-pw')).toHaveText(pw)
  await page.getByTestId('nctl-new-drawer').getByRole('button', { name: 'Close' }).click()
  expect((await request.post('/api/v1/auth/login', { data: { phone: owner, password: pw } })).ok()).toBeTruthy()

  await page.getByTestId('nctl-m-q').fill(shopName)
  await expect(page.getByTestId('nctl-m-shop')).toHaveCount(1)
  await expect(page.getByTestId('nctl-m-panel')).toContainText(shopName)
  await page.screenshot({ path: 'test-results/newui-control-shops.png', fullPage: true })

  // package, fee and time: basic at 2,500, three more months
  await page.getByTestId('nctl-plan-basic').click()
  await page.getByTestId('nctl-fee-input').fill('2500')
  await page.getByTestId('nctl-save-plan').click()
  await expect.poll(async () => (await find()).monthly_fee).toBe('2500.00')
  await page.getByTestId('nctl-extend-3').click()
  await expect.poll(async () => (await find()).plan_expires_at).toBeTruthy()
  expect((await find()).plan).toBe('basic')

  // what it trades: accessories on as well
  await page.getByTestId('nctl-sec-mods-open').click()
  await page.getByTestId('nctl-trade-accessories').check()
  await page.getByTestId('nctl-save-mods').click()
  await expect.poll(async () => (await find()).modules).toContain('accessories')

  // a payment taken in hand
  await page.getByTestId('nctl-sec-pay-open').click()
  await expect(page.getByTestId('nctl-pay-amount')).toHaveValue('2500')
  await page.getByTestId('nctl-record').click()
  await expect(page.getByTestId('nctl-receipt')).toBeVisible()

  // the owner's new password
  await page.getByTestId('nctl-sec-pw-open').click()
  await page.getByTestId('nctl-pw').fill('naya-pass-77')
  await page.getByTestId('nctl-pw-save').click()
  await expect(page.getByTestId('nctl-pw-done')).toContainText('naya-pass-77')
  expect((await request.post('/api/v1/auth/login', { data: { phone: owner, password: 'naya-pass-77' } })).ok()).toBeTruthy()

  // a renewal code and a branch
  await page.getByTestId('nctl-sec-code-open').click()
  await page.getByTestId('nctl-code').click()
  await expect(page.getByTestId('nctl-code-out')).not.toBeEmpty()
  await page.getByTestId('nctl-sec-branch-open').click()
  await page.getByTestId('nctl-branch-name').fill(`${shopName} Two`)
  await page.getByTestId('nctl-branch-save').click()
  await expect.poll(async () => (await find()).branches).toBe(2)

  // the provider's payment accounts: one added, then put back as it was
  await page.getByTestId('nctl-accounts-open').click()
  await page.getByTestId('nctl-acct-add').click()
  await page.getByTestId('nctl-acct-label').last().fill('Test Bank')
  await page.getByTestId('nctl-acct-number').last().fill('0000-111222')
  await page.getByTestId('nctl-acct-save').click()
  await expect(page.getByTestId('nctl-accounts')).toHaveCount(0)
  expect((await get('/admin/payment-accounts')).some((a: { label: string }) => a.label === 'Test Bank')).toBe(true)
  await request.put('/api/v1/admin/payment-accounts', { headers: h, data: accountsBefore })

  // Urdu: one language, right to left
  await page.getByTestId('nctl-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-control-shops-ur.png', fullPage: true })
})
