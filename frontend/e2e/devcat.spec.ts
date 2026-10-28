/** Owner (2026-10-28): tablets and smart watches one by one, like phones. */

import { expect, test } from '@playwright/test'

test('a smart watch with a serial number, then found under Smart watch when selling', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Gadget Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(`039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByRole('button', { name: 'Smart watch' }).click()
  // no PTA for a watch; only brands that make watches
  await expect(page.getByText('PTA status')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Nokia', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Apple', exact: true }).click()
  await page.getByRole('button', { name: 'Watch Series 9', exact: true }).click()
  // a watch's own details (owner 2026-10-28): no storage, IMEI 2, JV or patched; case size, battery, strap
  await expect(page.getByText('Storage', { exact: true })).toHaveCount(0)
  await expect(page.getByLabel('IMEI 2')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Patched' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Earphones: No' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Extra strap: No' })).toBeVisible()
  // with a SIM it needs the IMEI and has PTA, but never JV
  await page.getByRole('button', { name: 'With SIM (Cellular)' }).click()
  await expect(page.getByText('PTA status')).toBeVisible()
  await expect(page.getByRole('button', { name: 'JV', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'No SIM (GPS)' }).click()
  await expect(page.getByText('PTA status')).toHaveCount(0)
  await page.getByRole('button', { name: '45mm' }).click()
  await page.getByRole('button', { name: 'Used', exact: true }).click()
  await page.getByLabel('Battery health %').fill('91')
  await page.getByLabel('Serial number').fill('h4kq9x2lm1')
  await page.getByLabel('Cost price').fill('60000')
  await page.getByLabel('Asking price').fill('70000')
  await page.screenshot({ path: 'test-results/devcat-watch.png', fullPage: true })
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()

  // a Wi-Fi tablet: storage and pen, no PTA
  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByRole('button', { name: 'Tablet' }).click()
  await expect(page.getByRole('button', { name: 'Wi-Fi only' })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('PTA status')).toHaveCount(0)
  await expect(page.getByText('Storage', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Pen / stylus: No' })).toBeVisible()
  await page.getByRole('button', { name: 'Wi-Fi + SIM' }).click()
  await expect(page.getByText('PTA status')).toBeVisible()
  await page.screenshot({ path: 'test-results/devcat-tablet.png', fullPage: true })

  await page.goto('/sale/new')
  await page.getByRole('button', { name: 'Smart watch' }).click()
  await expect(page.getByText(/Watch Series 9 · 45mm · GPS · Battery 91%/)).toBeVisible()
  await page.getByRole('button', { name: 'Tablet' }).click()
  await expect(page.getByText(/Watch Series 9/)).toHaveCount(0)
})
