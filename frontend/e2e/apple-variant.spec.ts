/** Owner (2026-11-09, ADR-055): an iPhone's region code (LL/A) and SIM setup (Dual eSIM) are picked
 *  when buying it, a new one can be added, and the stock line shows them. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('iPhone: region code and SIM setup, with a new region added', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Apple Variant Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill('356938035643809')
  // not an Apple phone: nothing asked
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await expect(page.getByTestId('apple-variant')).toHaveCount(0)
  await page.getByRole('button', { name: 'Apple', exact: true }).click()
  await page.getByRole('button', { name: 'iPhone 15', exact: true }).click()
  const box = page.getByTestId('apple-variant')
  await box.getByRole('button', { name: 'LL/A', exact: true }).click()
  await box.getByRole('button', { name: 'Dual eSIM', exact: true }).click()
  await expect(box.getByRole('button', { name: 'Dual eSIM', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // a region not in the list
  await box.getByRole('button', { name: 'New' }).first().click()
  await page.getByPlaceholder('e.g. LL/A').fill('qn/a')
  await box.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(box.getByRole('button', { name: 'QN/A', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // a used iPhone also asks its battery cycle count
  await page.getByRole('button', { name: 'Used', exact: true }).click()
  await page.getByLabel('Battery health %').fill('91')
  await page.getByTestId('battery-cycles').fill('312')
  await page.screenshot({ path: 'test-results/apple-variant.png', fullPage: true })
  await page.getByLabel('Cost price').fill('150000')
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()

  await page.goto('/stock')
  await expect(page.getByText(/QN\/A · Dual eSIM · Battery 91% · 312 cycles/).first()).toBeVisible()
})
