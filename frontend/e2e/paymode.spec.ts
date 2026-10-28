/** Owner (2026-10-28): pay by cash, online (bank app / wallet), cheque or remittance from abroad,
 *  on sales and purchases; easy and to the point. */

import { expect, test, type Page } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function signup(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Pay Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

async function oldStock(page: Page, imei: string) {
  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill(imei)
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('30000')
  await page.getByLabel('Asking price').fill('37100')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()
}

async function startSale(page: Page) {
  await page.goto('/sale/new')
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await page.getByRole('button', { name: 'Skip and sell (I know this person)' }).click()
}

test('sale paid online and from abroad, purchase by cheque', async ({ page }) => {
  await signup(page)
  await oldStock(page, '490154203237518')
  await oldStock(page, '356938035643809')

  // online: the bank must be chosen first
  await startSale(page)
  await page.getByRole('button', { name: 'Online', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Complete sale' })).toBeDisabled()
  await page.getByRole('button', { name: 'Meezan Bank', exact: true }).click()
  await page.getByLabel('TID / reference (optional)').fill('TID778812')
  await page.screenshot({ path: 'test-results/pay-online.png', fullPage: true })
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  // remittance: 500 SAR × 74.20 = Rs. 37,100
  await startSale(page)
  await page.getByRole('button', { name: 'From abroad', exact: true }).click()
  await page.getByRole('button', { name: /SAR/ }).click()
  await page.getByLabel('Amount (SAR)').fill('500')
  await page.getByLabel('1 SAR = Rs.').fill('74.20')
  await expect(page.getByText('Rs. 37,100').first()).toBeVisible()
  await page.getByLabel("Sender's name").fill('Ahmed Raza')
  await page.getByRole('button', { name: 'Western Union', exact: true }).click()
  await page.screenshot({ path: 'test-results/pay-remittance.png', fullPage: true })
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  // both bills show how they were paid
  await page.goto('/invoices')
  await page.getByText('INV-000002').click()
  await expect(page.getByText(/From abroad · 500 SAR × 74.2 · Western Union · Ahmed Raza/)).toBeVisible()

  // purchase from a dealer by cheque
  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /From a dealer/ }).click()
  await page.getByRole('button', { name: 'New person' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Dealer Cheque')
  await page.getByLabel('Mobile number').fill('03016667788')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill('352099001761481')
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('20000')
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await page.getByRole('button', { name: 'Cheque', exact: true }).click()
  await page.getByRole('button', { name: 'HBL', exact: true }).click()
  await page.getByLabel('Cheque no.').fill('00123456')
  await page.getByRole('button', { name: 'Put in stock' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()
})
