/** ADR-144 (shopkeepers 2026-11-26): a report's Download / Share sheet lets the reader hide cost and
 *  profit and choose the columns; the server leaves them out of the PDF, Excel and CSV. A long
 *  report's PDF ends each page under a whole row. */

import { copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test.setTimeout(300_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('reports: hide cost and profit, choose columns, a PDF of whole rows', async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Report Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Sheikh Amir', phone: '03215551511', kinds: ['supplier'] })
  const nokia = (await get('/catalogue/brands')).find((x: { name: string }) => x.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-5)
  const N = 64
  const devices = Array.from({ length: N }, (_, i) => ({ device: { imei1: imei(`3569${stamp}${String(10000 + i)}`), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 20000 + i, asking_price: 26000 }))
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 0, devices })
  // every third customer has a name that wraps onto a second line of its row
  for (let i = 0; i < N; i++) {
    const cust = await post('/parties', { name: i % 3 === 0 ? `Muhammad Usman Tariq Mehmood of the Hall Road Mobile Market shop ${i}` : `Customer ${i}`, kinds: ['customer'] })
    await post('/sales', { party_id: cust.id, devices: [{ device_id: pur.lines[i].device_id, price: 25000 + i }], paid: 1000 })
  }

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })

  await page.goto('/sales')
  await page.getByRole('button', { name: 'Download' }).first().click()
  await expect(page.getByTestId('rep-options')).toBeVisible()

  // as it was: the file has cost and profit
  const [full] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.getByRole('button', { name: /CSV/ }).click()])
  const head = (t: string) => t.replace(/^﻿/, '').split(/\r?\n/)[0].split(',')
  const all = head(readFileSync(await full.path(), 'utf8'))
  expect(all).toEqual(expect.arrayContaining(['Cost', 'Profit', 'Tax', 'Customer']))

  // hide cost and profit, and leave out one more column
  await page.getByTestId('rep-nocost').check()
  await page.getByTestId('rep-cols').click()
  const list = page.getByTestId('rep-cols-list')
  await expect(list).toContainText('Customer')
  await expect(list).not.toContainText('Profit')
  await list.getByLabel('Tax').uncheck()
  const [cut] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.getByRole('button', { name: /CSV/ }).click()])
  const text = readFileSync(await cut.path(), 'utf8')
  expect(head(text)).toEqual(all.filter((x) => !['Cost', 'Profit', 'Tax'].includes(x)))
  expect(text.trim().split(/\r?\n/).length).toBe(N + 1)

  // the PDF of the same choice: several A4 pages
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 120_000 }), page.getByRole('button', { name: /PDF/ }).click()])
  const bytes = readFileSync(await pdf.path())
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-')
  expect((bytes.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length).toBeGreaterThanOrEqual(2)
  mkdirSync('test-results', { recursive: true })
  copyFileSync(await pdf.path(), 'test-results/report-sales.pdf')

  // the page that is printed: the shop's header, the title bar, no cost, rows kept whole
  const html = await (await request.get('/api/v1/exports/sales?format=pdf&lang=en&rnocost=1', { headers: h })).text()
  expect(html).toContain('break-inside:avoid')
  expect(html).not.toContain('<th>Profit</th>')
  await page.setViewportSize({ width: 718, height: 1123 })
  await page.setContent(html, { waitUntil: 'load' })
  await expect(page.locator('.top')).toContainText('Sales')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2)
  await page.screenshot({ path: 'test-results/report-sales-page.png' })
})

test('reports: a salesman is offered no cost tick', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Report Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const sp = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const made = await request.post('/api/v1/staff', { headers: h, data: { name: 'Salesman', phone: sp, password: 'e2e-secret-2', role: 'salesman' } })
  test.skip(!made.ok(), 'staff could not be made in this setup')
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(sp.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-2')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })
  await page.goto('/sales')
  await page.getByRole('button', { name: 'Download' }).first().click()
  await expect(page.getByTestId('rep-options')).toBeVisible()
  await expect(page.getByTestId('rep-nocost')).toHaveCount(0)
  const csv = await (await request.get('/api/v1/exports/sales?format=csv&lang=en', { headers: { Authorization: `Bearer ${(await (await request.post('/api/v1/auth/login', { data: { phone: sp, password: 'e2e-secret-2' } })).json()).tokens?.access_token}` } })).text()
  expect(csv).not.toContain('Profit')
})
