/** Owner 2026-11-15 (ADR-078): the stock page's PDF fits A4 with every field; the staff and customer
 *  price lists open from the stock page. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const ALL = 'name,storage,ram,colour,condition,grade,pta,simlock,sim_time,battery,cycles,region,sim,imei,imei2,serial,barcode,days,source,cost,asking,status,verification'

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('stock lists on A4', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'A4 Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Samsung')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'A4 Dealer', phone: '03219994444', kinds: ['supplier'] } })).json()).id
  const devs = []
  for (let i = 0; i < 18; i++) {
    devs.push({ device: { imei1: imei(`35693803585${String(1000 + i).slice(-3)}`), imei2: imei(`35693803586${String(1000 + i).slice(-3)}`), serial: `R58N${1000 + i}XYZ`, brand_id: b.id, model_id: ms[i % 3].id, condition: i % 2 ? 'used' : 'box_pack', pta_status: 'pta_approved', battery_health: 80 + i, ram_gb: 8, location: `Rack ${i % 4}` }, cost: 30000 + i * 1000, asking_price: 36000 + i * 1000 })
  }
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: devs } })
  expect(pr.ok(), await pr.text()).toBeTruthy()

  // every field, every copy: nothing wider than A4 less the side margins (190 mm = 718 px)
  await page.setViewportSize({ width: 718, height: 1123 }) // A4 less 10 mm each side
  for (const q of [`cols=${ALL}&status=all`, 'copy=staff&status=all', 'copy=customer']) {
    const html = await (await request.get(`/api/v1/exports/stock?format=pdf&lang=en&${q}`, { headers: h })).text()
    await page.setContent(html, { waitUntil: 'load' })
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
    expect(over, q).toBeLessThanOrEqual(2)
    await expect(page.locator('table.list tbody tr')).toHaveCount(18)
  }
  await page.screenshot({ path: 'test-results/stock-a4-customer.png', fullPage: true })
  const html = await (await request.get(`/api/v1/exports/stock?format=pdf&lang=en&cols=${ALL}&status=all`, { headers: h })).text()
  await page.setContent(html, { waitUntil: 'load' })
  await page.screenshot({ path: 'test-results/stock-a4-all.png', fullPage: true })
  // a wide report (every sale / purchase list) fits too
  const sales = await (await request.get('/api/v1/exports/purchases?format=pdf&lang=en', { headers: h })).text()
  await page.setContent(sales, { waitUntil: 'load' })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(2)

  // the stock page: Price lists → the two copies
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/stock')
  await page.getByTestId('price-lists').click()
  await expect(page.getByTestId('plist-staff')).toBeVisible()
  await expect(page.getByTestId('plist-customer')).toBeVisible()
  await page.screenshot({ path: 'test-results/stock-price-lists.png' })
  // the staff list as the app's own PDF
  await page.getByTestId('plist-staff').getByRole('button', { name: 'Download' }).click()
  const [pdf] = await Promise.all([page.waitForEvent('download', { timeout: 60_000 }), page.getByRole('button', { name: /PDF/ }).last().click()])
  expect(pdf.suggestedFilename()).toBe('stock-prices.pdf')
})
