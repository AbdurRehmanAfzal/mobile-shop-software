/** Owner 2026-11-10: a new person can be saved without a mobile number. */

import { expect, test } from '@playwright/test'

test.setTimeout(90_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('new person without a mobile number', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'No Phone Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto('/parties')
  await page.getByRole('button', { name: 'New person' }).first().click()
  await expect(page.getByLabel('Mobile number (optional)')).toBeVisible()
  await page.getByLabel('Name', { exact: true }).fill('Walk In Kamran')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Walk In Kamran').first()).toBeVisible()

  const list = await (await request.get('/api/v1/parties?q=Kamran', { headers: h })).json()
  expect(list[0].name).toBe('Walk In Kamran')
  expect(list[0].phone).toBeNull()
})
