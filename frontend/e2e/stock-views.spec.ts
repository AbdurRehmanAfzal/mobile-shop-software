/** Owner (2026-11-09): the stock can be shown as cards, an Excel-style table, a grid or a list;
 *  the table sorts by a column and adds up the prices; the choice is remembered. */

import { expect, test } from '@playwright/test'

test.setTimeout(120_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('stock views: table sorts and totals, grid, list, choice kept', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Views Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const body = await s.json()
  const h = { Authorization: `Bearer ${body.tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  for (const [imei, cost, asking] of [['490154203237518', 800, 1000], ['356938035643809', 1500, 2500]] as const) {
    const r = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: imei, brand_id: nokia.id, model_id: models[0].id, condition: 'used', pta_status: 'pta_approved', cost_price: cost, asking_price: asking } })
    expect(r.ok(), await r.text()).toBeTruthy()
  }

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/stock')

  await page.getByTestId('view-table').click()
  const table = page.getByTestId('stock-table')
  await expect(table.locator('tbody tr')).toHaveCount(2)
  await expect(table.locator('tfoot')).toContainText('3,500')
  await expect(table.locator('tfoot')).toContainText('2,300')
  // sort by asking price, low → high, then high → low
  await table.getByRole('button', { name: 'Asking' }).click()
  await expect(table.locator('tbody tr').first()).toContainText('490154203237518')
  await table.getByRole('button', { name: 'Asking' }).click()
  await expect(table.locator('tbody tr').first()).toContainText('356938035643809')
  await page.screenshot({ path: 'test-results/stock-table.png', fullPage: true })

  await page.getByTestId('view-grid').click()
  await expect(page.getByTestId('stock-grid').locator('button')).toHaveCount(2)
  await page.getByTestId('view-list').click()
  await expect(page.getByTestId('stock-list')).toContainText('356938035643809')

  // owner 2026-11-09: pick the fields; the table, the list and the download follow them
  await page.getByTestId('view-table').click()
  await page.getByTestId('stock-fields').click()
  await page.getByTestId('field-imei').click()
  await page.getByTestId('field-colour').click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(table.getByRole('button', { name: 'IMEI', exact: true })).toHaveCount(0)
  await expect(table.getByRole('button', { name: 'Asking' })).toBeVisible()
  const req = page.waitForRequest((r) => r.url().includes('/api/v1/exports/stock') && r.url().includes('format=xlsx'))
  await page.getByRole('button', { name: 'Download' }).click()
  await page.getByRole('button', { name: /Excel/ }).click()
  const url = decodeURIComponent((await req).url())
  expect(url).toContain('cols=name,storage,condition')
  expect(url).not.toContain('imei')
  expect(url).toContain('sort=asking')
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByTestId('view-list').click()
  await expect(page.getByTestId('stock-list')).not.toContainText('356938035643809')
  await page.getByTestId('stock-fields').click()
  await page.getByRole('button', { name: 'Back to default' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('stock-list')).toContainText('356938035643809')

  // remembered after a reload
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('view-list')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('view-table').click()
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.screenshot({ path: 'test-results/stock-table-wide.png', fullPage: true })
})
