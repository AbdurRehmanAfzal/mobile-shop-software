/** Owner (2026-10-27): every bill in one place — find it by number, name or IMEI and open it. */

import { expect, test, type Page } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function signup(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Bill Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test('invoices: every bill in one list, search by IMEI, open the bill', async ({ page }) => {
  await signup(page)
  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill('490154203237518')
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('800')
  await page.getByLabel('Asking price').fill('1000')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()

  await page.goto('/sale/new')
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await page.getByRole('button', { name: 'Skip and sell (I know this person)' }).click()
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  // the home tile opens the list
  await page.goto('/')
  await page.getByRole('link', { name: 'Invoices' }).first().click()
  await expect(page).toHaveURL(/\/invoices$/)
  await expect(page.getByText('INV-000001')).toBeVisible()
  await page.screenshot({ path: 'test-results/invoices.png', fullPage: true })

  // search by part of the IMEI, then open the bill
  await page.getByPlaceholder('Bill no, name, phone or IMEI').fill('237518')
  await expect(page.getByText('Searching all dates')).toBeVisible()
  await expect(page.getByText('INV-000001')).toBeVisible()
  await page.getByRole('button', { name: 'Purchases', exact: true }).click()
  await expect(page.getByText('INV-000001')).toHaveCount(0)
  await page.getByRole('button', { name: 'All', exact: true }).first().click()
  await page.getByText('INV-000001').click()
  await expect(page).toHaveURL(/\/sales\//)
})
