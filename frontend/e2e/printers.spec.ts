/** Owner 2026-11-20 (ADR-119): Shop settings → Printers — the sticker, receipt and A4 printer each
 *  set up once on this device (how it is connected, the steps for this kind of device, a test page,
 *  "it printed right"), and the printer guide, which anyone can open and read in his language. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('printers: connection steps, test page, working state; the guide is open to anyone', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })

  // the guide without a login: plain sections, examples, three languages, the narrowest phone
  await page.goto('/printer-guide')
  const guide = page.getByTestId('printer-guide')
  await expect(guide.getByRole('heading', { level: 1, name: 'Printer guide' })).toBeVisible()
  for (const t of ['The short answer', 'How printing works here', 'Sticker sizes', 'Three ways to connect', 'Phone or computer?', 'If something goes wrong', 'Ask the seller before you buy']) await expect(guide).toContainText(t)
  await expect(guide.getByTestId('pg-s3')).toContainText('60 × 40 mm')
  await expect(guide.getByTestId('pg-s4')).toContainText('Example: a sticker printer on the counter beside the laptop.')
  await expect(guide.getByTestId('pg-to-settings')).toHaveCount(0) // not signed in: nothing of a shop
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  await guide.getByRole('button', { name: 'اردو' }).click()
  await expect(guide.getByRole('heading', { level: 1, name: 'پرنٹر گائیڈ' })).toBeVisible()
  await guide.getByRole('button', { name: 'Roman' }).click()
  await expect(guide).toContainText('Mukhtasar jawab')
  await guide.getByRole('button', { name: 'English' }).click()
  await page.screenshot({ path: 'test-results/printer-guide.png', fullPage: true })

  const ph = phone()
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'Print Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })

  // Settings → Printers: nothing tested yet; the steps follow the device and the connection
  await page.goto('/more/settings')
  const card = page.getByTestId('printers-card')
  await expect(card.getByTestId('printer-sticker-state')).toContainText('Not tested yet')
  await card.getByTestId('printer-device-pc').click()
  await card.getByTestId('printer-sticker-usb').click()
  const steps = card.getByTestId('printer-sticker-steps')
  await expect(steps).toContainText("Plug the printer's USB cable into the computer")
  await expect(steps).toContainText('Margins: None')
  await card.getByTestId('printer-sticker-bluetooth').click()
  await expect(steps).toContainText('Printers & scanners')
  await expect(card.getByTestId('printer-sticker')).toContainText('A USB cable is the sure way on a computer.')
  await card.getByTestId('printer-device-phone').click()
  await expect(steps).toContainText('RawBT print service')
  await card.getByTestId('printer-device-pc').click()
  await card.getByTestId('printer-sticker-usb').click()

  // the test page: the sticker's own size, a frame, a barcode
  await card.getByTestId('printer-sticker').getByRole('button', { name: '50 × 30' }).click()
  const [pop] = await Promise.all([page.waitForEvent('popup'), card.getByTestId('printer-sticker-test').click()])
  await expect.poll(() => pop.content(), { timeout: 15_000 }).toContain('MS-TEST-12345')
  expect(await pop.content()).toContain('size:50mm 30mm')
  await pop.close()
  // it did not print right: what to try; then it did: remembered on this device
  await card.getByTestId('printer-sticker-no').click()
  await expect(card.getByTestId('printer-sticker-fix')).toContainText('Turn it over')
  await card.getByTestId('printer-sticker-test').click().catch(() => undefined)
  await card.getByTestId('printer-sticker-yes').click()
  await expect(card.getByTestId('printer-sticker-state')).toContainText('Working')
  await expect(card.getByTestId('printer-sticker-fix')).toHaveCount(0)
  await card.getByTestId('printer-receipt-usb').click()
  await card.getByTestId('printer-a4-wifi').click()
  await expect(card.getByTestId('printer-a4-steps')).toContainText('same Wi-Fi')
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  await card.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/printers-card.png' })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('printer-sticker-state')).toContainText('Working')
  await expect(page.getByTestId('printer-a4-wifi')).toHaveAttribute('aria-pressed', 'true')

  // the guide from Settings, and back to the printers from the guide
  await page.getByTestId('printer-guide-open').click()
  await expect(page).toHaveURL(/\/printer-guide$/)
  await page.getByTestId('pg-to-settings').click()
  await expect(page).toHaveURL(/\/more\/settings$/)
})
