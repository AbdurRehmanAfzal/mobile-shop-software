/** Login page without "create a shop", the maker's footer, and the super admin opening a shop.
 *  Needs 03990000099 in SUPERUSER_PHONES (backend/.env) for the super admin part. */

import { expect, test } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
})

test('login page: no create-shop button, maker footer', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByRole('button', { name: 'Login' })).toBeVisible()
  await expect(page.getByText(/Create a new shop|Create shop/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: /oopsolutions\.com/ })).toHaveAttribute('href', 'https://oopsolutions.com')
  await expect(page.getByText(/Abdur Rehman Afzal/)).toBeVisible()
  await expect(page.getByRole('link', { name: /Abdur Rehman Afzal/ })).toHaveAttribute('href', 'tel:+923164001668')
  await page.screenshot({ path: 'test-results/login.png', fullPage: true })
  await page.getByRole('button', { name: 'اردو' }).click()
  await page.screenshot({ path: 'test-results/login-ur.png', fullPage: true })
})

test('super admin opens a shop for a customer', async ({ page, request }) => {
  // the test super user exists once; later runs just log in
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(SUPER.phone)
  await page.getByLabel('Password').fill(SUPER.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/more')
  await page.getByRole('button', { name: /Super admin/ }).click()
  await expect(page).toHaveURL(/\/admin$/)
  await page.getByRole('button', { name: 'Open a new shop' }).first().click()
  const owner = phone()
  await page.getByLabel('Shop name', { exact: true }).fill('Bilal Mobiles')
  await page.getByLabel('City').fill('Lahore')
  await page.getByLabel("Owner's name").fill('Bilal')
  await page.getByLabel("Owner's mobile (login)").fill(owner)
  await page.getByLabel('Password for the owner').fill('bilal1234')
  await page.getByRole('button', { name: 'Open a new shop' }).last().click()
  await expect(page.getByText('Shop opened')).toBeVisible()
  await expect(page.getByText(owner).first()).toBeVisible()
  await expect(page.getByRole('link', { name: 'Send on WhatsApp' })).toHaveAttribute('href', /wa\.me\/92/)
  await page.screenshot({ path: 'test-results/admin-created.png', fullPage: true })

  // an ordinary owner has no super admin
  await page.evaluate(() => localStorage.clear())
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(owner)
  await page.getByLabel('Password').fill('bilal1234')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/more')
  await expect(page.getByRole('button', { name: /Super admin/ })).toHaveCount(0)
})
