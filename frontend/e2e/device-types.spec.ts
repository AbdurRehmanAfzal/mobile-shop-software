/** Owner addendum 6 (2026-10-31, docs/26): a tablet and a smart watch bought like phones — the
 *  "More details" spec sheet, the lock check a used unit must pass, the model library that fills
 *  the next unit, the device page with specs and lock status, a type change, the stock filters and
 *  the "By type" report. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('device types: tablet with specs, used watch needs the lock check, device page, retype, report', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Tab Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // 1. a Wi-Fi + SIM tablet from a dealer, with RAM and a spec sheet under "More details"
  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /From a dealer/ }).click()
  await page.getByRole('button', { name: 'New person' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Tab Dealer')
  await page.getByLabel('Mobile number').fill('03016660001')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByRole('button', { name: 'Tablet', exact: true }).click()
  await page.getByRole('button', { name: 'Wi-Fi + SIM' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill('356938035643809')
  await page.getByRole('button', { name: 'Samsung', exact: true }).click()
  await page.getByRole('button', { name: /^Galaxy Tab A9\+/ }).first().click()
  await page.getByLabel('Cost price').fill('40000')
  await page.getByLabel('Asking price').fill('48000')
  await page.getByTestId('device-more').click()
  await page.getByLabel('Model number').fill('SM-X216B')
  await page.getByLabel('RAM (GB)').fill('8')
  await page.getByLabel('OS / version').fill('Android 14')
  await page.getByRole('button', { name: 'IPS', exact: true }).click()
  await page.screenshot({ path: 'test-results/devtypes-tablet.png', fullPage: true })
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()

  // 2. a used GPS watch: the lock check block must be ticked before "Add" works
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByRole('button', { name: 'Smart watch', exact: true }).click()
  await page.getByLabel('Serial number').fill('H4KQ9X2LM1')
  await expect(page.getByTestId('serial-lookup')).toContainText(/not seen before/i)
  await page.getByRole('button', { name: 'Apple', exact: true }).click()
  await page.getByRole('button', { name: /^Watch Series 9/ }).first().click()
  await page.getByRole('button', { name: '45mm' }).click()
  await page.getByRole('button', { name: 'Used', exact: true }).click()
  await page.getByLabel('Cost price').fill('60000')
  await page.getByLabel('Asking price').fill('70000')
  await expect(page.getByTestId('lock-block')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Add', exact: true }).last()).toBeDisabled()
  await page.getByTestId('lock-confirm').click()
  await expect(page.getByRole('button', { name: 'Add', exact: true }).last()).toBeEnabled()
  await page.screenshot({ path: 'test-results/devtypes-watch.png', fullPage: true })
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await page.getByRole('button', { name: 'Put in stock' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()

  // 3. the next tablet of the same model fills itself from the library
  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /From a dealer/ }).click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Tab Dealer')
  await page.getByText('Tab Dealer').first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByRole('button', { name: 'Tablet', exact: true }).click()
  await page.getByRole('button', { name: 'Samsung', exact: true }).click()
  await page.getByRole('button', { name: /^Galaxy Tab A9\+/ }).first().click()
  await expect(page.getByText('Filled from your model library')).toBeVisible()
  await page.getByTestId('device-more').click()
  await expect(page.getByLabel('Model number')).toHaveValue('SM-X216B')
  await expect(page.getByLabel('RAM (GB)')).toHaveValue('8')

  // 4. the device page: specs, RAM, lock status; change the watch's type and back
  await page.goto('/stock')
  await page.getByText('Watch Series 9').first().click()
  await expect(page.getByText('Locks cleared')).toBeVisible()
  await expect(page.getByText('45mm')).toBeVisible()
  await page.getByRole('button', { name: 'Change type' }).click()
  await page.getByTestId('retype-sheet').getByRole('button', { name: 'Tablet', exact: true }).click()
  await page.getByRole('button', { name: 'Check', exact: true }).click()
  await expect(page.getByTestId('retype-sheet')).toContainText('its model is a watch model')
  await expect(page.getByRole('button', { name: 'Apply', exact: true })).toBeDisabled()
  await page.getByRole('button', { name: 'Close' }).last().click()
  await page.screenshot({ path: 'test-results/devtypes-detail.png', fullPage: true })
  await page.goto('/stock')
  await page.getByText('Galaxy Tab A9+').first().click()
  await expect(page.getByText('8 GB')).toBeVisible()
  await expect(page.getByText('Android 14')).toBeVisible()

  // 5. filters and the report by type
  await page.goto('/stock')
  await page.getByTestId('stock-filters').click()
  await page.getByLabel('RAM (GB)').selectOption('8')
  await expect(page.getByText('Galaxy Tab A9+').first()).toBeVisible()
  await expect(page.getByText('Watch Series 9')).toHaveCount(0)
  await page.goto('/reports')
  await page.getByRole('button', { name: 'By type' }).click()
  await expect(page.getByTestId('r-types')).toContainText('Tablet')
  await expect(page.getByTestId('r-types')).toContainText('Smart watch')
  await page.screenshot({ path: 'test-results/devtypes-report.png', fullPage: true })
})
