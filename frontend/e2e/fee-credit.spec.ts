/** Owner (2026-11-09, ADR-053): the super admin extends a shop's package on credit; the shop sees
 *  only "Not paid" and what is still to pay — never the provider's note, never a credit option.
 *  Needs 03990000099 in SUPERUSER_PHONES. */

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

test('package given on credit: the provider sees the note and the invoice, the shop sees the fee as not paid', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const owner = phone()
  const shopName = `Credit Shop ${owner.slice(-4)}`
  expect((await request.post('/api/v1/auth/signup', { data: { shop_name: shopName, owner_name: 'Credit Owner', phone: owner, password: 'owner1234' } })).ok()).toBeTruthy()

  await login(page, SUPER.phone, SUPER.password)
  await page.goto('/admin')
  await page.getByPlaceholder('Search').fill(shopName)
  await page.getByRole('button', { name: new RegExp(shopName) }).first().click()
  await page.getByRole('button', { name: 'basic', exact: true }).click()
  await page.getByLabel('Monthly fee (Rs)').fill('1500')
  await page.getByRole('button', { name: 'Save plan' }).click()

  // two months now, Rs. 3,000 later (filled from the monthly fee), a note only the provider sees
  const card = page.getByTestId('fee-credit')
  await card.getByTestId('credit-months').fill('2')
  await expect(card.getByTestId('credit-amount')).toHaveValue('3000')
  await card.getByTestId('credit-note').fill('Promised after Eid')
  await card.getByTestId('credit-give').click()
  await expect(card.getByText('Package extended. The fee shows as unpaid for the shop.')).toBeVisible()
  const dues = page.getByTestId('fee-dues')
  await expect(dues).toContainText('Not paid')
  await expect(dues).toContainText('Promised after Eid')
  await expect(page.getByTestId('credit-left')).toContainText('3,000')
  await expect(page.getByTestId('credit-wa')).toHaveAttribute('href', /Still%20to%20pay/)
  await page.screenshot({ path: 'test-results/fee-credit-admin.png', fullPage: true })
  await page.keyboard.press('Escape')
  // the shop list marks it, and the "Fee unpaid" filter finds it
  await page.getByRole('button', { name: /^Fee unpaid/ }).click()
  await expect(page.getByRole('button', { name: new RegExp(shopName) }).getByTestId('fee-due-chip')).toContainText('3,000')

  // the shop owner: fee still to pay, never the note or a credit option
  await page.evaluate(() => localStorage.clear())
  await login(page, owner, 'owner1234')
  await page.goto('/more/fees')
  await expect(page.getByTestId('fees-dues')).toContainText('Not paid')
  await expect(page.getByTestId('fees-due-left')).toContainText('3,000')
  await expect(page.getByTestId('fees-invoice')).toBeVisible()
  await expect(page.getByText('Promised after Eid')).toHaveCount(0)
  expect((await page.locator('main').innerText()).toLowerCase()).not.toContain('credit')
  // the suggested payment covers the unpaid fee and one more month
  await expect(page.getByLabel('Amount (Rs)')).toHaveValue('4500')
  await page.screenshot({ path: 'test-results/fee-credit-shop.png', fullPage: true })
})
