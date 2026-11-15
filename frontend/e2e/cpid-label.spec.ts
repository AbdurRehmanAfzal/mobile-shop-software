/** Owner 2026-11-15 (ADR-083): the shop picks its own mark for CP ID phones; the app and the reports
 *  show it instead of "CP ID". The home screen's profit card shows a rising (or falling) trend. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('CP ID under the shop mark', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Mark Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Mark Dealer', phone: '03217774444', kinds: ['supplier'] } })).json()).id
  const pr = await (await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: imei(`35693803596${String(Date.now()).slice(-3)}`), brand_id: b.id, model_id: ms[0].id, condition: 'used', pta_status: 'cpid' }, cost: 10000, asking_price: 12000 }] } })).json()
  const devId = pr.lines[0].device_id

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.screenshot({ path: 'test-results/home-profit.png' })

  await page.goto(`/stock/${devId}`)
  await expect(page.getByText('CP ID', { exact: true }).first()).toBeVisible()

  // Settings: pick ★ and save
  await page.goto('/more/settings')
  await page.getByTestId('cpid-marks').getByRole('button', { name: '★' }).click()
  await expect(page.getByTestId('cpid-label')).toHaveValue('★')
  await page.getByTestId('cpid-marks').locator('xpath=following::button[normalize-space()="Save"][1]').click()
  await expect.poll(async () => (await (await request.get('/api/v1/shops/current', { headers: h })).json()).device_prefs?.cpid_label).toBe('★')

  // the phone's page and the reports show ★
  await page.goto(`/stock/${devId}`)
  await expect(page.getByText('★', { exact: true }).first()).toBeVisible()
  await expect(page.getByText('CP ID', { exact: true })).toHaveCount(0)
  const tally = await (await request.get('/api/v1/exports/stock-tally?format=pdf&lang=en', { headers: h })).text()
  expect(tally).toContain('★')
  expect(tally).not.toContain('CP ID')
})
