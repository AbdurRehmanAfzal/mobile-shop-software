/** Shop Audit → Reports (docs/17 P10) and the charts (P9): the complete report as a printable
 *  page and as Excel, individual downloads, donuts and lines on the screens. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('report center: complete report (print page + Excel), individual reports, charts present', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Report Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const brand = (await get('/catalogue/brands'))[0]
  const model = (await get(`/catalogue/models?brand_id=${brand.id}`))[0]
  const dev = (imei: string) => ({ imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' })
  const dealer = await post('/parties', { name: 'Dealer', phone: '03005556666', kinds: ['supplier'] })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, devices: [{ device: dev('490154203237518'), cost: 800, asking_price: 1000 }, { device: dev('356938035643809'), cost: 800, asking_price: 1000 }], paid: 0 })
  await post('/sales', { devices: [{ device_id: pur.lines[0].device_id, price: 1000 }], paid: 1000 })

  // charts: lines on P&L, donut on cash, donuts on stock, donut on overview
  await page.goto('/audit?preset=this_month')
  await expect(page.getByTestId('overview-donut')).toBeVisible()
  await page.goto('/audit/finance?preset=this_month&tab=cash')
  await expect(page.getByTestId('cash-donut')).toContainText('Cash')
  await page.goto('/audit/stock')
  await expect(page.getByTestId('inv-donuts')).toContainText('Box pack')
  await page.getByTestId('inv-donuts').getByRole('button', { name: /Box pack/ }).click()
  await expect(page).toHaveURL(/\/stock\?condition=box_pack/)
  await expect(page.getByText('356938035643809')).toBeVisible()

  // the report center
  await page.goto('/audit/reports?preset=this_month')
  const full = page.getByTestId('full-report')
  await expect(full).toContainText('Complete shop audit report')
  await expect(full.getByRole('button', { name: 'Security & fraud' })).toHaveAttribute('aria-pressed', 'true')
  await full.getByRole('button', { name: 'Stock ageing' }).click()
  await expect(full.getByRole('button', { name: 'Stock ageing' })).toHaveAttribute('aria-pressed', 'false')
  await full.getByRole('button', { name: 'Detailed' }).click()
  const [pop] = await Promise.all([page.waitForEvent('popup'), full.getByRole('button', { name: 'Print / PDF' }).click()])
  await pop.waitForLoadState()
  const html = await pop.locator('body').innerText()
  expect(html).toContain('Shop audit report')
  expect(html).toContain('Executive summary')
  expect(html).toContain('Profit & loss by day')
  expect(html).not.toContain('Stock ageing')
  await pop.close()
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30_000 }), full.getByRole('button', { name: 'Excel' }).click()])
  expect(dl.suggestedFilename()).toMatch(/\.xlsx$/)
  await expect(page.getByTestId('individual-reports')).toContainText('Profit & loss')
  await expect(page.getByTestId('individual-reports')).toContainText('Udhaar khata')
  await page.screenshot({ path: 'test-results/audit-reports.png', fullPage: true })
})
