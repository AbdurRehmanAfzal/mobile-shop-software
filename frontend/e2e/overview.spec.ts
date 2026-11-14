/** Owner 2026-11-14 (ADR-076): the business overview — every figure on one screen, each with View details. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('business overview', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Overview Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Overview Dealer', phone: '03219992222', kinds: ['supplier'] } })).json()).id
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, paid: 4000, method: 'cash', devices: [{ device: { imei1: imei(`35693803575${String(Date.now()).slice(-3)}`), brand_id: b.id, model_id: ms[0].id, condition: 'used', pta_status: 'pta_approved' }, cost: 10000, asking_price: 13000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()

  const ov = await (await request.get('/api/v1/reports/overview', { headers: h })).json()
  expect(Number(ov.purchases.total)).toBe(10000)
  expect(ov.people.new_dealers).toBe(1)

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.getByTestId('home-overview').click()
  await expect(page).toHaveURL(/\/overview$/)
  await expect(page.getByTestId('ov-purchases')).toContainText('10,000')
  await expect(page.getByTestId('ov-give')).toContainText('Overview Dealer')
  await expect(page.getByTestId('ov-alerts')).toBeVisible()
  await page.screenshot({ path: 'test-results/overview.png', fullPage: true })
  // View details opens the screen behind the card
  await page.getByTestId('ov-purchases').getByRole('link', { name: 'View details' }).click()
  await expect(page).toHaveURL(/\/purchases$/)
  await page.goBack()
  await page.getByTestId('ov-give').getByRole('link', { name: 'Overview Dealer' }).click()
  await expect(page).toHaveURL(/\/parties\//)
})
