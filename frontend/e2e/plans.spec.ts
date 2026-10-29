/** Owner (2026-10-29, selling the software): the super admin sets a shop's plan, fee and paid-until
 *  date and adds a branch; the shop owner sees the renewal notice and switches between branches.
 *  Needs 03990000099 in SUPERUSER_PHONES (backend/.env), like admin.spec. */

import { expect, test, type Page } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const isoIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)

async function login(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test('plan, fee and paid-until by the super admin; renewal notice and branches for the owner', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  await login(page, SUPER.phone, SUPER.password)
  await page.goto('/admin')

  // a customer shop, opened by the super admin
  const owner = phone()
  const shopName = `Plan Shop ${owner.slice(-4)}`
  await page.getByRole('button', { name: 'Open a new shop' }).first().click()
  await page.getByLabel('Shop name', { exact: true }).fill(shopName)
  await page.getByLabel("Owner's name").fill('Plan Owner')
  await page.getByLabel("Owner's mobile (login)").fill(owner)
  await page.getByLabel('Password for the owner').fill('owner1234')
  await page.getByRole('button', { name: 'Open a new shop' }).last().click()
  await expect(page.getByText('Shop opened')).toBeVisible({ timeout: 20_000 })
  await page.keyboard.press('Escape')

  // its row (found by search: the test database holds many shops): unlimited, no fee -> basic,
  // Rs. 2,500, paid until 3 days from now
  await page.getByPlaceholder('Search').fill(shopName)
  const row = page.getByRole('button', { name: new RegExp(shopName) }).first()
  await expect(row).toContainText('Unlimited')
  await row.click()
  await page.getByRole('button', { name: 'basic' }).click()
  await page.getByLabel('Monthly fee (Rs)').fill('2500')
  await page.getByLabel('Paid until').fill(isoIn(3))
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByText(/basic · 3 days left/).first()).toBeVisible()
  // +1 month from the current date
  await page.getByRole('button', { name: '+1 month', exact: true }).click()
  await expect(page.getByText(/basic · 3[0-4] days left/).first()).toBeVisible()
  // a branch of the same owner
  await page.getByLabel('Shop name', { exact: true }).fill(`${shopName} Branch`)
  await page.getByRole('button', { name: 'Add a branch' }).click()
  await expect(page.getByText(/2 branches/).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/admin-plan.png', fullPage: true })
  // back to 3 days so the owner sees the notice
  await page.getByLabel('Paid until').fill(isoIn(3))
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByText(/basic · 3 days left/).first()).toBeVisible()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: /Fees due/ }).click()
  await expect(page.getByRole('button', { name: new RegExp(shopName) })).toHaveCount(2)

  // the owner: renewal notice with a WhatsApp link, two shops under More, switching changes the header
  await page.evaluate(() => localStorage.clear())
  await login(page, owner, 'owner1234')
  await expect(page.getByRole('status')).toContainText('Your subscription ends in 3 days')
  await expect(page.getByRole('link', { name: 'Contact on WhatsApp' })).toHaveAttribute('href', /wa\.me\/923164001668/)
  await page.screenshot({ path: 'test-results/plan-banner.png' })
  await page.goto('/more')
  await expect(page.getByText('My shops')).toBeVisible()
  await page.getByRole('button', { name: `${shopName} Branch` }).click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('link', { name: `${shopName} Branch` })).toBeVisible()
})
