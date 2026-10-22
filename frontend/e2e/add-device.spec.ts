/** Regression: adding a device in the purchase wizard and on the old-stock page. */

import { expect, test, type Page } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
})

async function signup(page: Page) {
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Add Device Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByText("Today's sales")).toBeVisible()
}

async function fillDevice(page: Page, imei: string) {
  await page.getByLabel('IMEI', { exact: true }).fill(imei)
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('800')
  await page.getByLabel('Asking price').fill('1000')
}

test('old stock: add device then save', async ({ page }) => {
  await signup(page)
  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await fillDevice(page, '490154203237518')
  await page.screenshot({ path: 'test-results/add-device-filled.png', fullPage: true })
  const add = page.getByRole('button', { name: 'Add', exact: true })
  await expect(add).toBeEnabled()
  await add.click()
  await expect(page.getByText('490154203237518')).toBeVisible()
  await expect(page.getByText('Added. Add another or save.')).toBeVisible()
  await expect(page.getByText('Used').first()).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()
  await page.screenshot({ path: 'test-results/add-device-after.png', fullPage: true })
})

test('purchase wizard: add device from supplier', async ({ page }) => {
  await signup(page)
  await page.goto('/parties')
  await page.getByRole('button', { name: 'New party' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Rehman Traders')
  await page.getByLabel('Mobile number').fill('03005555555')
  await page.locator('form').getByRole('button', { name: 'Supplier' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await page.goto('/purchase/new')
  await page.getByPlaceholder('Name, phone or CNIC').fill('Rehman')
  await page.getByRole('button', { name: /Rehman Traders/ }).first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add device' }).click()
  await fillDevice(page, '356938035643809')
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await expect(page.getByText('356938035643809')).toBeVisible()
})
