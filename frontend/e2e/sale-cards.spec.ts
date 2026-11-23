/** ADR-132 (docs/43 mock-ups 14 and 15): on the sale the stock is a card per piece — what it is, its
 *  marks, its IMEI, the asking price and, for a login that may see it, the cost — with quick ticks
 *  that hide cards. A tap still puts the phone on the bill; a salesman sees no cost. */

import { expect, test } from '@playwright/test'

test('sale: stock cards, quick ticks, cost only for those who may see it', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Cards Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const add = (imei: string, condition: string, cost: number) => request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: imei, brand_id: nokia.id, model_id: model.id, condition, pta_status: 'pta_approved', cost_price: cost, asking_price: cost + 1000 } })
  expect((await add('490154203237518', 'box_pack', 4000)).ok()).toBeTruthy()
  expect((await add('356938035643809', 'used', 6000)).ok()).toBeTruthy()
  const sm = `034${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  expect((await request.post('/api/v1/staff', { headers: h, data: { name: 'Sales', phone: sm, password: 'e2e-secret-2', role: 'salesman' } })).ok()).toBeTruthy()

  const login = async (phone: string, password: string) => {
    await page.goto('/login')
    await page.getByLabel('Mobile number').fill(phone)
    await page.getByLabel('Password').fill(password)
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })
  }
  await login(ph, 'e2e-secret-1')
  // the sale the shops know: rows, no ticks, no cost line
  await page.goto('/sale/new')
  await expect(page.getByTestId('sale-card')).toHaveCount(0)
  await expect(page.getByTestId('sale-ticks')).toHaveCount(0)
  await expect(page.getByText('490154203237518')).toBeVisible()
  await page.goto('/more/appearance')
  await page.getByTestId('look-layout-counter').click() // ADR-133: the mock-ups' version is the "New design"
  await page.goto('/sale/new')
  const cards = page.getByTestId('sale-card')
  await expect(cards).toHaveCount(2)
  await expect(page.getByTestId('sale-shown')).toContainText('2 to sell')
  await expect(cards.filter({ hasText: '490154203237518' })).toContainText('Rs. 5,000')
  await expect(cards.filter({ hasText: '490154203237518' }).getByTestId('sale-card-cost')).toHaveText('Cost Rs. 4,000')
  // the ticks only hide cards
  await page.getByTestId('sale-tick-boxPack').click()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText('490154203237518')
  await page.getByTestId('sale-tick-idPending').click()
  await expect(page.getByText('Nothing matches these ticks')).toBeVisible()
  await page.getByTestId('sale-tick-idPending').click()
  await page.getByTestId('sale-tick-boxPack').click()
  await expect(cards).toHaveCount(2)
  await page.screenshot({ path: 'test-results/sale-cards-phone.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

  // a laptop: the cards beside the bill; a tap puts the phone on the bill and marks its card
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/sale/new')
  await cards.filter({ hasText: '356938035643809' }).click()
  await expect(page.getByLabel('Sold for')).toHaveValue('7000')
  await expect(cards.filter({ hasText: '356938035643809' })).toHaveAttribute('aria-pressed', 'true')
  await expect(cards.filter({ hasText: '490154203237518' })).toHaveAttribute('aria-pressed', 'false')
  // the line says what this piece cost and earns; a price under the cost says what it loses
  await expect(page.getByTestId('line-margin')).toHaveText('Cost Rs. 6,000 · this one earns Rs. 1,000')
  await page.getByLabel('Sold for').fill('5500')
  await expect(page.getByTestId('line-margin')).toHaveText('Cost Rs. 6,000 · this one loses Rs. 500')
  await page.getByLabel('Sold for').fill('7000')
  // the buyer is asked first on a laptop, and the total with its buttons stays in view
  const box = await page.getByTestId('customer-box').boundingBox()
  const price = await page.getByLabel('Sold for').boundingBox()
  expect(box!.y).toBeLessThan(price!.y)
  await expect(page.getByTestId('sale-foot')).toBeInViewport()
  await expect(page.getByTestId('sale-foot')).toContainText('Rs. 7,000')
  await page.screenshot({ path: 'test-results/sale-cards-laptop.png', fullPage: true })

  // the owner leaves a half-filled bill and logs out; a salesman logs in on the same tab: the bill
  // is gone (it held the phone's cost), the cards are the same and carry no cost
  await page.setViewportSize({ width: 412, height: 900 })
  await page.getByRole('button', { name: 'Profile' }).click()
  await page.getByTestId('profile-logout').click()
  await expect(page).toHaveURL(/\/(login|welcome)/)
  await login(sm, 'e2e-secret-2')
  await page.goto('/sale/new')
  await expect(cards).toHaveCount(2)
  await expect(page.getByTestId('sale-card-cost')).toHaveCount(0)
  await expect(page.getByLabel('Sold for')).toHaveCount(0)
  await cards.filter({ hasText: '490154203237518' }).click()
  await expect(page.getByLabel('Sold for')).toHaveValue('5000')
  await expect(page.getByTestId('line-margin')).toHaveCount(0)
})
