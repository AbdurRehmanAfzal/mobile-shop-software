/** docs/35 §5 item 1 (owner 2026-11-04): Reports → Balance sheet shows the balance sheet and the
 *  trial balance as of a day, both balanced, in English and Urdu. */

import { expect, test } from '@playwright/test'

test('balance sheet and trial balance', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Books Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(`039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto('/reports')
  await page.getByRole('button', { name: 'Balance', exact: true }).first().click()
  const books = page.getByTestId('books')
  await expect(books.getByText('What the shop has')).toBeVisible()
  await expect(books.getByText("Owner's share", { exact: true })).toBeVisible()
  await expect(page.getByTestId('books-check')).toContainText("Balanced: has = owes + owner's share")
  // the people lines open the udhaar khata
  await expect(books.getByRole('link', { name: /People who owe you/ })).toHaveAttribute('href', '/khata')

  await books.getByRole('button', { name: 'Trial balance' }).click()
  await expect(page.getByTestId('trial-rows')).toContainText('Debit')
  await expect(page.getByTestId('books-check')).toContainText('Balanced')
  // an older day works too
  await books.getByLabel('As of').fill('2025-12-31')
  await expect(page.getByTestId('books-check')).toContainText('Balanced')

  // Urdu: only Urdu on the screen
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.reload()
  await page.getByRole('button', { name: 'بیلنس', exact: true }).first().click()
  await expect(page.getByTestId('books')).toContainText('دکان کے پاس کیا ہے')
  await expect(page.getByTestId('books')).not.toContainText('What the shop has')
})
