/** Live scanning (https / localhost): Chrome's fake camera shows an Apple-style label (EID, serial,
 *  IMEI close together) and the IMEI box fills by itself. */

import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures')
const video = path.join(dir, 'label-live.mjpeg')

test.use({
  permissions: ['camera'],
  launchOptions: { args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${video}`] },
})

test.beforeAll(async ({ browser }) => {
  if (fs.existsSync(video)) return
  // build the fake camera picture once: three barcodes stacked on white, as a JPEG frame
  const page = await browser.newPage()
  const parts = ['label-eid.png', 'label-serial.png', 'label-imei-tight.png'].map((f) => `data:image/png;base64,${fs.readFileSync(path.join(dir, f)).toString('base64')}`)
  const b64 = await page.evaluate(async (srcs) => {
    const imgs = await Promise.all(srcs.map((src) => new Promise<HTMLImageElement>((ok) => { const i = new Image(); i.onload = () => ok(i); i.src = src })))
    const c = document.createElement('canvas')
    c.width = 1280
    c.height = 720
    const g = c.getContext('2d')!
    g.fillStyle = '#fff'
    g.fillRect(0, 0, c.width, c.height)
    let y = 200
    for (const i of imgs) { g.drawImage(i, 200, y, i.width * 1.6, i.height * 1.6); y += i.height * 1.6 + 20 }
    return c.toDataURL('image/jpeg', 0.92).split(',')[1]
  }, parts)
  fs.writeFileSync(video, Buffer.from(b64, 'base64'))
  await page.close()
})

test('live camera fills the IMEI box', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Live Scan')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(`039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByRole('button', { name: 'Scan' }).first().click()
  await expect(page.getByText('Scan the IMEI barcode')).toBeVisible()
  await expect(page.getByLabel('IMEI', { exact: true })).toHaveValue('490154203237518', { timeout: 20_000 })
})
