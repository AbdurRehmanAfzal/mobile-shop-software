/** Owner 2026-11-15 (ADR-082): PTA check — copy the IMEI, open PTA's DIRBS (stubbed here, the real
 *  site is never called), and save what PTA said: on a phone in stock, and while buying. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('PTA check on a phone and while buying', async ({ page, context, request }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await context.route('https://dirbs.pta.gov.pk/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<h1>DIRBS stub</h1>' }))
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'PTA Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'PTA Dealer', phone: '03217775555', kinds: ['supplier'] } })).json()).id
  const code = imei(`35693803594${String(Date.now()).slice(-3)}`)
  const pr = await (await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: code, brand_id: b.id, model_id: ms[0].id, condition: 'used', pta_status: 'pta_approved' }, cost: 10000 }] } })).json()
  const devId = pr.lines[0].device_id

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // a phone in stock: open DIRBS with the IMEI copied, then say Non-PTA
  await page.goto(`/stock/${devId}`)
  await page.getByTestId('line-pta').click()
  await expect(page.getByTestId('pta-sheet')).toContainText(code)
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('pta-open').click()])
  await expect(popup).toHaveURL(/dirbs\.pta\.gov\.pk/)
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(code)
  await popup.close()
  await expect(page.getByTestId('pta-sms')).toHaveAttribute('href', `sms:8484?body=${code}`)
  await page.screenshot({ path: 'test-results/pta-sheet.png', fullPage: true })
  await page.getByTestId('pta-non_pta').click()
  await expect(page.getByTestId('pta-sheet')).toBeHidden()
  const dev = await (await request.get(`/api/v1/devices/${devId}`, { headers: h })).json()
  expect(dev.pta_status).toBe('non_pta')
  const hist = await (await request.get(`/api/v1/devices/${devId}/history`, { headers: h })).json()
  expect(hist.some((e: { type: string; data: { result?: string } }) => e.type === 'pta_checked' && e.data.result === 'non_pta')).toBeTruthy()

  // while buying: the IMEI typed, PTA check → Blocked shows a warning; Approved sets the choice
  const fresh = imei(`35693803595${String(Date.now()).slice(-3)}`)
  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /From a dealer/ }).click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('PTA Dealer')
  await page.getByRole('button', { name: /PTA Dealer/ }).first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill(fresh)
  await page.getByTestId('pta-check').click()
  await page.getByTestId('pta-blocked').click()
  await expect(page.getByTestId('pta-blocked-warn')).toBeVisible()
  await page.getByTestId('pta-check').click()
  await page.getByTestId('pta-pta_approved').click()
  await expect(page.getByTestId('pta-blocked-warn')).toBeHidden()
})
