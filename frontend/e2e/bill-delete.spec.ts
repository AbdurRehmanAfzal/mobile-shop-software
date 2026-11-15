/** Owner 2026-11-15 (ADR-086): Edit / Delete on every sale and purchase row. A bill entered by mistake
 *  is deleted from its row (cancelled, kept in the record as Deleted); one whose phone moved on is not. */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('delete a sale and a purchase from their rows', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Delete Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Delete Dealer', phone: '03217771212', kinds: ['supplier'] } })).json()).id
  const buy = async (base: string) => (await (await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: imei(base), brand_id: b.id, model_id: ms[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 10000, asking_price: 12000 }], paid: 10000 } })).json())
  const t = String(Date.now()).slice(-3)
  const p1 = await buy(`35693803598${t}`) // sold, then the sale is deleted
  const p2 = await buy(`35693803599${t}`) // entered by mistake: deleted
  const sale = await (await request.post('/api/v1/sales', { headers: h, data: { devices: [{ device_id: p1.lines[0].device_id, price: 12000 }], paid: 12000 } })).json()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // purchases: the one whose phone was sold cannot be deleted; the other one can
  await page.goto('/purchases')
  await page.getByTestId(`bill-actions-${p1.no}`).getByTestId('bill-delete').click()
  await page.getByLabel('Reason').fill('test sold one')
  await page.getByTestId('bill-delete-confirm').click()
  await expect(page.getByText(/has moved since this purchase/)).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('/purchases')
  await page.screenshot({ path: 'test-results/bill-rows.png', fullPage: true })
  await page.getByTestId(`bill-actions-${p2.no}`).getByTestId('bill-delete').click()
  await page.getByLabel('Reason').fill('entered by mistake')
  await page.getByTestId('bill-delete-confirm').click()
  await expect(page.getByTestId(`bill-actions-${p2.no}`)).toHaveCount(0)
  const pur = await (await request.get(`/api/v1/purchases/${p2.id}`, { headers: h })).json()
  expect(pur.status).toBe('voided')

  // sales: Edit opens the bill; Delete puts the phone back in stock
  await page.goto('/sales')
  await page.getByTestId(`bill-actions-${sale.no}`).getByTestId('bill-edit').click()
  await expect(page).toHaveURL(new RegExp(`/sales/${sale.id}$`))
  await page.goto('/sales')
  await page.getByTestId(`bill-actions-${sale.no}`).getByTestId('bill-delete').click()
  await page.getByLabel('Reason').fill('wrong customer, entered again')
  await page.getByTestId('bill-delete-confirm').click()
  await expect(page.getByText('Deleted').first()).toBeVisible()
  const dev = await (await request.get(`/api/v1/devices/${p1.lines[0].device_id}`, { headers: h })).json()
  expect(dev.status).toBe('in_stock')
})
