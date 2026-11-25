/** ADR-134: money from abroad in the new product — no file draws it, so it is drawn like files 03 / 12.
 *  The rows and totals are the shop audit's international report; money received is the live payment
 *  with the remittance details; Move to bank is the live transfer out of the Remittance account. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: money from abroad — the report, money received on a khata, move to bank', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Remit Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Hall Road Traders', phone: '03215550121', kinds: ['supplier'] })
  const ahmed = await post('/parties', { name: 'Ahmed Khan', phone: '03215550122', kinds: ['customer'] })
  await post('/parties', { name: 'Sara Bibi', phone: '03215550123', kinds: ['customer'] })
  await post('/ledger/accounts', { kind: 'bank', name: 'Meezan Bank' })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 0, devices: [{ device: { imei1: imei(`35693${stamp}01121`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 30000, asking_price: 37100 }] })
  await post('/sales', { party_id: ahmed.id, devices: [{ device_id: pur.lines[0].device_id, price: 37100 }], paid: 37100, payment: { method: 'remittance', currency: 'SAR', foreign_amount: 500, rate: 74.2, sender_name: 'Ahmed Raza', country: 'Saudi Arabia', service: 'Western Union', reference: 'MTCN 1234567890' } })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/remittance')
  await expect(page.getByTestId('nrem')).toBeVisible()
  await expect(page.getByTestId('nrem-in')).toContainText('37,100')
  await expect(page.getByTestId('nrem-waiting')).toContainText('37,100')
  await expect(page.getByTestId('nrem-row')).toHaveCount(1)
  await expect(page.getByTestId('nrem-row')).toContainText('Ahmed Raza')
  await expect(page.getByTestId('nrem-row')).toContainText('500 SAR × 74.2')
  await expect(page.getByTestId('nrem-cur-SAR')).toBeVisible()

  // money received from abroad on Sara's khata: 200 AED × 76.5, fee 300, still on its way
  await page.getByTestId('nrem-receive').click()
  await page.getByTestId('nrem-pq').fill('Sara')
  await page.getByTestId('nrem-people').getByRole('button', { name: /Sara Bibi/ }).click()
  await page.getByTestId('nrem-currency').selectOption('AED')
  await page.getByTestId('nrem-foreign').fill('200')
  await page.getByTestId('nrem-rate').fill('76.5')
  await expect(page.getByTestId('nrem-pkr')).toHaveValue('15300')
  await expect(page.getByTestId('nrem-save')).toBeDisabled() // who sent it is needed
  await page.getByTestId('nrem-sender').fill('Imran Bhai')
  await page.getByTestId('nrem-service').selectOption('Al Ansari')
  await page.getByTestId('nrem-fee').fill('300')
  await page.getByRole('button', { name: 'On its way' }).click()
  await page.getByTestId('nrem-save').click()
  await expect(page.getByTestId('nrem-toast')).toContainText('received for Sara Bibi')
  await expect(page.getByTestId('nrem-row')).toHaveCount(2)
  await expect(page.getByTestId('nrem-in')).toContainText('52,400')
  await expect(page.getByTestId('nrem-fees')).toContainText('300')
  await expect(page.getByTestId('nrem-rows')).toContainText('On its way')
  const intl = await get(`/shop-audit/international?preset=this_month`)
  const aed = intl.rows.find((r: { currency: string }) => r.currency === 'AED')
  expect(aed.foreign_amount).toBe('200.00')
  expect(aed.sender_name).toBe('Imran Bhai')
  expect(aed.status).toBe('pending')
  await page.screenshot({ path: 'test-results/newui-remittance.png', fullPage: true })

  // filters: by currency and by search
  await page.getByTestId('nrem-cur-AED').click()
  await expect(page.getByTestId('nrem-row')).toHaveCount(1)
  await page.getByTestId('nrem-cur-AED').click()
  await page.getByTestId('nrem-q').fill('MTCN 1234')
  await expect(page.getByTestId('nrem-row')).toHaveCount(1)
  await expect(page.getByTestId('nrem-row')).toContainText('Ahmed Raza')
  await page.getByTestId('nrem-q').fill('')

  // the money arrived: move it from Remittance to the bank
  await page.getByTestId('nrem-move').click()
  await page.getByTestId('nrem-move-to').getByRole('button', { name: /Meezan Bank/ }).click()
  await page.getByTestId('nrem-move-amount').fill('37100')
  await page.getByTestId('nrem-move-save').click()
  await expect(page.getByTestId('nrem-toast')).toContainText('moved')
  await expect(page.getByTestId('nrem-waiting')).toContainText('15,300')
  const accounts = await get('/ledger/accounts')
  expect(accounts.find((a: { name: string }) => a.name === 'Meezan Bank').balance).toBe('37100.00')

  // Urdu: one language, right to left
  await page.getByTestId('nrem-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-remittance-ur.png', fullPage: true })
})
