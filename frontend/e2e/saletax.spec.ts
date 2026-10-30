/** Owner (2026-10-28): tax is a checkbox on the sale, off by default; ticked, the rate is added. */

import { expect, test } from '@playwright/test'

test('tax checkbox: off by default, 18% added when ticked', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Tax Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(`039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

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
  const tax = page.getByLabel('Add tax to this bill')
  await expect(tax).not.toBeChecked()
  await expect(page.getByText('Rs. 1,000').last()).toBeVisible()
  await tax.check()
  await expect(page.getByLabel('Tax %')).toHaveValue('18')
  await expect(page.getByText('Rs. 1,180')).toBeVisible()
  await page.screenshot({ path: 'test-results/sale-tax.png', fullPage: true })
  await page.getByRole('button', { name: 'Skip and sell (I know this person)' }).click()
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  // the invoice as a PDF file, to download or share (owner 2026-10-28)
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), page.getByRole('button', { name: 'Download PDF' }).click()])
  expect(pdf.suggestedFilename()).toMatch(/^invoice-.*\.pdf$/)
  await pdf.saveAs('test-results/invoice.pdf')
  await expect(page.getByRole('button', { name: 'Share PDF' })).toBeVisible()
})
