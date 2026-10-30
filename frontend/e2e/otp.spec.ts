/** Owner (2026-10-30): forgot password → code (dev echo stands in for WhatsApp) → new password →
 *  logged in. The backend runs with OTP_DEV_ECHO=true locally. */

import { expect, test } from '@playwright/test'

const phone = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('forgot password with a code: wrong code refused, right code sets a new password and logs in', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('OTP Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.evaluate(() => localStorage.removeItem('mobileshop.auth'))

  await page.goto('/login')
  await page.getByRole('button', { name: 'Forgot password?' }).click()
  await page.getByLabel('Mobile number').last().fill(phone)
  await page.getByRole('button', { name: 'Send code on WhatsApp' }).click()
  const codeNote = page.getByText(/^Test code: \d{6}$/)
  await expect(codeNote).toBeVisible()
  const code = (await codeNote.innerText()).replace(/\D/g, '')
  await page.getByLabel('Code (6 digits)').fill('000000')
  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expect(page.getByText('Wrong or expired code')).toBeVisible()
  await page.getByLabel('Code (6 digits)').fill(code)
  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expect(page.getByText('Number confirmed. Choose a new password.')).toBeVisible()
  await page.screenshot({ path: 'test-results/otp-password.png', fullPage: true })
  await page.getByLabel('New password').fill('fresh-secret-2')
  await page.getByRole('button', { name: 'Set password and log in' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // the new password works, the old one does not
  await page.evaluate(() => localStorage.removeItem('mobileshop.auth'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page.getByText('Wrong phone number or password')).toBeVisible()
  await page.getByLabel('Password').fill('fresh-secret-2')
  await page.getByRole('button', { name: 'Login', exact: true }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
})
