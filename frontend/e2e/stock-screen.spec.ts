/** Owner brief 2026-11-10 (ADR-059): the stock screen's kind tabs and status cards. Five phones —
 *  three ready, one with a customer for approval, one waiting for its ID check — show On hand 5 and
 *  Available 3; the Available card lists the three; the filter comes back after opening a phone. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const IMEIS = [1, 2, 3, 4, 5].map((n) => `35693803564${String(n).padStart(4, '0')}`)

test('stock cards, filters kept, kind tabs', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Stock Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const ids: string[] = []
  for (const [i, imei] of IMEIS.entries()) {
    const r = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: imei, brand_id: nokia.id, model_id: models[0].id, condition: i < 4 ? 'box_pack' : 'used', pta_status: 'pta_approved', cost_price: 100000, asking_price: 120000 } })
    expect(r.ok(), await r.text()).toBeTruthy()
    ids.push((await r.json()).id)
  }
  const cus = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Ali', phone: '03211111111', kinds: ['customer'] } })).json()).id
  expect((await request.post(`/api/v1/devices/${ids[3]}/events`, { headers: h, data: { type: 'approval_out', party_id: cus } })).ok()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/stock')

  await expect(page.getByTestId('card-available')).toContainText('3')
  await expect(page.getByTestId('card-available')).toContainText('On hand 5')
  await expect(page.getByTestId('card-approval')).toContainText('1')
  await expect(page.getByTestId('card-inspection')).toContainText('1')
  await page.screenshot({ path: 'test-results/stock-cards.png', fullPage: true })

  // the Available card filters the list to the three sellable units
  await page.getByTestId('view-list').click()
  await page.getByTestId('card-available').click()
  await expect(page.getByText('3 phones')).toBeVisible()
  // open one and come back: the filter is still on
  await page.getByTestId('stock-list').getByRole('button').first().click()
  await expect(page).toHaveURL(/\/stock\/[0-9a-f-]+/)
  await page.goBack()
  await expect(page.getByTestId('card-available')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText('3 phones')).toBeVisible()

  // Spare parts opens the items list with that kind
  await page.getByTestId('kind-part').click()
  await expect(page).toHaveURL(/\/accessories\?category=part/)
  await expect(page.getByTestId('acc-category')).toBeVisible()
})
