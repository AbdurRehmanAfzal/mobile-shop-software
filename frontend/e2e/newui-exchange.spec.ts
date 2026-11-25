/** ADR-134: exchange (phone for phone) in the new product — no file draws it, so it is drawn like the
 *  counter (file 14) and add stock (file 01). The old phone is the live purchase line, the new one a
 *  phone in stock, the save the live exchange; Recent lists the live exchanges and deletes one with
 *  a reason. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: exchange — old phone in, new phone out, part paid, the bill, recent and delete', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Exchange Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Hall Road Traders', phone: '03215550131', kinds: ['supplier'] })
  await post('/parties', { name: 'Ali Jaranwala', phone: '03215550132', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const newImei = imei(`35693${stamp}01131`.slice(0, 14))
  const oldImei = imei(`35693${stamp}02131`.slice(0, 14))
  await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 0, devices: [{ device: { imei1: newImei, brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 40000, asking_price: 50000 }] })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/exchange/new')
  await expect(page.getByTestId('nex')).toBeVisible()
  await expect(page.getByTestId('nex-confirm')).toBeDisabled()

  // 1. the customer
  await page.getByTestId('nex-pq').fill('Ali')
  await page.getByTestId('nex-people').getByRole('button', { name: /Ali Jaranwala/ }).click()
  await expect(page.getByTestId('nex-party')).toContainText('Ali Jaranwala')

  // 2. the old phone coming in, worth 20,000 (to sell again for 26,000)
  await page.getByTestId('nex-old-imei').fill(newImei)
  await expect(page.getByTestId('nex-old-instock')).toBeVisible() // a phone already in stock is refused
  await page.getByTestId('nex-old-imei').fill(oldImei)
  await expect(page.getByTestId('nex-old-instock')).toHaveCount(0)
  await page.getByTestId('nex-brand-all').selectOption({ label: 'Nokia' })
  await page.getByTestId('nex-models').getByRole('button').first().click()
  await expect(page.getByTestId('nex-old-model')).toContainText('Nokia')
  await page.getByTestId('nex-old-value').fill('20000')
  await page.getByTestId('nex-old-asking').fill('26000')

  // 3. the new phone going out at its asking price
  await page.getByTestId('nex-stock-q').fill(newImei)
  await page.getByTestId('nex-stock').getByRole('button').first().click()
  await expect(page.getByTestId('nex-price')).toHaveValue('50000')

  // 4. the settlement: the customer pays 30,000 — 20,000 now, 10,000 on the khata
  await expect(page.getByTestId('nex-diff')).toContainText('Customer pays')
  await expect(page.getByTestId('nex-diff')).toContainText('30,000')
  await page.getByTestId('nex-paid').fill('20000')
  await expect(page.getByTestId('nex-balance')).toContainText('10,000')
  await page.screenshot({ path: 'test-results/newui-exchange.png', fullPage: true })
  await page.getByTestId('nex-confirm').click()
  await expect(page.getByTestId('nex-done')).toBeVisible()
  await expect(page.getByTestId('nex-done-balance')).toContainText('10,000')
  const list = await get('/exchanges')
  expect(list).toHaveLength(1)
  expect(list[0].trade_in_value).toBe('20000.00')
  expect(list[0].new_balance).toBe('10000.00')
  const came = await get(`/devices/imei/${oldImei}`)
  expect(came.device.status).toBe('in_stock')
  expect((await get(`/devices/imei/${newImei}`)).device.status).toBe('sold')

  // recent: the exchange is listed; delete it with a reason (both halves undone)
  await page.getByTestId('nex-tab-recent').click()
  await expect(page.getByTestId('nex-row')).toHaveCount(1)
  await expect(page.getByTestId('nex-row')).toContainText('Ali Jaranwala')
  await page.getByTestId('nex-delete').click()
  await expect(page.getByTestId('nex-del-yes')).toBeDisabled()
  await page.getByTestId('nex-del-why').fill('wrong phone picked')
  await page.getByTestId('nex-del-yes').click()
  await expect(page.getByTestId('nex-row')).toContainText('Deleted')
  expect((await get('/exchanges'))[0].deleted).toBe(true)
  expect((await get(`/devices/imei/${newImei}`)).device.status).toBe('in_stock')

  // Urdu: one language, right to left
  await page.getByTestId('nex-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-exchange-ur.png', fullPage: true })
})
