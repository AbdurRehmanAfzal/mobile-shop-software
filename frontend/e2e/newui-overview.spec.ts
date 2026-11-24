/** ADR-134: the business overview in the new product, drawn from `02-business-overview.html`. Every
 *  figure is the server's overview / trends; the tabs show the pulse, udhaar lists (Settle opens the
 *  person's khata), top models and alerts, and the activity feed with all-time totals. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: the business overview — cards, graphs, the four tabs, the eye and the full hisaab, as file 02 draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Overview Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Hall Road Traders', phone: '03215550061', kinds: ['supplier'] })
  const ali = await post('/parties', { name: 'Ali Jaranwala', phone: '03215550062', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const tail = String(Date.now()).slice(-4)
  const dev = (k: number) => ({ device: { imei1: imei(`3569380${tail}06${k}`), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 10000, asking_price: 14000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 5000, method: 'cash', devices: [dev(1), dev(2)] })
  await post('/sales', { party_id: ali.id, devices: [{ device_id: pur.lines[0].device_id, price: 14000 }], paid: 4000 })
  const ov = await get('/reports/overview')
  expect(ov.sales.total).toBe('14000.00')

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/overview')
  await expect(page.getByTestId('nov')).toBeVisible()
  await expect(page.getByTestId('nov-side')).toBeVisible()
  await expect(page.getByTestId('nov-sales-total')).toContainText('14,000')
  await expect(page.getByTestId('nov-sales-profit')).toContainText('4,000')
  await expect(page.getByTestId('nov-get-total')).toContainText('10,000')
  await expect(page.getByTestId('nov-give-total')).toContainText('15,000')
  await expect(page.getByTestId('nov-stock')).toContainText('1')
  await expect(page.getByTestId('nov-graphs')).toBeVisible()
  await expect(page.getByTestId('nov-money')).toContainText('Ali Jaranwala')
  await page.screenshot({ path: 'test-results/newui-overview.png', fullPage: true })

  // the eye hides profit
  await page.getByTestId('nov-eye').click()
  await expect(page.getByTestId('nov-sales-profit')).toContainText('•')
  await page.getByTestId('nov-eye').click()

  // udhaar: both lists; Settle opens the khata
  await page.getByTestId('nov-get').click()
  await expect(page.getByTestId('nov-get-list')).toContainText('Ali Jaranwala')
  await expect(page.getByTestId('nov-give-list')).toContainText('Hall Road Traders')
  await page.getByTestId('nov-uq').fill('hall')
  await expect(page.getByTestId('nov-get-list')).not.toContainText('Ali Jaranwala')

  // top models & alerts, activity & totals
  await page.getByTestId('nov-tab-models').click()
  await expect(page.getByTestId('nov-top-sold')).toContainText(model.name)
  await expect(page.getByTestId('nov-alerts')).toBeVisible()
  await page.getByTestId('nov-tab-activity').click()
  await expect(page.getByTestId('nov-counts')).toContainText('Sales')

  // the full hisaab window
  await page.getByTestId('nov-full').click()
  await expect(page.getByTestId('nov-full-window')).toContainText('14,000')
  await page.getByTestId('nov-full-window').getByRole('button', { name: 'Close' }).click()

  // yesterday: nothing sold
  await page.getByTestId('nov-p-yesterday').click()
  await expect(page.getByTestId('nov-sales-total')).toContainText('0')

  // Settle → the person's khata
  await page.getByTestId('nov-p-today').click()
  await page.getByTestId('nov-tab-udhaar').click()
  await page.getByTestId('nov-uq').fill('')
  await page.getByTestId('nov-get-list').getByTestId('nov-settle').first().click()
  await expect(page).toHaveURL(new RegExp(`/new/parties/${ali.id}$`))

  // Urdu: one language, right to left
  await page.goto('/new/overview')
  await page.getByTestId('nov-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-overview-ur.png', fullPage: true })
})
