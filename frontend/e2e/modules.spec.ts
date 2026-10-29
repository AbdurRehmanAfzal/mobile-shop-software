/** Owner (2026-10-29): the super admin decides a shop's modules when opening it (and later); the
 *  shop sees only what is switched on. Needs 03990000099 in SUPERUSER_PHONES. */

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

test('a basic-plan shop without repairs: no tile, a plain "not in your plan" page; switched on later', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  await login(page, SUPER.phone, SUPER.password)
  await page.goto('/admin')

  // open a shop on the basic plan, by hand: only accessories and expenses
  const owner = phone()
  const shopName = `Basic Shop ${owner.slice(-4)}`
  await page.getByRole('button', { name: 'Open a new shop' }).first().click()
  await page.getByLabel('Shop name', { exact: true }).fill(shopName)
  await page.getByLabel("Owner's name").fill('Basic Owner')
  await page.getByLabel("Owner's mobile (login)").fill(owner)
  await page.getByLabel('Password for the owner').fill('owner1234')
  await page.getByRole('button', { name: 'basic', exact: true }).click()
  await expect(page.getByText('Follow the plan (basic)')).toBeVisible()
  await expect(page.getByLabel('Repairs')).not.toBeChecked()
  await page.getByLabel('Follow the plan (basic)').uncheck()
  await page.getByLabel('Hold a sale').uncheck()
  await page.getByLabel('Tax on bills').uncheck()
  await page.screenshot({ path: 'test-results/admin-modules.png', fullPage: true })
  await page.getByRole('button', { name: 'Open a new shop' }).last().click()
  await expect(page.getByText('Shop opened')).toBeVisible({ timeout: 20_000 })

  // the owner: no Repair / Expense tiles beyond what is on, no hold or tax on a sale, a plain page for /repairs
  await page.evaluate(() => localStorage.clear())
  await login(page, owner, 'owner1234')
  await expect(page.getByRole('link', { name: /^Repair/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /^Expense/ })).toBeVisible()
  await page.goto('/repairs')
  await expect(page.getByText('This feature is not in your plan.')).toBeVisible()
  await page.screenshot({ path: 'test-results/module-off.png' })
  await page.goto('/more')
  await expect(page.getByRole('button', { name: /Repair/ })).toHaveCount(0)
  await expect(page.getByRole('button', { name: /Loans/ })).toHaveCount(0)

  // the super admin switches repairs on for this shop
  await page.evaluate(() => localStorage.clear())
  await login(page, SUPER.phone, SUPER.password)
  await page.goto('/admin')
  await page.getByPlaceholder('Search').fill(shopName)
  await page.getByRole('button', { name: new RegExp(shopName) }).first().click()
  await page.getByLabel('Repairs').check()
  await page.getByRole('button', { name: 'Save modules' }).click()
  await expect(page.getByRole('button', { name: 'Save modules' })).toBeEnabled()
  await page.evaluate(() => localStorage.clear())
  await login(page, owner, 'owner1234')
  await expect(page.getByRole('link', { name: /^Repair/ })).toBeVisible()
})
