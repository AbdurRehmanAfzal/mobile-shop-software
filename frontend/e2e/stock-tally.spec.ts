/** Owner 2026-11-14 (ADR-075): the stock tally sheet fits A4 with every field readable. */

import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

/** a valid IMEI (Luhn) from 14 digits */
function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('tally sheet on A4', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Tally Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const pickBrand = async (name: string) => {
    const b = brands.find((x: { name: string }) => x.name === name)
    const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
    return { b, ms }
  }
  const nokia = await pickBrand('Nokia')
  const samsung = await pickBrand('Samsung')
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Tally Dealer', phone: '03219991111', kinds: ['supplier'] } })).json()).id
  const devs = []
  for (let i = 0; i < 24; i++) {
    const g = i % 2 ? samsung : nokia
    devs.push({ device: { imei1: imei(`35693803565${String(1000 + i).slice(-3)}`), imei2: i % 3 ? null : imei(`35693803566${String(1000 + i).slice(-3)}`), brand_id: g.b.id, model_id: g.ms[i % 3].id, condition: i % 4 ? 'used' : 'box_pack', pta_status: i % 5 ? 'pta_approved' : 'non_pta', battery_health: i % 4 ? 85 + (i % 10) : null, location: `Rack ${1 + (i % 3)}` }, cost: 10000 + i * 500, asking_price: 12000 + i * 500 })
  }
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: devs } })
  expect(pr.ok(), await pr.text()).toBeTruthy()

  // the print page, as the app and the browser print it: A4 width, all fields, no sideways scroll
  const html = await (await request.get('/api/v1/exports/stock-tally?format=pdf&lang=en', { headers: h })).text()
  await page.setViewportSize({ width: 794, height: 1123 }) // A4 at 96 dpi
  await page.setContent(html, { waitUntil: 'load' })
  const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(over).toBeLessThanOrEqual(2)
  await expect(page.getByText('Stock tally sheet')).toBeVisible()
  await expect(page.locator('table.list tbody tr')).toHaveCount(24)
  await page.screenshot({ path: 'test-results/stock-tally-a4.png', fullPage: true })
  await page.pdf({ path: 'test-results/stock-tally-a4.pdf', format: 'A4', printBackground: true, preferCSSPageSize: true })

  // the card on the stock-worth page
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/stock/summary')
  await expect(page.getByTestId('tally-card')).toBeVisible()
  // the app's own PDF: every A4 page drawn on its own (sharp), here 2 pages
  await page.getByTestId('tally-card').getByRole('button', { name: 'Download' }).click()
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('button', { name: /PDF/ }).click()])
  expect(pdf.suggestedFilename()).toBe('stock-tally.pdf')
  await pdf.saveAs('test-results/stock-tally-app.pdf')
  const bytes = readFileSync(await pdf.path())
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  const pages = (bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length
  expect(pages).toBeGreaterThanOrEqual(2)
})
