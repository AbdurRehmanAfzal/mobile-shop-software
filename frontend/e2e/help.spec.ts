/** Owner (2026-10-28): words like udhaar (credit), PTA or IMEI get a "?" that explains them. */

import { expect, test } from '@playwright/test'

test('a ? explains a word in plain language', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Help Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(`039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'What is this?: Old stock' }).click()
  await expect(page.getByText('Phones that were already in the shop before you started the app.', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).last().click()

  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByRole('button', { name: 'What is this?: PTA status' }).click()
  await expect(page.getByText(/Non-PTA: not registered/)).toBeVisible()
  await page.screenshot({ path: 'test-results/help-pta.png' })
  await page.getByRole('button', { name: 'Close' }).last().click()
  // the add-device form is still open underneath
  await expect(page.getByLabel('IMEI', { exact: true })).toBeVisible()

  await page.goto('/khata')
  await page.getByRole('button', { name: 'What is this?: Khata (account)' }).click()
  await expect(page.getByText(/One page per person/)).toBeVisible()
})
