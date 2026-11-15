/** Owner 2026-11-15 (ADR-087): a repair starts with a choice — the shop's technician or an outside
 *  lab; the shop's own phone goes to repair from its page; Edit / Delete on repair and payment rows;
 *  the repair reports. */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('repair: shop technician or outside lab, delete, reports', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Repair Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Repair Dealer', phone: '03217775151', kinds: ['supplier'] } })).json()).id
  await request.post('/api/v1/parties', { headers: h, data: { name: 'Ali Repair Lab', phone: '03004445151', kinds: ['technician'] } })
  const cust = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Repair Customer', phone: '03007775151', kinds: ['customer'] } })).json()).id
  const pr = await (await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: imei(`35693803600${String(Date.now()).slice(-3)}`), brand_id: b.id, model_id: ms[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 10000 }] } })).json()
  const devId = pr.lines[0].device_id

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // the shop's own phone: Send to repair → an outside lab
  await page.goto(`/stock/${devId}`)
  await page.getByTestId('device-send-repair').click()
  await expect(page.getByTestId('repair-own-phone')).toBeVisible()
  await page.getByRole('button', { name: 'Screen / display', exact: true }).first().click()
  await expect(page.getByTestId('repair-save')).toBeDisabled() // who repairs it is chosen first
  await page.getByTestId('repair-who-lab').click()
  await page.getByTestId('repair-lab-box').getByPlaceholder('Name, phone or CNIC').fill('Ali')
  await page.getByRole('button', { name: /Ali Repair Lab/ }).first().click()
  await page.getByLabel("Lab's price (agreed)").fill('4000')
  await page.screenshot({ path: 'test-results/repair-choice.png', fullPage: true })
  await page.getByTestId('repair-save').click()
  await expect(page).toHaveURL(/\/repairs\/[0-9a-f-]+$/)
  await expect(page.getByText('Ali Repair Lab').first()).toBeVisible()
  expect((await (await request.get(`/api/v1/devices/${devId}`, { headers: h })).json()).status).toBe('in_repair')

  // a customer's phone with the shop's technician, then deleted from its row
  const j = await (await request.post('/api/v1/repairs', { headers: h, data: { party_id: cust, device_desc: 'Oppo A5', fault_codes: ['battery'], advance: 1000 } })).json()
  await page.goto('/repairs')
  await expect(page.getByTestId('repair-reports')).toBeVisible()
  await page.getByTestId(`bill-actions-${j.no}`).getByTestId('bill-delete').click()
  await page.getByLabel('Reason').fill('entered by mistake')
  await page.getByTestId('bill-delete-confirm').click()
  await expect(page.getByTestId(`bill-actions-${j.no}`)).toHaveCount(0)
  expect((await (await request.get(`/api/v1/repairs/${j.id}`, { headers: h })).json()).status).toBe('cancelled')

  // the repairs report from the reports card
  await page.getByTestId('repair-reports').getByRole('button', { name: 'Download' }).first().click()
  const [x] = await Promise.all([page.waitForEvent('download', { timeout: 90_000 }), page.getByRole('button', { name: /Excel/ }).click()])
  expect(x.suggestedFilename()).toMatch(/^repairs-.*\.xlsx$/)

  // a payment entered by mistake, deleted from the payments list
  const pay = await (await request.post('/api/v1/payments', { headers: h, data: { party_id: cust, direction: 'in', amount: 500 } })).json()
  await page.goto('/payments')
  await page.getByTestId(`bill-actions-${pay.no}`).getByTestId('bill-delete').click()
  await page.getByLabel('Reason').fill('wrong person')
  await page.getByTestId('bill-delete-confirm').click()
  await expect(page.getByTestId(`bill-actions-${pay.no}`)).toHaveCount(0)
})
