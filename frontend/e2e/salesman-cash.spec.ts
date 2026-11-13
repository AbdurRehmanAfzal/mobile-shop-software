/** Owner 2026-11-13 (ADR-072): a salesman sees only today's cash in hand and bank — no galla /
 *  bank totals, no other days. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('salesman: today only', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const sp = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Today Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const st = await request.post('/api/v1/staff', { headers: h, data: { name: 'Salesman', phone: sp, password: 'e2e-secret-2', role: 'salesman' } })
  expect(st.ok(), await st.text()).toBeTruthy()
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Today Dealer', phone: '03217770001', kinds: ['supplier'] } })).json()).id
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [
    { device: { imei1: '356938035652222', brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 500, asking_price: 1000 },
    { device: { imei1: '356938035652230', brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 500, asking_price: 2000 },
  ] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const [d1, d2] = (await pr.json()).lines.map((l: { device_id: string }) => l.device_id)
  await request.post('/api/v1/sales', { headers: h, data: { devices: [{ device_id: d1, price: 1000 }], paid: 1000 } })
  await request.post('/api/v1/sales', { headers: h, data: { devices: [{ device_id: d2, price: 2000 }], paid: 2000, payment: { method: 'online', bank: 'JazzCash' } } })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(sp)
  await page.getByLabel('Password').fill('e2e-secret-2')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // home: today's cash in hand and bank, not the galla + bank total; no period choice
  await expect(page.getByText('Cash in hand today').first()).toBeVisible()
  await expect(page.getByText('Bank / online today:').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/salesman-home.png', fullPage: true })

  // hisaab: today only, even when another day is asked for in the link
  await page.goto('/hisaab?from=2026-01-01&to=2026-01-31')
  await expect(page.getByRole('button', { name: 'This month' })).toHaveCount(0)
  const r = await (await request.get('/api/v1/reports/day?date_from=2026-01-01&date_to=2026-01-31', { headers: h })).json()
  expect(r.date_from).toBe('2026-01-01') // the owner still can
})
