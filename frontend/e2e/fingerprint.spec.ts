/** Owner (2026-10-28): fingerprint login. On the website it is a passkey; Chrome's virtual
 *  authenticator stands in for the phone's fingerprint sensor. */

import { expect, test } from '@playwright/test'

test('owner turns on fingerprint, logs out, logs in with one touch', async ({ page }) => {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  })
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Touch Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(`039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto('/more')
  await page.getByRole('button', { name: 'Turn on for this phone' }).click()
  await expect(page.getByText('On for this phone.', { exact: false })).toBeVisible()
  await expect(page.getByText(/Chrome on/)).toBeVisible() // listed with its browser name
  await page.screenshot({ path: 'test-results/fingerprint-on.png', fullPage: true })

  await page.getByRole('button', { name: 'Logout' }).click()
  await page.getByRole('button', { name: 'Log in with fingerprint' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
})
