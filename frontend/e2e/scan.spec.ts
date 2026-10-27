/** Owner (2026-10-27): scan the IMEI barcode into IMEI boxes; a phone photo on the ID check.
 *  On http (the shop's Wi-Fi link) the scan reads a photo, which the test hands over directly. */

import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const fixture = (f: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('scan an IMEI barcode from a photo into the add-device form', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Scan Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await expect(page.getByRole('button', { name: 'Scan' }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/scan-field.png' })
  // a code that is not an IMEI (shop barcode) is refused
  await page.getByTestId('scan-photo').first().setInputFiles(fixture('label-ean.png'))
  await expect(page.getByText('No IMEI barcode found in the photo')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).last().click()
  await page.getByTestId('scan-photo').first().setInputFiles(fixture('imei-one.png'))
  await expect(page.getByLabel('IMEI', { exact: true })).toHaveValue('490154203237518')

  // a box label: shop barcode + IMEI 1 + IMEI 2 in one photo -> both IMEIs offered
  const parts = ['label-ean.png', 'imei-one.png', 'label-imei2.png'].map((f) => `data:image/png;base64,${fs.readFileSync(fixture(f)).toString('base64')}`)
  const label = await page.evaluate(async (srcs) => {
    const imgs = await Promise.all(srcs.map((src) => new Promise<HTMLImageElement>((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src })))
    const c = document.createElement('canvas')
    c.width = Math.max(...imgs.map((i) => i.width)) + 80
    c.height = imgs.reduce((h, i) => h + i.height + 60, 60)
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    let y = 60
    for (const i of imgs) { g.drawImage(i, 40, y); y += i.height + 60 }
    return c.toDataURL('image/png').split(',')[1]
  }, parts)
  await page.getByTestId('scan-photo').nth(1).setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: Buffer.from(label, 'base64') })
  await expect(page.getByText('Which IMEI?')).toBeVisible()
  await page.screenshot({ path: 'test-results/scan-pick.png' })
  await page.getByRole('button', { name: '356938035643809' }).click()
  await expect(page.getByLabel('IMEI 2')).toHaveValue('356938035643809')
})
