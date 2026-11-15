/** Owner 2026-11-15 (ADR-084): the business overview and the shop audit as detailed A4 reports for
 *  the chosen period — nothing wider than the page, downloadable as PDF / Excel from their screens. */

import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test.setTimeout(240_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('overview and audit reports on A4', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Report Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Samsung')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Report Dealer With A Long Business Name', phone: '03217773333', kinds: ['supplier'] } })).json()).id
  const cust = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Report Customer', phone: '03007773333', kinds: ['customer'] } })).json()).id
  const devs = []
  for (let i = 0; i < 8; i++) devs.push({ device: { imei1: imei(`35693803597${String(100 + i).slice(-3)}`), brand_id: b.id, model_id: ms[i % 3].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 20000 + i * 1000, asking_price: 25000 + i * 1000 })
  const pr = await (await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: devs, paid: 50000 } })).json()
  const sold = await request.post('/api/v1/sales', { headers: h, data: { devices: [{ device_id: pr.lines[0].device_id, price: 26000 }], party_id: cust, paid: 10000 } })
  expect(sold.ok(), await sold.text()).toBeTruthy()

  // both reports: no wider than A4 less the side margins (190 mm = 718 px)
  await page.setViewportSize({ width: 718, height: 1123 })
  for (const [url, shot] of [['/api/v1/reports/overview/export?format=pdf&lang=en', 'overview'], ['/api/v1/shop-audit/report?preset=today&mode=detail&format=pdf&lang=en', 'audit']]) {
    const html = await (await request.get(url, { headers: h })).text()
    expect(html).toContain('size: A4 portrait')
    expect(html).toContain('Report Mobiles')
    await page.setContent(html, { waitUntil: 'load' })
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over, url).toBeLessThanOrEqual(2)
    await page.screenshot({ path: `test-results/report-${shot}.png`, fullPage: true })
  }

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // the overview screen: Download → PDF (the app's own A4 PDF)
  await page.goto('/overview')
  await page.getByRole('button', { name: 'Download' }).first().click()
  await expect(page.getByRole('button', { name: /CSV/ })).toHaveCount(0)
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.getByRole('button', { name: /PDF/ }).click()])
  expect(pdf.suggestedFilename()).toMatch(/^business-overview-.*\.pdf$/)
  expect(readFileSync(await pdf.path()).subarray(0, 5).toString()).toBe('%PDF-')

  // the shop audit screen: the full report card
  await page.goto('/audit')
  await expect(page.getByTestId('audit-full-report')).toBeVisible()
  await page.getByTestId('audit-full-report').getByRole('button', { name: 'Download' }).click()
  const [x] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.getByRole('button', { name: /Excel/ }).last().click()])
  expect(x.suggestedFilename()).toMatch(/^shop-audit.*.xlsx$/)
})
