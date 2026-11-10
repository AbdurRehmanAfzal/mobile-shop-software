/** Owner 2026-11-10: a phone's page in several styles — Classic (as before), Smart, Tabs, Tiles,
 *  Compact — each with the actions beside the values; the choice is kept. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const IMEI = '356938035641234'

test('device page styles', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Style Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Bilal Traders', phone: '03213333333', kinds: ['supplier'] } })).json()).id
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: IMEI, brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved', location: 'Rack A2' }, cost: 20000, asking_price: 25000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto(`/stock/${dev}`)

  // Classic is the page as before
  await expect(page.getByTestId('dstyle-classic')).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('Actions').first()).toBeVisible()

  // Smart: each fact with its action; the dealer with what is owed and Pay
  await page.getByTestId('dstyle-smart').click()
  await expect(page.getByTestId('dl-row-imei')).toContainText(IMEI)
  await expect(page.getByTestId('dl-row-shelf')).toContainText('Rack A2')
  await expect(page.getByTestId('dl-bought')).toContainText('Bilal Traders')
  await expect(page.getByTestId('dl-bought')).toContainText('20,000')
  await page.screenshot({ path: 'test-results/style-smart.png', fullPage: true })
  await page.getByTestId('dl-row-price').getByRole('button', { name: 'Change asking price' }).click()
  await expect(page.getByLabel('Asking price')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.getByTestId('dl-pay').click()
  await expect(page.getByLabel('Amount', { exact: true })).toHaveValue('20000')
  await page.getByRole('button', { name: 'Close' }).click()

  // Tabs
  await page.getByTestId('dstyle-tabs').click()
  await page.getByTestId('dl-tab-people').click()
  await expect(page.getByTestId('dl-bought')).toBeVisible()
  await page.screenshot({ path: 'test-results/style-tabs.png', fullPage: true })

  // Tiles: a tile opens its action
  await page.getByTestId('dstyle-tiles').click()
  await page.getByTestId('dl-tile-price').click()
  await expect(page.getByLabel('Asking price')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await page.screenshot({ path: 'test-results/style-tiles.png', fullPage: true })

  // Compact, remembered after a reload
  await page.getByTestId('dstyle-compact').click()
  await expect(page.getByTestId('dl-main')).toBeVisible()
  await page.screenshot({ path: 'test-results/style-compact.png', fullPage: true })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('dstyle-compact')).toHaveAttribute('aria-checked', 'true')
  await page.getByTestId('dl-main').click()
  await expect(page).toHaveURL(/\/sale\/new\?device=/)
})
