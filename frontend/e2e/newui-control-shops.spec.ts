/** ADR-134 / ADR-115: the control room's shops & plans in the new product (/control/new), drawn from
 *  file 26 — the customer shops and a shop's window with its four tabs. Every action is the live
 *  control room's. Needs 03990000099 in SUPERUSER_PHONES (as the live control-room tests). */

import { expect, test } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
test.setTimeout(300_000)

test('new product: shops & plans — open a shop, fee and time, what it trades, a payment, special price, fee later, password and PIN, a key, a branch, delete and restore, settings', async ({ page, request }) => {
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
  const panel = page.getByTestId('nctl-m-panel')

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(SUPER.phone.slice(1))
  await page.getByLabel('Password').fill(SUPER.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
  // the old address of the manage tab still opens shops & plans
  await page.goto('/control/new?tab=manage')
  await expect(page.getByTestId('nctl-manage')).toBeVisible()
  await expect(page.getByTestId('nctl-app')).toBeVisible()
  await expect(page.getByTestId('nctl-fees')).toBeVisible()
  const stats = await get('/admin/fee-stats')
  await expect(page.getByTestId('nctl-fees-month')).toContainText(Math.round(Number(stats.month_total)).toLocaleString('en-US'))

  // open a new shop with the owner's login and a monthly fee
  await page.getByTestId('nctl-new-shop').click()
  await page.getByTestId('nctl-n-shop').fill(shopName)
  await page.getByTestId('nctl-n-owner').fill('Naya Owner')
  await page.getByTestId('nctl-new-drawer').getByRole('textbox').nth(3).fill(owner.slice(1))
  await page.getByTestId('nctl-n-fee').fill('2000')
  const pw = await page.getByTestId('nctl-n-pw').inputValue()
  expect(pw.length).toBeGreaterThanOrEqual(6)
  await page.getByTestId('nctl-n-save').click()
  await expect(page.getByTestId('nctl-made')).toContainText(shopName, { timeout: 30_000 })
  await expect(page.getByTestId('nctl-made-pw')).toHaveText(pw)
  await page.getByTestId('nctl-new-drawer').getByRole('button', { name: 'Close' }).click()
  expect((await request.post('/api/v1/auth/login', { data: { phone: owner, password: pw } })).ok()).toBeTruthy()
  expect(Number((await find()).monthly_fee)).toBe(2000)
  // the new shop's window is open; close it and find the shop in the list
  await expect(panel).toContainText(shopName)
  await page.getByTestId('nctl-drawer-close').click()
  await page.getByTestId('nctl-m-q').fill(shopName)
  await expect(page.getByTestId('nctl-m-shop')).toHaveCount(1)
  await page.getByTestId('nctl-p-pro').click()
  await expect(page.getByTestId('nctl-m-shop')).toHaveCount(0) // a trial shop is not in the pro filter
  await page.getByTestId('nctl-p-trial').click()
  await expect(page.getByTestId('nctl-m-shop')).toHaveCount(1)
  await page.getByTestId('nctl-m-shop').click()
  await expect(panel).toContainText(shopName)
  await page.screenshot({ path: 'test-results/newui-control-shops.png', fullPage: true })

  // what it trades: accessories on as well (the window opens on trade & modules, as file 26)
  await page.getByTestId('nctl-trade-accessories').check()
  await page.getByTestId('nctl-save-mods').click()
  await expect.poll(async () => (await find()).modules).toContain('accessories')

  // package, fee and time: basic at 2,500, three more months
  await page.getByTestId('nctl-dt-billing').click()
  await page.getByTestId('nctl-plan-basic').click()
  await page.getByTestId('nctl-fee-input').fill('2500')
  await page.getByTestId('nctl-save-plan').click()
  await expect.poll(async () => Number((await find()).monthly_fee)).toBe(2500)
  await page.getByTestId('nctl-extend-3').click()
  await expect.poll(async () => (await find()).plan_expires_at).toBeTruthy()
  expect((await find()).plan).toBe('basic')

  // a payment taken in hand, filled from the fee
  await expect(page.getByTestId('nctl-pay-amount')).toHaveValue('2500')
  await page.getByTestId('nctl-record').click()
  await expect(page.getByTestId('nctl-receipt')).toBeVisible()

  // a special price, then taken off
  await page.getByTestId('nctl-deal-plan-pro').click()
  await page.getByTestId('nctl-deal-price').fill('3000')
  await page.getByTestId('nctl-deal-months').fill('3')
  await page.getByTestId('nctl-deal-save').click()
  await expect.poll(async () => Number((await find()).fee_deal?.price ?? 0)).toBe(3000)
  await expect(page.getByTestId('nctl-deal-now')).toBeVisible()
  await page.getByTestId('nctl-deal-remove').click()
  await expect.poll(async () => (await find()).fee_deal ?? null).toBeNull()

  // the package now, the fee later
  await page.getByTestId('nctl-credit-give').click()
  await expect(page.getByTestId('nctl-credit-given')).toBeVisible()
  await expect(page.getByTestId('nctl-dues')).toBeVisible()
  await expect.poll(async () => Number((await find()).fee_due)).toBeGreaterThan(0)

  // the owner's new password and quick PIN — shown only once to send, the history says only "changed"
  await page.getByTestId('nctl-dt-security').click()
  await page.getByTestId('nctl-pw').fill('naya-pass-77')
  await page.getByTestId('nctl-pw-save').click()
  await expect(page.getByTestId('nctl-pw-done')).toContainText('naya-pass-77')
  expect((await request.post('/api/v1/auth/login', { data: { phone: owner, password: 'naya-pass-77' } })).ok()).toBeTruthy()
  await page.getByTestId('nctl-pin').fill('4321')
  await page.getByTestId('nctl-pin-save').click()
  await expect(page.getByTestId('nctl-pin-done')).toBeVisible()

  // a renewal key with its 7-day link, and a branch
  await page.getByTestId('nctl-shop-make').click()
  await page.getByTestId('nctl-make-save').click()
  await expect(panel.getByTestId('nctl-key-code').first()).not.toBeEmpty()
  await page.getByTestId('nctl-branch-name').fill(`${shopName} Two`)
  await page.getByTestId('nctl-branch-save').click()
  await expect.poll(async () => (await find()).branches).toBe(2)

  // the shop's ledger: its payment and the password / PIN history (never the password itself)
  await page.getByTestId('nctl-dt-ledger').click()
  await expect(page.getByTestId('nctl-shop-pays').getByTestId('nctl-pay').first()).toBeVisible()
  await expect(page.getByTestId('nctl-cred')).not.toHaveCount(0)
  await expect(page.getByTestId('nctl-cred-list')).not.toContainText('naya-pass-77')
  await expect(page.getByTestId('nctl-cred-list')).not.toContainText('4321')

  // delete (the name typed to confirm), then bring it back
  await page.getByTestId('nctl-dt-security').click()
  await page.getByTestId('nctl-delete').click()
  await expect(page.getByTestId('nctl-bin-delete')).toBeDisabled()
  await page.getByTestId('nctl-bin-confirm').fill(shopName)
  await page.getByTestId('nctl-bin-delete').click()
  await expect(page.getByTestId('nctl-in-bin')).toBeVisible()
  await expect.poll(async () => (await find()) ?? null).toBeNull()
  await page.getByTestId('nctl-restore-one').click()
  await expect(page.getByTestId('nctl-dt-modules')).toBeVisible()
  await expect.poll(async () => (await find())?.name).toBe(shopName)
  await page.getByTestId('nctl-drawer-close').click()

  // the provider's payment accounts: one added, then put back as it was
  await page.getByTestId('nctl-accounts-open').click()
  await page.getByTestId('nctl-acct-add').click()
  await page.getByTestId('nctl-acct-label').last().fill('Test Bank')
  await page.getByTestId('nctl-acct-number').last().fill('0000-111222')
  await page.getByTestId('nctl-acct-save').click()
  await expect(page.getByTestId('nctl-accounts')).toHaveCount(0)
  expect((await get('/admin/payment-accounts')).some((a: { label: string }) => a.label === 'Test Bank')).toBe(true)
  await request.put('/api/v1/admin/payment-accounts', { headers: h, data: accountsBefore })

  // website prices and billing settings open with the server's values (closed without saving)
  const pricing = await get('/admin/pricing')
  await page.getByTestId('nctl-prices-open').click()
  await expect(page.getByTestId('nctl-price-basic')).toBeVisible()
  expect(Number(await page.getByTestId('nctl-price-basic').inputValue())).toBe(Number(pricing.prices.basic))
  await page.getByTestId('nctl-prices').getByRole('button', { name: 'Close' }).click()
  await page.getByTestId('nctl-billing-open').click()
  await expect(page.getByTestId('nctl-bill-grace_days')).toBeVisible()
  await page.getByTestId('nctl-billing').getByRole('button', { name: 'Close' }).click()

  // the fee-unpaid filter shows the shop given the package on credit
  await page.getByTestId('nctl-f-unpaid').click()
  await page.getByTestId('nctl-p-all').click()
  await expect(page.getByTestId('nctl-m-shop').filter({ hasText: shopName })).toHaveCount(1)

  // Urdu: one language, right to left; and a phone's width
  await page.getByTestId('nctl-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-control-shops-ur.png', fullPage: true })
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(page.getByTestId('nctl-m-shop').first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true)
})
