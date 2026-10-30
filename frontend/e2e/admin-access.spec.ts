/** Owner (2026-10-29): "forgot password" from the login page reaches the super admin, who sets a new
 *  password and can open any customer shop. Needs 03990000099 in SUPERUSER_PHONES (backend/.env). */

import { expect, test, type Page } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function login(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test('forgot password → super admin sets a new one and opens the shop', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const owner = phone()
  const shopName = `Forgot Shop ${owner.slice(-4)}`
  const made = await request.post('/api/v1/auth/signup', { data: { shop_name: shopName, owner_name: 'Hamza Iqbal', phone: owner, password: 'owner1234' } })
  expect(made.ok()).toBeTruthy()

  // the owner forgot the password
  await page.goto('/login')
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await page.getByLabel('Mobile number').last().fill(owner)
  // no WhatsApp sender on this box: the request path, as before
  await page.getByRole('button', { name: /Ask the owner \/ provider to reset it/ }).click()
  await expect(page.getByText('Request sent to the software provider')).toBeVisible()
  await page.screenshot({ path: 'test-results/forgot-password.png' })
  await page.keyboard.press('Escape')

  // the super admin sees the request, sets a new password, sends it, and can open the shop
  await login(page, SUPER.phone, SUPER.password)
  await page.goto('/admin')
  await expect(page.getByText('Password requests')).toBeVisible()
  const row = page.locator('div', { hasText: new RegExp(`^Hamza Iqbal · ${shopName}`) }).first()
  await expect(page.getByText(`Hamza Iqbal · ${shopName}`)).toBeVisible()
  await page.getByPlaceholder('Search').fill(shopName)
  await page.getByRole('button', { name: new RegExp(shopName) }).first().click()
  await page.getByLabel('Password for the owner').fill('newpass123')
  await page.getByRole('button', { name: 'Save', exact: true }).first().click()
  await expect(page.getByText('Password changed. Send it to the owner:')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Send on WhatsApp' })).toHaveAttribute('href', new RegExp(`wa\\.me/92${owner.slice(1)}`))
  await page.screenshot({ path: 'test-results/admin-password.png', fullPage: true })
  await page.getByRole('button', { name: 'Open this shop' }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: shopName })).toBeVisible()
  void row

  // the request is closed; the owner logs in with the new password
  await page.goto('/admin')
  await expect(page.getByText(`Hamza Iqbal · ${shopName}`)).toHaveCount(0)
  await page.evaluate(() => localStorage.clear())
  await login(page, owner, 'newpass123')
})
