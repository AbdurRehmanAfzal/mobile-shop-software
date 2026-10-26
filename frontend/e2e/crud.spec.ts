/** Owner: every record can be changed and deleted. Party delete, device edit + old-stock removal, expense edit + cancel. */

import { expect, test, type Page } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
})

async function signup(page: Page) {
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('CRUD Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test('party: delete from the detail page', async ({ page }) => {
  await signup(page)
  await page.goto('/parties')
  await page.getByRole('button', { name: 'New party' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Wrong Entry')
  await page.getByLabel('Mobile number').fill('03001231234')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Delete' }).click()
  await page.getByRole('button', { name: 'Delete' }).last().click()
  await expect(page).toHaveURL(/\/parties$/)
  await expect(page.getByText('Wrong Entry')).toHaveCount(0)
})

test('old stock: edit details, then remove the entry', async ({ page }) => {
  await signup(page)
  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill('490154203237518')
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('800')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()

  await page.goto('/stock')
  await page.getByText(/Nokia 105/).first().click()
  await page.getByRole('button', { name: 'Edit details' }).click()
  await expect(page.getByLabel('IMEI', { exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Box pack' }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Box pack').first()).toBeVisible()

  await page.getByRole('button', { name: 'Remove old-stock entry' }).click()
  const confirm = page.getByRole('button', { name: 'Remove old-stock entry' }).last()
  await expect(confirm).toBeDisabled()
  await page.getByLabel('Why?').fill('typed twice')
  await confirm.click()
  await expect(page.getByRole('button', { name: 'Remove old-stock entry' })).toHaveCount(0)
  await expect(page.getByText('typed twice')).toBeVisible()
})

test('expense: edit amount, then cancel it', async ({ page }) => {
  await signup(page)
  await page.goto('/expenses')
  await page.getByRole('button', { name: 'New expense' }).click()
  await page.getByRole('button', { name: 'Tea & refreshments' }).click()
  await page.getByLabel('Amount').fill('500')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByLabel('Amount')).toHaveCount(0)
  await page.getByRole('button', { name: /Tea/ }).click()
  await page.getByRole('button', { name: 'Edit' }).click()
  await page.getByLabel('Amount').fill('450')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByLabel('Amount')).toHaveCount(0)
  await expect(page.getByText('450').first()).toBeVisible()

  await page.getByRole('button', { name: /Tea/ }).first().click()
  await page.getByRole('button', { name: 'Cancel this expense' }).click()
  await page.getByLabel('Why?').fill('entered by mistake')
  await page.getByRole('button', { name: 'Cancel this expense' }).last().click()
  // both the edited-away and the cancelled expense show crossed out; nothing is left to tap
  await expect(page.locator('.line-through')).toHaveCount(2)
  await page.screenshot({ path: 'test-results/crud-expenses-after.png' })
})
