/** Owner (2026-10-27): scan the IMEI barcode into IMEI boxes; a phone photo on the ID check.
 *  On http (the shop's Wi-Fi link) the scan reads a photo, which the test hands over directly. */

import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const fixture = (f: string) => path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures', f)
/** several barcode pictures one under another on white, like a box label */
async function stack(page: Page, files: string[], gap: number): Promise<Buffer> {
  const parts = files.map((f) => `data:image/png;base64,${fs.readFileSync(fixture(f)).toString('base64')}`)
  const b64 = await page.evaluate(
    async ([srcs, gap]) => {
      const imgs = await Promise.all((srcs as string[]).map((src) => new Promise<HTMLImageElement>((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src })))
      const c = document.createElement('canvas')
      c.width = Math.max(...imgs.map((i) => i.width)) + 80
      c.height = imgs.reduce((h, i) => h + i.height + (gap as number), gap as number)
      const g = c.getContext('2d')!
      g.fillStyle = '#fff'
      g.fillRect(0, 0, c.width, c.height)
      let y = gap as number
      for (const i of imgs) { g.drawImage(i, 40, y); y += i.height + (gap as number) }
      return c.toDataURL('image/png').split(',')[1]
    },
    [parts, gap] as const,
  )
  return Buffer.from(b64, 'base64')
}

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
  await expect(page.getByText('No IMEI barcode found in the photo')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('button', { name: 'Close' }).last().click()
  await page.getByTestId('scan-photo').first().setInputFiles(fixture('imei-one.png'))
  await expect(page.getByLabel('IMEI', { exact: true })).toHaveValue('490154203237518', { timeout: 20_000 })

  // a box label: shop barcode + IMEI 1 + IMEI 2 in one photo, scanned into the IMEI 2 box
  const label = (await stack(page, ['label-ean.png', 'imei-one.png', 'label-imei2.png'], 60)).toString('base64')
  await page.getByTestId('scan-photo').nth(1).setInputFiles({ name: 'label.png', mimeType: 'image/png', buffer: Buffer.from(label, 'base64') })
  // IMEI 1 is already filled, so the IMEI 2 box takes the label's other IMEI by itself (owner, 2026-10-28)
  await expect(page.getByLabel('IMEI 2')).toHaveValue('356938035643809', { timeout: 20_000 })
  await expect(page.getByText('Which IMEI?')).toHaveCount(0)

  // an Apple-style label: EID, serial and IMEI barcodes packed close together -> only the IMEI
  await page.getByLabel('IMEI', { exact: true }).fill('')
  const apple = await stack(page, ['label-eid.png', 'label-serial.png', 'label-imei-tight.png'], 14)
  await page.getByTestId('scan-photo').first().setInputFiles({ name: 'apple.png', mimeType: 'image/png', buffer: apple })
  await expect(page.getByLabel('IMEI', { exact: true })).toHaveValue('490154203237518', { timeout: 20_000 })

  // Android may reload the page when the camera app opens: what was typed is still there
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByLabel('Cost price').fill('800')
  await page.reload()
  await expect(page.getByLabel('IMEI', { exact: true })).toHaveValue('490154203237518')
  await expect(page.getByLabel('Cost price')).toHaveValue('800')
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.reload()
  await expect(page.getByText('490154203237518')).toBeVisible()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()
  // after saving, the list starts empty again
  await page.reload()
  await expect(page.getByText('490154203237518')).toHaveCount(0)

  // an unfinished Add stock does not come back when it is opened again from the app
  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /Buy a customer's phone/ }).click()
  await page.getByRole('link', { name: 'Home' }).first().click()
  await page.getByRole('link', { name: /Add stock/ }).first().click()
  await expect(page.getByText('1/3')).toBeVisible()
  await expect(page.getByRole('button', { name: /Buy a customer's phone/ })).toHaveAttribute('aria-pressed', 'false')
})
