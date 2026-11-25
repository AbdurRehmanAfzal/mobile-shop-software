/** ADR-134: amanat (loans) in the new product, drawn from `12-loans-amanat.html`. Give is the live
 *  `POST /loans`, came back the live return, kept the live loan sale (its bill in Sales, the rest on the
 *  khata), delete the live cancel with a reason. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: amanat — give, came back, kept as a sale on the khata, delete, as file 12 draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Amanat Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Hall Road Traders', phone: '03215550091', kinds: ['supplier'] })
  const bilal = await post('/parties', { name: 'Bilal Mobiles', phone: '03215550092', kinds: ['shop'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const I = [1, 2, 3].map((n) => imei(`35693${stamp}0${n}091`.slice(0, 14)))
  const dev = (x: string) => ({ device: { imei1: x, brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 9000, asking_price: 12000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 0, devices: I.map(dev) })
  const ids: string[] = pur.lines.map((l: { device_id: string }) => l.device_id)
  const kept = await post('/loans', { device_id: ids[1], party_id: bilal.id, notes: 'to show a customer' })
  const gone = await post('/loans', { device_id: ids[2], party_id: bilal.id })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/loans')
  await expect(page.getByTestId('nloan')).toBeVisible()
  await expect(page.getByTestId('nloan-k-out')).toContainText('2 phones')
  await expect(page.getByTestId('nloan-k-out')).toContainText('18,000')
  await expect(page.getByTestId('nloan-cards').getByTestId('nloan-card')).toHaveCount(2)

  // 1. give the first phone on amanat, back in 7 days
  await page.getByTestId('nloan-give').click()
  await page.getByTestId('nloan-dq').fill(I[0])
  await page.getByTestId('nloan-stock').getByRole('button').first().click()
  await page.getByTestId('nloan-pq').fill('Bilal')
  await page.getByTestId('nloan-people').getByRole('button', { name: /Bilal Mobiles/ }).click()
  await page.getByTestId('nloan-give-save').click()
  await expect(page.getByTestId('nloan-drawer')).toHaveCount(0)
  await expect(page.getByTestId('nloan-k-out')).toContainText('3 phones')
  const given = ((await get('/loans?status=out')) as { device_id: string; expected_back_at: string | null }[]).find((l) => l.device_id === ids[0])!
  expect(given.expected_back_at).toBeTruthy()
  await page.screenshot({ path: 'test-results/newui-loans.png', fullPage: true })

  // 2. it came back
  await page.getByTestId('nloan-card').filter({ hasText: I[0] }).click()
  await expect(page.getByTestId('nloan-money')).toContainText('9,000')
  await expect(page.getByTestId('nloan-holder')).toContainText('Bilal Mobiles')
  await page.getByTestId('nloan-back').click()
  await expect(page.getByTestId('nloan-state')).toContainText('Came back')
  expect((await get(`/devices/${ids[0]}`)).status).toBe('in_stock')

  // 3. they kept the second one: a sale, all on their khata
  await page.getByTestId('nloan-tab-out').click()
  await page.getByTestId('nloan-card').filter({ hasText: I[1] }).click()
  await page.getByTestId('nloan-kept').click()
  await expect(page.getByTestId('nloan-price')).toHaveValue('12000')
  await page.getByTestId('nloan-price').fill('15000')
  await page.getByTestId('nloan-mode-khata').click()
  await page.getByTestId('nloan-sell').click()
  await expect(page.getByTestId('nloan-state')).toContainText('They kept it')
  await expect(page.getByTestId('nloan-bill')).toBeVisible()
  const sold = ((await get('/loans?status=sold')) as { id: string; invoice_id: string }[]).find((l) => l.id === kept.id)!
  expect(sold.invoice_id).toBeTruthy()
  expect((await get(`/parties/${bilal.id}`)).balance).toBe('15000.00')

  // 4. delete the third with a reason
  await page.getByTestId('nloan-tab-out').click()
  await page.getByTestId('nloan-card').filter({ hasText: I[2] }).click()
  await page.getByTestId('nloan-cancel').click()
  await expect(page.getByTestId('nloan-cancel-yes')).toBeDisabled()
  await page.getByTestId('nloan-cancel-why').fill('given by mistake')
  await page.getByTestId('nloan-cancel-yes').click()
  await expect(page.getByTestId('nloan-k-out')).toContainText('0 phones')
  expect((await get(`/devices/${ids[2]}`)).status).toBe('in_stock')
  expect(((await get('/loans')) as { id: string; status: string }[]).find((l) => l.id === gone.id)?.status ?? 'cancelled').toBe('cancelled')

  // Urdu: one language, right to left
  await page.getByTestId('nloan-tab-sold').click()
  await page.getByTestId('nloan-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-loans-ur.png', fullPage: true })
})
