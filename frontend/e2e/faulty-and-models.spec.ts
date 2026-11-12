/** Owner 2026-11-12:
 *  1. the stock summary's model opens only that model (iPhone 17 is not iPhone 17 Pro Max);
 *  2. a faulty phone says what is wrong (common faults + the shop's own);
 *  3. a faulty phone stays in the stock list and can be sold (ADR-066). */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('model filter, faults, faulty phone in stock and sold', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Fault Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brand = await (await request.post('/api/v1/catalogue/brands', { headers: h, data: { name: 'Zeta' } })).json()
  const m17 = await (await request.post('/api/v1/catalogue/models', { headers: h, data: { brand_id: brand.id, name: 'Zeta 17' } })).json()
  const mPro = await (await request.post('/api/v1/catalogue/models', { headers: h, data: { brand_id: brand.id, name: 'Zeta 17 Pro Max' } })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Fault Dealer', phone: '03218889999', kinds: ['supplier'] } })).json()).id
  const dev = (imei: string, model: string) => ({ device: { imei1: imei, brand_id: brand.id, model_id: model, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 900, asking_price: 1000 })
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [dev('356938035646662', m17.id), dev('356938035646670', mPro.id), dev('356938035646688', mPro.id)] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const one = (await pr.json()).lines[0].device_id

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // 1. summary → Zeta 17 shows the one Zeta 17, not the two Pro Max
  await page.goto('/stock/summary')
  await page.getByRole('button', { name: /Zeta/ }).first().click()
  await page.getByRole('link', { name: /^Zeta 17\b(?! Pro)/ }).click()
  await expect(page.getByTestId('model-filter')).toContainText('Zeta 17')
  await expect(page.getByText('356938035646662')).toBeVisible()
  await expect(page.getByText('356938035646670')).toHaveCount(0)
  await page.getByTestId('model-filter-clear').click()
  await expect(page.getByText('356938035646670')).toBeVisible()

  // 2. mark it faulty: two common faults and one of the shop's own
  await page.goto(`/stock/${one}`)
  await page.getByTestId('mark-faulty').click()
  await page.getByTestId('fault-camera').click()
  await page.getByTestId('fault-dots').click()
  await page.getByTestId('fault-own').fill('Hinge loose')
  await page.getByTestId('fault-own-add').click()
  await page.screenshot({ path: 'test-results/faults-sheet.png', fullPage: true })
  await page.getByTestId('fault-save').click()
  await expect(page.getByTestId('fault-sheet')).toBeHidden()
  await expect(page.getByTestId('fault-chip').first()).toContainText('Camera, Dots on display, Hinge loose')

  // 3. still in the stock list (default view) with its faults, and it can be sold
  await page.goto('/stock')
  await expect(page.getByText('356938035646662')).toBeVisible()
  await expect(page.getByTestId('fault-chip').first()).toContainText('Camera')
  await page.goto(`/stock/${one}`)
  await page.getByRole('button', { name: 'Sell', exact: true }).first().click()
  await expect(page).toHaveURL(/\/sale\/new\?device=/)
  await expect(page.getByTestId('fault-chip').first()).toContainText('Camera')
  await page.getByTestId('walk-in-tick').check()
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()
  const d = await (await request.get(`/api/v1/devices/${one}`, { headers: h })).json()
  expect(d.status).toBe('sold')
})
