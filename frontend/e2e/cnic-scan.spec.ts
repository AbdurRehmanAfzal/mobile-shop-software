/** Owner (2026-10-28): a photo of the CNIC fills the name and number (read on the device).
 *  The card here is drawn by the test with made-up details. */

import { expect, test } from '@playwright/test'

test('scan a CNIC photo into the new person form', async ({ page }) => {
  test.setTimeout(120_000) // the OCR program is downloaded on first use
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Card Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(`039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // a made-up card front, laid out like a CNIC
  const b64 = await page.evaluate(() => {
    const c = document.createElement('canvas')
    c.width = 1000
    c.height = 630
    const g = c.getContext('2d')!
    g.fillStyle = '#e8f5e9'
    g.fillRect(0, 0, c.width, c.height)
    g.fillStyle = '#111'
    const t = (s: string, x: number, y: number, size: number, bold = false) => { g.font = `${bold ? 'bold ' : ''}${size}px Arial`; g.fillText(s, x, y) }
    t('PAKISTAN', 240, 80, 48, true)
    t('National Identity Card', 520, 80, 30)
    t('Name', 280, 160, 22)
    t('Bilal Ahmed Khan', 280, 200, 34)
    t('Father Name', 280, 260, 22)
    t('Muhammad Aslam Khan', 280, 300, 34)
    t('Gender', 280, 360, 22); t('Country of Stay', 400, 360, 22)
    t('M', 280, 400, 32); t('Pakistan', 400, 400, 32)
    t('Identity Number', 280, 460, 22); t('Date of Birth', 540, 460, 22)
    t('35202-1234567-1', 280, 500, 34); t('10.03.1990', 540, 500, 34)
    t('Date of Issue', 280, 550, 22); t('Date of Expiry', 540, 550, 22)
    t('05.06.2018', 280, 590, 34); t('05.06.2032', 540, 590, 34)
    return c.toDataURL('image/png').split(',')[1]
  })

  await page.goto('/parties')
  await page.getByRole('button', { name: 'New person' }).first().click()
  await page.getByTestId('cnic-photo').setInputFiles({ name: 'cnic.png', mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') })
  await expect(page.getByLabel('Name', { exact: true })).toHaveValue('Bilal Ahmed Khan', { timeout: 90_000 })
  await expect(page.getByLabel('CNIC')).toHaveValue('35202-1234567-1')
  await expect(page.getByLabel('Notes')).toHaveValue(/S\/O Muhammad Aslam Khan · Born 10\.03\.1990 · CNIC valid till 05\.06\.2032/)
  await page.screenshot({ path: 'test-results/cnic-scan.png', fullPage: true })
})
