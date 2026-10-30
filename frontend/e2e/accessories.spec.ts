/** Owner (2026-10-27): box, charger… as three plain choices (No / Got it / Later + when) when adding
 *  stock, and warranty + box directly under the phone when selling. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('accessories: got it / later when buying, given / later when selling, warranty chips', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Box Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
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
  await expect(page.getByText('What came with the phone?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Box: No' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Box: Got it' }).click()
  await page.getByRole('button', { name: 'Charger: Later' }).click()
  await expect(page.getByText('When will they give it?')).toBeVisible()
  await page.screenshot({ path: 'test-results/acc-buy.png', fullPage: true })
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()

  await page.goto('/sale/new')
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  // shown straight away, no "more options"; the box that came with the phone starts as given
  await expect(page.getByText('What goes with the phone?')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Box: Given' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '1 month' }).click()
  await page.getByRole('button', { name: 'Earphones: Later' }).click()
  await expect(page.getByText('When will we give it?')).toBeVisible()
  await page.screenshot({ path: 'test-results/acc-sell.png', fullPage: true })
  await page.getByRole('button', { name: 'Skip and sell (I know this person)' }).click()
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()
})
