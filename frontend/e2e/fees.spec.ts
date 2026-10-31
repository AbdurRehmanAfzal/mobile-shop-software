/** Owner (2026-10-29): software fees paid by hand into the product owner's accounts, reported by the
 *  shop owner, approved by the super admin. Needs 03990000099 in SUPERUSER_PHONES. */

import { expect, test, type Page } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
test.setTimeout(120_000)

async function login(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test('accounts entered by the super admin; the shop reports a payment; approved -> plan extended', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const owner = phone()
  const shopName = `Fee Shop ${owner.slice(-4)}`
  const made = await request.post('/api/v1/auth/signup', { data: { shop_name: shopName, owner_name: 'Fee Owner', phone: owner, password: 'owner1234' } })
  expect(made.ok()).toBeTruthy()

  // the super admin lists a payment account (made-up test number) and puts the shop on basic, Rs. 2,500, due in 3 days
  await login(page, SUPER.phone, SUPER.password)
  await page.goto('/admin')
  await page.getByRole('button', { name: 'Payment accounts' }).click()
  // earlier runs may have left accounts: start from an empty list
  while (await page.getByRole('button', { name: 'Delete' }).count()) await page.getByRole('button', { name: 'Delete' }).first().click()
  await page.getByRole('button', { name: 'Add an account' }).click()
  await page.getByLabel('Name (e.g. Easypaisa)').fill('Easypaisa')
  await page.getByLabel('Account holder').fill('Test Holder')
  await page.getByLabel('Number / IBAN').fill('03001234567')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByPlaceholder('Search').fill(shopName)
  await page.getByRole('button', { name: new RegExp(shopName) }).first().click()
  await page.getByRole('button', { name: 'basic', exact: true }).click()
  await page.getByLabel('Monthly fee (Rs)').fill('2500')
  await page.getByLabel('Paid until').fill(new Date(Date.now() + 3 * 86_400_000).toISOString().slice(0, 10))
  await page.getByRole('button', { name: 'Save plan' }).click()
  await expect(page.getByText(/basic · 3 days left/).first()).toBeVisible()
  await page.keyboard.press('Escape')

  // the owner: the notice leads to the fees screen; accounts, copy, report with a reference
  await page.evaluate(() => localStorage.clear())
  await login(page, owner, 'owner1234')
  // 3 days left: the reminder popup opens on login; its Pay button leads to the fees screen
  await expect(page.getByTestId('plan-popup')).toBeVisible()
  await page.getByTestId('plan-pay').click()
  await expect(page).toHaveURL(/\/more\/fees$/)
  await expect(page.getByText('Easypaisa · Test Holder').first()).toBeVisible()
  await expect(page.getByText('03001234567').first()).toBeVisible()
  await expect(page.getByLabel('Amount (Rs)')).toHaveValue('2500')
  const ref = `TID ${owner.slice(-6)}` // unique per run: earlier runs' payments may still be pending
  await page.getByLabel('Transaction ID / reference').fill(ref)
  await page.screenshot({ path: 'test-results/fees-owner.png', fullPage: true })
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText(/Thank you. The software provider will check it/)).toBeVisible()
  await expect(page.getByText('Being checked')).toBeVisible()

  // the super admin sees it, approves: +1 month, the shop's notice is gone
  await page.evaluate(() => localStorage.clear())
  await login(page, SUPER.phone, SUPER.password)
  await page.goto('/admin')
  await expect(page.getByText(/\d+ to check/)).toBeVisible()
  const row = page.locator('div', { has: page.getByText(ref) }).filter({ has: page.getByRole('button', { name: /Received/ }) }).last()
  await expect(row).toBeVisible()
  await page.screenshot({ path: 'test-results/fees-admin.png', fullPage: true })
  await row.getByRole('button', { name: /Received · \+1 month/ }).click()
  await expect(page.getByText(ref)).toHaveCount(0)
  await expect(page.getByText(/This month Rs\. [\d,]+/)).toBeVisible()

  await page.evaluate(() => localStorage.clear())
  await login(page, owner, 'owner1234')
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.goto('/more/fees')
  await expect(page.getByText('Received', { exact: true })).toBeVisible()
})
