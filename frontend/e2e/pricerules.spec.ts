/** Owner (2026-10-30): asking-price audit trail and salesman fraud prevention on the screens.
 *  Vivo bought for 35,000, asking 40,000. At the sale the owner revises the asking to 45,000 and sells
 *  at 45,000: the confirmation shows it, the phone page keeps the first 40,000, the Prices report
 *  lists the change. Then a salesman tries to sell a second phone under the asking price: blocked by
 *  the "owner PIN" rule until the owner's PIN is typed, and the approval is on the report. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const OWNER = phone()
const SALESMAN = phone()

test('asking price revised at checkout, original kept; salesman needs the owner PIN', async ({ page }) => {
  test.setTimeout(120_000)
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Vivo Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(OWNER)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Vivo') ?? (await get('/catalogue/brands'))[0]
  const model = (await get(`/catalogue/models?brand_id=${brand.id}`))[0]
  const a = await post('/parties', { name: 'Customer A', phone: '03001111111', kinds: ['customer'] })
  const b = await post('/parties', { name: 'Customer B', phone: '03002222222', kinds: ['customer'] })
  const buy = async (imei: string) => {
    const pur = await post('/purchases', { kind: 'walk_in', party_id: a.id, devices: [{ device: { imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'used', pta_status: 'pta_approved' }, cost: 35000, asking_price: 40000 }], paid: 35000 })
    const id = pur.lines[0].device_id
    await post(`/devices/${id}/verification/override`, { reason: 'known' })
    return id as string
  }
  const dev1 = await buy('490154203237518')
  const dev2 = await buy('358812091717195')
  // the owner's quick PIN (More → Staff would do the same)
  const r = await page.request.put('http://localhost:8000/api/v1/me/pin', { headers, data: { password: 'e2e-secret-1', pin: '4321' } })
  expect(r.ok(), await r.text()).toBeTruthy()
  await post('/staff', { name: 'Ali', phone: SALESMAN, password: 'secret123', role: 'salesman' })

  // ---- the owner sells the Vivo: asking 40,000 shown, revised to 45,000 with a reason, sold at 45,000
  await page.goto(`/sale/new?device=${dev1}`)
  await expect(page.getByText('Asking: 40,000')).toBeVisible()
  await page.getByLabel('Update asking price').check()
  await page.getByLabel('Asking now').fill('45000')
  await page.getByLabel('Reason').fill('market rate')
  await expect(page.getByText('Asking: 45,000')).toBeVisible()
  await page.getByLabel('Sold for (Rs)').fill('45000')
  await page.getByRole('button', { name: 'Complete sale' }).click()
  const confirm = page.getByTestId('sale-confirm')
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText('Rs. 45,000')
  await expect(confirm).toContainText('Asking changed 40,000 → 45,000')
  await expect(confirm).toContainText('market rate')
  await expect(confirm).toContainText('35,000') // the cost: owner only
  await page.screenshot({ path: 'test-results/price-confirm.png', fullPage: true })
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()
  await expect(page.getByText('Rs. 45,000').first()).toBeVisible()

  // ---- the phone's history: first asking 40,000 stays, final 45,000, sold 45,000, margin 10,000
  await page.goto(`/stock/${dev1}`)
  const tiles = page.getByTestId('unit-tiles')
  await expect(tiles).toContainText('Asking now')
  await expect(tiles).toContainText('45,000')
  await expect(tiles).toContainText('First asking')
  await expect(tiles).toContainText('40,000')
  await expect(tiles).toContainText('10,000')
  const timeline = page.locator('.card.p-0').last()
  await expect(timeline).toContainText('Price changed')
  await expect(timeline).toContainText('40,000 → 45,000')
  await expect(timeline).toContainText('at the sale')
  await expect(timeline).toContainText('market rate')
  await page.screenshot({ path: 'test-results/price-history.png', fullPage: true })
  const hist = await get(`/devices/${dev1}/history`)
  expect(hist[0].type).toBe('purchased')
  expect(hist[0].data.asking).toBe('40000.00')
  const money = await get(`/devices/${dev1}/money`)
  expect(money.summary.original_asking).toBe('40000.00')
  expect(money.summary.asking_price).toBe('45000.00')
  expect(money.summary.sold_for).toBe('45000.00')

  // ---- the owner's Prices report
  await page.goto('/reports')
  await page.getByRole('button', { name: 'Prices', exact: true }).click()
  const rows = page.getByTestId('price-rows')
  await expect(rows).toContainText('Asking changed at sale')
  await expect(rows).toContainText('40,000 → 45,000')
  await expect(rows).toContainText('Owner')
  await expect(rows).toContainText('490154203237518')

  // ---- settings: both rules to "With owner PIN"
  await page.goto('/more/settings')
  const card = page.locator('section', { hasText: 'Price rules' }).first()
  await expect(card).toBeVisible()
  await card.getByRole('button', { name: 'With owner PIN' }).nth(0).click()
  await card.getByRole('button', { name: 'With owner PIN' }).nth(1).click()
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.getByRole('button', { name: 'Saved', exact: true })).toBeVisible()
  expect((await get('/shops/current')).sale_rules).toEqual({ below_asking: 'pin', asking_change: 'pin' })

  // ---- the salesman: 38,000 for a 40,000 phone needs the owner's PIN
  await page.evaluate(() => localStorage.removeItem('mobileshop.auth'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(SALESMAN)
  await page.getByLabel('Password').fill('secret123')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto(`/sale/new?device=${dev2}`)
  await expect(page.getByText('Asking: 40,000')).toBeVisible()
  await page.getByLabel('Sold for (Rs)').fill('38000')
  await expect(page.getByText('under asking').first()).toBeVisible()
  await page.getByRole('button', { name: 'Complete sale' }).click()
  const c2 = page.getByTestId('sale-confirm')
  await expect(c2).toContainText('Rs. 2,000 under the asking price')
  await expect(c2).not.toContainText('35,000') // no cost for a salesman
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(c2.getByLabel('Owner PIN')).toBeVisible()
  await expect(c2).toContainText(/The owner.s PIN is needed/)
  await c2.getByLabel('Owner PIN').fill('0000')
  await page.getByRole('button', { name: 'Confirm with PIN' }).click()
  await expect(c2).toContainText('Wrong PIN')
  await c2.getByLabel('Owner PIN').fill('4321')
  await page.screenshot({ path: 'test-results/price-pin.png', fullPage: true })
  await page.getByRole('button', { name: 'Confirm with PIN' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  // ---- the owner reads who sold under the asking price, and who approved it
  await page.evaluate(() => localStorage.removeItem('mobileshop.auth'))
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(OWNER)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/reports')
  await page.getByRole('button', { name: 'Prices', exact: true }).click()
  const rows2 = page.getByTestId('price-rows')
  await expect(rows2).toContainText('Sold under asking')
  await expect(rows2).toContainText('Ali')
  await expect(rows2).toContainText('approved by owner: Owner')
  await expect(rows2).toContainText('358812091717195')
  await expect(page.getByText('1 under asking')).toBeVisible()
  await page.screenshot({ path: 'test-results/price-report.png', fullPage: true })
  const rep = await get('/reports/price-changes')
  expect(rep.rows.map((x: { kind: string }) => x.kind).sort()).toEqual(['asking_changed', 'below_asking'])
})
