/** Repair in three steps: take the phone in (advance) → it is fixed (work charge) → give back (part paid,
 *  the rest goes to the customer's khata). */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
    // the job slip opens in a new window; keep the test on this page
    window.open = () => null
  })
})

test('take in, fix, give back with the rest on khata', async ({ page }) => {
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Repair Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.locator('main').getByRole('link', { name: 'Repair' }).click()
  await page.getByRole('button', { name: 'Take a phone for repair' }).first().click()
  await page.getByRole('button', { name: 'New person' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Zahid Repair')
  await page.getByLabel('Mobile number').fill('03024445555')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByLabel('Phone name (e.g. Samsung A54)').fill('Samsung A54')
  await page.getByLabel('Other problem (write)').fill('screen broken')
  await page.getByLabel('Advance taken').fill('200')
  await page.getByRole('button', { name: 'Save and print slip' }).click()
  await expect(page.getByText('Taken in').first()).toBeVisible()

  await page.getByRole('button', { name: 'It is fixed' }).first().click()
  await page.getByLabel('Work charge').fill('1000')
  await page.getByRole('button', { name: 'It is fixed' }).last().click()
  await expect(page.getByRole('button', { name: 'Give back to customer' })).toBeVisible()
  await expect(page.getByText('800', { exact: true }).first()).toBeVisible() // left to take = 1000 - 200
  await page.screenshot({ path: 'test-results/repair-ready.png', fullPage: true })

  await page.getByRole('button', { name: 'Give back to customer' }).click()
  await page.getByLabel('Taken now').fill('500')
  await expect(page.getByText("The rest goes to the customer's khata")).toBeVisible()
  await page.getByRole('button', { name: 'Give back to customer' }).last().click()
  await expect(page.getByText('Given back').first()).toBeVisible()

  await page.goto('/khata')
  await expect(page.getByText('Zahid Repair')).toBeVisible()
  await expect(page.getByText('300', { exact: true }).first()).toBeVisible()
})
