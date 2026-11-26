/** ADR-134 / ADR-115: the provider's control room in the new product, at /control/new, drawn from
 *  file 26 (shops & plans, business overview, subscription ledger, license keys, the SaaS ledger A4).
 *  Its figures and actions are the live provider console's.
 *  Needs 03990000099 in SUPERUSER_PHONES (as the live control-room tests). */

import { expect, test } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
test.setTimeout(180_000)

test('new product: control room — back after login, overview, a shop and its deployment, a key made and cancelled, not for a shop', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const owner = phone()
  const shopName = `Control Naya ${owner.slice(-4)}`
  await request.post('/api/v1/auth/signup', { data: { shop_name: shopName, owner_name: 'Shop Owner', phone: owner, password: 'e2e-secret-1' } })
  const login = await (await request.post('/api/v1/auth/login', { data: { phone: SUPER.phone, password: SUPER.password } })).json()
  const h = { Authorization: `Bearer ${login.tokens?.access_token ?? login.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()

  // not logged in: to the login, and back here after it
  await page.goto('/control/new')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Mobile number').fill(SUPER.phone.slice(1))
  await page.getByLabel('Password').fill(SUPER.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).toHaveURL(/\/control\/new$/, { timeout: 30_000 })
  await expect(page.getByTestId('nctl')).toBeVisible()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toHaveCount(0) // no shop counter here
  await expect(page.getByTestId('nctl-super')).toBeVisible()
  await expect(page.getByTestId('nctl-manage')).toBeVisible() // shops & plans opens first, as file 26
  await expect(page.getByTestId('nctl-app')).toContainText('/app.apk')

  // overview: the console's own figures
  await page.getByTestId('nctl-tab-overview').click()
  await expect(page).toHaveURL(/tab=overview/)
  const ov = await get('/admin/business/overview')
  await expect(page.getByTestId('nctl-mrr')).toContainText(Math.round(Number(ov.mrr)).toLocaleString('en-US'))
  await expect(page.getByTestId('nctl-monthly')).toBeVisible()
  await page.screenshot({ path: 'test-results/newui-control.png', fullPage: true })

  // shops: find the new shop, open its window, switch where it runs (its ledger tab)
  await page.getByTestId('nctl-tab-shops').click()
  await expect(page).toHaveURL(/tab=shops/)
  await page.getByTestId('nctl-m-q').fill(shopName)
  await expect(page.getByTestId('nctl-m-shop')).toHaveCount(1)
  await page.getByTestId('nctl-m-shop').click()
  await expect(page).toHaveURL(/shop=/)
  await expect(page.getByTestId('nctl-m-panel')).toContainText(shopName)
  await page.getByTestId('nctl-dt-ledger').click()
  await page.getByTestId('nctl-dep-local').click()
  await expect.poll(async () => (await get(`/admin/business/shops?q=${encodeURIComponent(shopName)}`))[0].deployment).toBe('local')
  await page.getByTestId('nctl-dep-cloud').click()
  await expect.poll(async () => (await get(`/admin/business/shops?q=${encodeURIComponent(shopName)}`))[0].deployment).toBe('cloud')

  // a key for that shop from its window (password, PIN & branches), then cancelled with a reason
  await page.getByTestId('nctl-dt-security').click()
  await page.getByTestId('nctl-shop-make').click()
  await page.getByTestId('nctl-months-3').click()
  await page.getByTestId('nctl-make-save').click()
  await expect(page.getByTestId('nctl-m-panel').getByTestId('nctl-key-status').first()).toHaveText('Not used')
  await page.getByTestId('nctl-drawer-close').click()
  await expect(page.getByTestId('nctl-drawer')).toHaveCount(0)
  await page.getByTestId('nctl-tab-keys').click()
  const keyCard = page.getByTestId('nctl-key').filter({ hasText: shopName }).first()
  await expect(keyCard).toBeVisible()
  await keyCard.getByTestId('nctl-key-revoke').click()
  await keyCard.getByTestId('nctl-key-why').fill('made by mistake')
  await keyCard.getByTestId('nctl-key-revoke-yes').click()
  await expect(keyCard.getByTestId('nctl-key-status')).toHaveText('Cancelled')
  const shop = (await get(`/admin/business/shops?q=${encodeURIComponent(shopName)}`))[0]
  const keys = await get(`/admin/business/keys?shop_id=${shop.shop_id}`)
  expect(keys[0].status).toBe('revoked')
  expect(keys[0].months).toBe(3)

  // payments: the approved total is the console's
  await page.getByTestId('nctl-tab-payments').click()
  const pays = await get('/admin/business/payments')
  await expect(page.getByTestId('nctl-approved')).toContainText(Math.round(Number(pays.approved_total)).toLocaleString('en-US'))

  // the SaaS ledger as an A4 sheet: every row and the console's own total
  await page.getByTestId('nctl-a4-open').click()
  await expect(page.getByTestId('nctl-a4-total')).toContainText(Math.round(Number(pays.approved_total)).toLocaleString('en-US'))
  await expect(page.getByTestId('nctl-a4-row')).toHaveCount(pays.rows.length)
  await page.getByTestId('nctl-a4').getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('nctl-a4')).toHaveCount(0)

  // Urdu: one language, right to left
  await page.getByTestId('nctl-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-control-ur.png', fullPage: true })

  // a shop's login is told it is not for him
  await page.getByTestId('nctl-logout').click()
  await page.evaluate(() => localStorage.setItem('locale', 'en'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(owner.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
  await page.goto('/control/new')
  await expect(page.getByTestId('nctl-denied')).toBeVisible()
  await expect(page.getByTestId('nctl-tabs')).toHaveCount(0)
})
