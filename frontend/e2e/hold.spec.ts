/** Owner (2026-10-28): POS "hold sale". Park a bill, serve someone else, resume it as it was;
 *  a phone sold in between comes off the held bill. */

import { expect, test, type Page } from '@playwright/test'

async function addPhone(page: Page, imei: string) {
  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill(imei)
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('800')
  await page.getByLabel('Asking price').fill('1000')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()
}

test('hold a sale, resume it as it was; a phone sold meanwhile comes off', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Hold Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(`039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await addPhone(page, '490154203237518')

  // a bill with the price changed and tax ticked, then held under a name
  await page.goto('/sale/new')
  await expect(page.getByRole('button', { name: 'Held sales' })).toHaveCount(0)
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await page.getByLabel('Sold for').fill('950')
  await page.getByLabel('Add tax to this bill').check()
  await page.getByRole('button', { name: 'Hold sale' }).click()
  await page.getByLabel('Name to find it (optional)').fill('Ali')
  await page.getByRole('button', { name: 'Hold', exact: true }).click()
  await expect(page.getByText('Sale held. Find it under Held sales.')).toBeVisible()
  // the phone is still for sale
  await expect(page.getByRole('button', { name: /Nokia/ }).first()).toBeVisible()

  // resumed: same price, tax still ticked
  await page.getByRole('button', { name: /Held sales/ }).click()
  await expect(page.getByText('Ali')).toBeVisible()
  await expect(page.getByText('Rs. 1,121')).toBeVisible()
  await page.screenshot({ path: 'test-results/held-list.png', fullPage: true })
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByLabel('Sold for')).toHaveValue('950')
  await expect(page.getByLabel('Add tax to this bill')).toBeChecked()
  await expect(page.getByRole('button', { name: /Held sales/ })).toHaveCount(0)

  // held again; meanwhile the same phone is sold to someone else
  await page.getByRole('button', { name: 'Hold sale' }).click()
  await page.getByRole('button', { name: 'Hold', exact: true }).click()
  await expect(page.getByText('Sale held. Find it under Held sales.')).toBeVisible()
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await page.getByRole('button', { name: 'Skip and sell (I know this person)' }).click()
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()
  await page.getByRole('button', { name: 'Another sale' }).click()
  await page.getByRole('button', { name: /Held sales/ }).click()
  await page.getByRole('button', { name: 'Resume' }).click()
  await expect(page.getByText('1 phone(s) on this bill were sold meanwhile and were taken off.')).toBeVisible()
  await expect(page.getByLabel('Sold for')).toHaveCount(0)
})
