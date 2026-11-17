/** Owner 2026-11-18 (ADR-097): a returned phone with its reason; the returns report (totals, why,
 *  who, every detail), the count on Home, the card on Business overview and the Shop Audit tab. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('return with a reason, then the returns report everywhere', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Return Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Return Dealer', phone: '03219995555', kinds: ['supplier'] } })).json()).id
  const buyer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Return Buyer', phone: '03219996666', kinds: ['customer'] } })).json()).id
  const code = imei(`35693803577${String(Date.now()).slice(-3)}`)
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, paid: 10000, method: 'cash', devices: [{ device: { imei1: code, brand_id: b.id, model_id: ms[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 10000, asking_price: 13000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id
  const sale = await request.post('/api/v1/sales', { headers: h, data: { party_id: buyer, devices: [{ device_id: dev, price: 13000 }], paid: 13000 } })
  expect(sale.ok(), await sale.text()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })

  // the return: the phone, hand back 12,500 (cut 500), reason "Fault in the phone"
  await page.goto(`/return/new?device=${dev}`)
  await page.getByLabel('Give back to customer (Rs)').fill('12500')
  await page.getByTestId('why-fault').click()
  await expect(page.getByTestId('why-fault')).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Take it back' }).click()
  // what comes next is offered on the done screen
  await expect(page.getByTestId('return-sell-another')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('return-mark-faulty')).toBeVisible()
  await page.getByTestId('return-see-all').click()
  await expect(page).toHaveURL(/\/returns$/)

  // the report: totals, why, who, the row and all its details
  const rep = page.getByTestId('returns-report')
  await expect(rep.getByTestId('ret-tab-sale')).toContainText('1')
  await expect(rep.getByTestId('ret-tiles')).toContainText('13,000')
  await expect(rep.getByTestId('ret-tiles')).toContainText('12,500')
  await expect(rep.getByTestId('ret-net')).toContainText('2,500')
  await expect(rep.getByTestId('ret-rate')).toContainText('Of 1 phones sold, 1 came back (100%)')
  await expect(rep).toContainText('Fault in the phone')
  await page.screenshot({ path: 'test-results/returns-report.png', fullPage: true })
  await rep.getByTestId('ret-row').getByRole('button').first().click()
  const det = page.getByTestId('ret-detail')
  await expect(det).toContainText('Return Buyer')
  await expect(det).toContainText('03219996666')
  await expect(det).toContainText('the same day')
  await expect(det).toContainText(code)
  await expect(det).toContainText('In stock')
  await expect(det).toContainText('Owner')
  await page.screenshot({ path: 'test-results/returns-detail.png', fullPage: true })
  await page.keyboard.press('Escape')

  // Home counts it, the overview has a card, the Shop Audit has a tab
  await page.goto('/')
  await expect(page.getByText('Phones returned (this month)').first()).toBeVisible({ timeout: 20_000 })
  await page.goto('/overview')
  await expect(page.getByTestId('ov-returns')).toContainText('1 returns · 1 phones')
  await expect(page.getByTestId('ov-returns')).toContainText('12,500')
  await page.getByTestId('ov-returns').getByRole('link', { name: 'View details' }).click()
  await expect(page).toHaveURL(/\/returns\?from=/)
  await page.goto('/audit/returns?preset=today')
  await expect(page.getByTestId('returns-report').getByTestId('ret-tiles')).toContainText('13,000')

  // "sell another phone to this customer" opens the sale form on him
  await page.goto(`/sale/new?party=${buyer}`)
  // the returned phone is back in stock; pick it and the customer is already chosen on the next step
  await page.getByText(code).first().click()
  await expect(page.getByText('Return Buyer').first()).toBeVisible({ timeout: 15_000 })
})
