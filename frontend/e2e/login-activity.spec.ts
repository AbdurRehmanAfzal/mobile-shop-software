/** Owner 2026-11-14 (ADR-074): the owner sees where the app is logged in and logs a device out —
 *  only after the super admin switches on "Login activity". Needs 03990000099 in SUPERUSER_PHONES. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('login activity: off until allowed, then see and log out a device', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const sup = await (await request.post('/api/v1/auth/login', { data: SUPER })).json()
  const hs = { Authorization: `Bearer ${sup.tokens.access_token}` }

  const ph = phone()
  const sp = phone()
  const s = await (await request.post('/api/v1/auth/signup', { data: { shop_name: 'Login Watch Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })).json()
  const h = { Authorization: `Bearer ${s.tokens.access_token}` }
  const shopId = s.me.active_shop_id
  await request.post('/api/v1/staff', { headers: h, data: { name: 'Bilal Sales', phone: sp, password: 'e2e-secret-2', role: 'salesman' } })
  // the salesman logs in somewhere else
  const sl = await (await request.post('/api/v1/auth/login', { data: { phone: sp, password: 'e2e-secret-2' } })).json()
  const hsale = { Authorization: `Bearer ${sl.tokens.access_token}` }
  expect((await request.get('/api/v1/me', { headers: hsale })).ok()).toBeTruthy()

  // the owner: no Login activity yet
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/more')
  await expect(page.getByText('Login activity')).toHaveCount(0)

  // the super admin switches it on for this shop
  const mods: string[] = (await (await request.get('/api/v1/me', { headers: h })).json()).plan.modules
  const r = await request.patch(`/api/v1/admin/shops/${shopId}/modules`, { headers: hs, data: { modules: [...mods, 'login_activity'] } })
  expect(r.ok(), await r.text()).toBeTruthy()

  // the owner's plan is read at login: log in again
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/more')
  await page.getByText('Login activity').first().click()
  await expect(page).toHaveURL(/\/more\/logins/)
  const online = page.getByTestId('logins-onlineNow')
  await expect(online).toContainText('Bilal Sales')
  await expect(online).toContainText('This device')
  await page.screenshot({ path: 'test-results/login-activity.png', fullPage: true })

  // log out the salesman's login
  const row = page.getByTestId('login-row').filter({ hasText: 'Bilal Sales' })
  await row.getByTestId('login-end').click()
  await page.getByTestId('login-end-confirm').click()
  await expect(page.getByTestId('logins-ended')).toContainText('Logged out by owner')
  const again = await request.get('/api/v1/me', { headers: hsale })
  expect(again.status()).toBe(401)
})
