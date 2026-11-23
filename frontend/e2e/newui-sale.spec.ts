/** ADR-134: Sell (F2) in the new product, drawn from `14-sale-pos-full.html` (+ 15's extras). It
 *  posts what the live sale posts and keeps its rules: udhaar needs a khata customer, cost and
 *  profit only for those the server sends cost to (with the file's hide switch), held bills. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

test('new product: the counter sells for cash and on udhaar, holds a bill, and hides cost', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'POS Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const ids: string[] = []
  for (const [imei, cost] of [['490154203237518', 4000], ['356938035643809', 6000], ['352099001761481', 5000]] as const) {
    const r = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: imei, brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: cost, asking_price: cost + 1000 } })
    expect(r.ok(), await r.text()).toBeTruthy()
    ids.push((await r.json()).id)
  }
  expect((await request.post('/api/v1/accessories', { headers: h, data: { name: 'Fast Charger', category: 'charger', price: 800, opening_qty: 10, opening_cost: 450 } })).ok()).toBeTruthy()
  const cust = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Khata Wala', phone: '03215550001', kinds: ['customer'] } })).json()

  const login = async (phone: string, pw: string) => {
    await page.goto('/login')
    await page.getByLabel('Mobile number').fill(phone.slice(1))
    await page.getByLabel('Password').fill(pw)
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })
  }
  await login(ph, 'e2e-secret-1')
  await page.goto('/new/sale/new')
  await expect(page.getByTestId('npos')).toBeVisible()
  await expect(page.getByTestId('npos-rail')).toBeVisible()
  // the stock as cards with kind tabs and counts
  await expect(page.getByTestId('npos-card')).toHaveCount(3)
  await expect(page.getByTestId('npos-item-card')).toHaveCount(1)
  await expect(page.getByTestId('npos-cat-all')).toContainText('4')
  await expect(page.getByTestId('npos-cat-items')).toContainText('1')
  await page.getByTestId('npos-cat-items').click()
  await expect(page.getByTestId('npos-card')).toHaveCount(0)
  await page.getByTestId('npos-cat-all').click()
  await page.screenshot({ path: 'test-results/newui-sale-empty.png' })

  // 1) a cash sale: a phone and two chargers
  const card = page.getByTestId('npos-card').filter({ hasText: '490154203237518' })
  await expect(card.getByTestId('npos-card-cost')).toHaveText('Cost: Rs. 4,000')
  await card.click()
  await expect(card).toHaveAttribute('aria-pressed', 'true')
  await page.getByTestId('npos-item-card').click()
  await page.getByTestId('npos-item-card').click()
  const lines = page.getByTestId('npos-line')
  await expect(lines).toHaveCount(2)
  await expect(lines.first().getByTestId('npos-deal')).toHaveValue('5000')
  await expect(lines.first().getByTestId('npos-margin')).toHaveText('Cost: Rs. 4,000 (+1,000)')
  await expect(lines.nth(1).getByTestId('npos-qty')).toHaveText('2')
  await expect(page.getByTestId('npos-net')).toHaveText('Rs. 6,600')
  await expect(page.getByTestId('npos-profit')).toContainText('+Rs. 1,700') // 1,000 + 2 × 350
  await lines.first().getByTestId('npos-warranty').selectOption('7')
  // the hide switch takes cost and profit off the screen
  await page.getByTestId('npos-cost-toggle').click()
  await expect(page.getByTestId('npos-card-cost')).toHaveCount(0)
  await expect(page.getByTestId('npos-profit')).toHaveCount(0)
  await page.getByTestId('npos-cost-toggle').click()
  await page.getByTestId('npos-buyer').fill('Ali')
  await page.screenshot({ path: 'test-results/newui-sale-bill.png' })
  await page.getByTestId('npos-complete').click()
  await expect(page.getByTestId('npos-confirm')).toBeVisible()
  await page.getByTestId('npos-confirm-go').click()
  await expect(page.getByTestId('npos-receipt')).toBeVisible()
  await expect(page.getByTestId('npos-invoice-no')).toContainText('INV-')
  await page.screenshot({ path: 'test-results/newui-sale-receipt.png' })
  expect((await get(`/devices/${ids[0]}`)).status).toBe('sold')
  await page.getByTestId('npos-new-sale').click()
  await expect(page.getByTestId('npos-card')).toHaveCount(2)

  // 2) udhaar needs a khata customer; the khata box says what the khata becomes
  await page.getByTestId('npos-card').filter({ hasText: '356938035643809' }).click()
  await page.getByTestId('npos-mode-udhaar').click()
  await expect(page.getByTestId('npos-khata')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('npos-complete')).toBeDisabled()
  await expect(page.getByTestId('npos-need-khata')).toBeVisible()
  await page.getByTestId('npos-party-search').fill('Khata')
  await page.getByTestId('npos-party-list').getByText('Khata Wala').click()
  await expect(page.getByTestId('npos-khata-new')).toHaveText('Rs. 7,000')
  await page.getByTestId('npos-complete').click()
  await page.getByTestId('npos-confirm-go').click()
  await expect(page.getByTestId('npos-receipt')).toBeVisible()
  expect(Number((await get(`/parties/${cust.id}`)).balance)).toBe(7000)
  await page.getByTestId('npos-new-sale').click()

  // 3) a bill is held, the next customer served, then it is taken up again
  await page.getByTestId('npos-card').filter({ hasText: '352099001761481' }).click()
  await page.getByTestId('npos-hold').click()
  await expect(page.getByTestId('npos-toast')).toBeVisible()
  await expect(page.getByTestId('npos-line')).toHaveCount(0)
  await expect(page.getByTestId('npos-held-count')).toHaveText('1')
  await page.getByTestId('npos-held-open').click()
  await page.getByTestId('npos-resume').click()
  await expect(page.getByTestId('npos-line')).toHaveCount(1)
  await expect(page.getByTestId('npos-held-count')).toHaveText('0')

  // 4) a salesman: the same counter, no cost anywhere, no hide switch, no profit
  const sm = `034${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  expect((await request.post('/api/v1/staff', { headers: h, data: { name: 'Sales', phone: sm, password: 'e2e-secret-2', role: 'salesman' } })).ok()).toBeTruthy()
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); localStorage.setItem('locale', 'en') })
  await login(sm, 'e2e-secret-2')
  await page.goto('/new/sale/new')
  await expect(page.getByTestId('npos-card')).toHaveCount(1)
  await expect(page.getByTestId('npos-card-cost')).toHaveCount(0)
  await expect(page.getByTestId('npos-cost-toggle')).toHaveCount(0)
  await page.getByTestId('npos-card').first().click()
  await expect(page.getByTestId('npos-margin')).toHaveCount(0)
  await expect(page.getByTestId('npos-profit')).toHaveCount(0)

  // a phone: no sideways scroll
  await page.setViewportSize({ width: 390, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})
