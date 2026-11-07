/** Owner 2026-11-07: the header's "Messages" button opened a long settings form with the messages
 *  hidden at the bottom, and a salesman saw an endless loader. Now Messages comes first; the owner
 *  also gets a Settings tab, staff see only the messages. */

import { expect, test } from '@playwright/test'

test('messages button: messages first, settings tab for the owner, staff see messages', async ({ page, request }) => {
  const phone = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await (await request.post('/api/v1/auth/signup', { data: { shop_name: 'Msg Shop', owner_name: 'Imran Ali', phone, password: 'e2e-secret-1' } })).json()
  const h = { Authorization: `Bearer ${s.tokens.access_token}`, 'X-Shop-Id': s.me.active_shop_id ?? s.me.shops[0].id }
  const staffPhone = `038${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const st = await request.post('/api/v1/staff', { headers: h, data: { name: 'Bilal Salesman', phone: staffPhone, password: 'e2e-secret-2', role: 'salesman' } })
  expect(st.status()).toBeLessThan(300)

  await page.setViewportSize({ width: 1280, height: 720 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const login = async (p: string, pw: string) => {
    await page.goto('/login')
    await page.getByLabel('Mobile number').fill(p.slice(1))
    await page.getByLabel('Password').fill(pw)
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  }

  await login(phone, 'e2e-secret-1')
  await page.getByRole('button', { name: 'Messages' }).click()
  await expect(page.getByTestId('notif-messages')).toBeVisible()
  await expect(page.getByTestId('notif-tabs')).toBeVisible()
  await page.getByTestId('notif-tabs').getByRole('button', { name: 'Settings' }).click()
  await expect(page.getByTestId('notif-settings')).toBeVisible()
  await expect(page.getByLabel('Owner WhatsApp number')).toBeVisible()
  await page.getByTestId('profile-button').click()
  await page.getByTestId('profile-logout').click()

  await login(staffPhone, 'e2e-secret-2')
  await page.getByRole('button', { name: 'Messages' }).click()
  await expect(page.getByTestId('notif-messages')).toBeVisible()
  await expect(page.getByTestId('notif-tabs')).toHaveCount(0)
})
