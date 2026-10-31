/** Owner addendum 4 (2026-10-31, docs/22): a barcode is born with the purchase, the label prints
 *  with it, a hardware scanner (keyboard burst + Enter) sells it from the sale screen, finds it from
 *  Home, and the stock count knows what is missing. The scanner is simulated with page.keyboard
 *  (fast keys + Enter), exactly what a USB / Bluetooth scanner sends. */

import { expect, test, type Page } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const API = 'http://localhost:8000/api/v1'

async function scan(page: Page, code: string) {
  await page.keyboard.type(code, { delay: 5 })
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500) // a person needs at least that long to aim at the next label
}

test('barcodes: made on purchase, printed, scanned into a sale, found anywhere, counted', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Barcode Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`${API}${p}`, { headers })).json()
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`${API}${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }

  // settings: prefix BS, Code 128 (default); the next value shows
  await page.goto('/more/settings')
  await page.getByLabel('Shop prefix').fill('BS')
  await page.getByTestId('barcode-save').click()
  await expect(page.getByText('Saved', { exact: true }).first()).toBeVisible()
  await expect(page.getByText(/Next barcode/)).toContainText('BS000001')

  // a purchase makes the barcodes (no click needed)
  const brand = (await get('/catalogue/brands'))[0]
  const model = (await get(`/catalogue/models?brand_id=${brand.id}`))[0]
  const sup = await post('/parties', { name: 'Dealer', phone: '03001111111', kinds: ['supplier'] })
  const pur = await post('/purchases', { kind: 'supplier', party_id: sup.id, devices: [
    { device: { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 800, asking_price: 1000 },
    { device: { imei1: '356938035643809', brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 900, asking_price: 1100 },
  ], paid: 1700 })
  const devs = await get('/devices')
  const a = devs.find((d: { imei1: string }) => d.imei1 === '490154203237518')
  const b = devs.find((d: { imei1: string }) => d.imei1 === '356938035643809')
  expect(a.barcode).toBe('BS000001')
  expect(b.barcode).toBe('BS000002')
  const item = await post('/accessories', { name: 'Type-C cable', category: 'cable', price: 300, opening_qty: 5, opening_cost: 100 })
  expect(item.barcode).toBe('BS000003')

  // the phone's page shows the barcode; the label page carries it and the print is on the timeline
  await page.goto(`/stock/${a.id}`)
  await expect(page.getByTestId('device-barcode')).toContainText('BS000001')
  const label = await page.request.get(`${API}/labels/devices?ids=${a.id}&size=50x30&fields=shop,name,barcode,imei,last4,price`, { headers })
  const html = await label.text()
  expect(html).toContain('BS000001')
  expect(html).toContain('IMEI …7518')
  expect(html).toContain('@page{size:50mm 30mm')
  await page.reload()
  await expect(page.getByText(/label printed/i).first()).toBeVisible()
  void pur

  // the sale screen: scanning adds the phone with its asking price; the item twice = qty 2
  await page.goto('/sale/new')
  await scan(page, 'BS000001')
  await expect(page.getByText('490154203237518')).toBeVisible()
  await expect(page.getByLabel('Sold for (Rs)')).toHaveValue('1000')
  await scan(page, 'BS000003')
  await scan(page, 'BS000003')
  await expect(page.getByText('Type-C cable')).toBeVisible()
  await expect(page.getByLabel('Qty').first()).toHaveValue('2')
  await page.screenshot({ path: 'test-results/barcode-sale.png', fullPage: true })
  // an unknown code: clear message with "Add it"
  await scan(page, 'NOPE-999')
  await expect(page.getByTestId('scan-note')).toContainText('Item not found')
  await expect(page.getByTestId('scan-note').getByRole('button', { name: 'Add it' })).toBeVisible()
  // complete the sale
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible({ timeout: 15_000 })

  // a sold phone scanned again on the sale screen: its status, with history / return offered
  await page.goto('/sale/new')
  await scan(page, 'BS000001')
  await expect(page.getByTestId('scan-note')).toContainText('not in stock')
  await expect(page.getByTestId('scan-note').getByRole('button', { name: 'Return' })).toBeVisible()

  // anywhere (Home): a scan opens the phone's history; IMEI 1 works as well as our code
  await page.goto('/')
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300) // nobody scans while the screen is still drawing
  await scan(page, '356938035643809')
  await expect(page).toHaveURL(new RegExp(`/stock/${b.id}$`))
  await expect(page.getByTestId('device-barcode')).toContainText('BS000002')
  await page.goto('/')
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300) // nobody scans while the screen is still drawing
  await scan(page, 'BS000002')
  await expect(page).toHaveURL(new RegExp(`/stock/${b.id}$`))

  // slow typing on Home is a search, not a scan
  await page.goto('/')
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(300) // nobody scans while the screen is still drawing
  await page.keyboard.type('BS00', { delay: 150 })
  await page.waitForTimeout(300)
  await expect(page).toHaveURL(/\/$/)

  // stock count: B scanned, A (sold) unexpected, nothing missing
  await page.goto('/stock/count')
  await scan(page, 'BS000002')
  await scan(page, 'BS000001')
  await scan(page, 'XX-404')
  await expect(page.getByText('3', { exact: true }).first()).toBeVisible()
  await page.getByTestId('count-run').click()
  const res = page.getByTestId('count-result')
  await expect(res).toContainText('Found')
  await expect(page.getByText('Should not be here').first()).toBeVisible()
  await expect(page.getByText('XX-404')).toBeVisible()
  await page.screenshot({ path: 'test-results/barcode-count.png', fullPage: true })

  // settings: test scan box reads the printed label's code
  await page.goto('/more/settings')
  await page.getByTestId('test-scan').fill('BS000002')
  await page.getByTestId('test-scan').press('Enter')
  await expect(page.getByTestId('test-scan-result')).toContainText('356938035643809')
})
