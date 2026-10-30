/** Owner (2026-10-29): before an invoice, receipt or report is made, the language is chosen —
 *  English unless Urdu is picked. */

import { expect, test } from '@playwright/test'

test('document language: English by default, Urdu on request, for the receipt and a report', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Lang Shop')
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
  await page.getByRole('button', { name: 'Skip and sell (I know this person)' }).click()
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  // the picker sits above the print buttons, English pressed; the English receipt first
  const group = page.getByRole('group', { name: 'Document language' })
  await expect(group.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
  const [en] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /Print invoice/ }).click()])
  await expect(en.getByText('Thank you for your business')).toBeVisible()
  await en.close()
  // Urdu picked: the same receipt in Urdu
  await group.getByRole('button', { name: 'اردو' }).click()
  await page.screenshot({ path: 'test-results/doclang-sale.png', fullPage: true })
  const [ur] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /Print invoice/ }).click()])
  await expect(ur.getByText('خریداری کا شکریہ')).toBeVisible()
  await ur.close()

  // a report: the choice is asked again in the Download sheet (English after a fresh start)
  await page.goto('/reports')
  await page.getByRole('button', { name: 'Download', exact: true }).first().click()
  const sheetGroup = page.getByRole('group', { name: 'Document language' })
  await expect(sheetGroup.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true')
  await sheetGroup.getByRole('button', { name: 'اردو' }).click()
  const [rep] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /Print/ }).click()])
  await expect(rep.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(rep.getByText('منافع و نقصان')).toBeVisible()
  await rep.close()
})
