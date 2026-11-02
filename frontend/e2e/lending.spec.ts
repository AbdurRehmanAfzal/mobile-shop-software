/** Len-den (docs/32): money given to / taken from a person with no bill — recorded from the
 *  person's khata, kept apart in the khata card, adjusted against a later bill, and shown in the
 *  audit's own len-den screen and in the udhaar screen. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('len-den: give, take, adjust against a bill, audit screen', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Lending Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const cus = await post('/parties', { name: 'Usman', phone: '03215550003', kinds: ['customer'] })

  // he gives the shop 8,000 with no bill
  await page.goto(`/parties/${cus.id}`)
  const card = page.getByTestId('party-lending')
  await expect(card).toContainText('No len-den open')
  await card.getByTestId('lending-take').click()
  await page.getByLabel('Amount').fill('8000')
  await page.getByRole('button', { name: 'Save — money taken' }).click()
  await expect(page.getByText('Payment saved')).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('lending-open')).toContainText('8,000')
  await expect(card).toContainText('We owe them (len-den)')

  // the shop gives 2,000 back
  await card.getByTestId('lending-give').click()
  await page.getByLabel('Amount').fill('2000')
  await page.getByRole('button', { name: 'Save — money given' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('lending-open')).toContainText('6,000')
  await expect(page.getByTestId('lending-entries').locator('> div')).toHaveCount(2)

  // later he buys a phone and pays nothing: the 6,000 can pay the bill
  const brand = (await get('/catalogue/brands'))[0]
  const model = (await get(`/catalogue/models?brand_id=${brand.id}`))[0]
  const dealer = await post('/parties', { name: 'Dealer', phone: '03005556666', kinds: ['supplier'] })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, devices: [{ device: { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 2000, asking_price: 3500 }], paid: 2000 })
  const sale = await post('/sales', { party_id: cus.id, devices: [{ device_id: pur.lines[0].device_id, price: 3500 }], paid: 0 })
  await page.reload()
  const settle = page.getByTestId('lending-settle')
  await expect(settle).toContainText('3,500')
  await settle.getByRole('button', { name: 'Adjust now' }).click()
  await expect(page.getByTestId('lending-settled')).toContainText('3,500')
  await expect(page.getByTestId('lending-settle')).toHaveCount(0)
  await expect(page.getByTestId('lending-open')).toContainText('2,500')
  expect((await get(`/sales/${sale.id}`)).status).toBe('paid')
  await page.screenshot({ path: 'test-results/lending-party.png', fullPage: true })

  // the audit's len-den screen
  await page.goto('/audit/lending?preset=today')
  await expect(page.getByTestId('lend-shop_owes')).toContainText('Rs. 2,500')
  await expect(page.getByTestId('lend-totals')).toContainText('8,000')
  await expect(page.getByTestId('lend-totals')).toContainText('3,500')
  await expect(page.getByTestId('lend-people')).toContainText('Usman')
  await expect(page.getByTestId('lend-entries').locator('a')).toHaveCount(2)
  await expect(page.getByTestId('section-download')).toBeVisible()
  await page.screenshot({ path: 'test-results/lending-audit.png', fullPage: true })
  // and the udhaar screen says how much of the payable is len-den
  await page.getByRole('main').getByRole('link', { name: 'Udhaar' }).click()
  await expect(page.getByTestId('udhaar-lending')).toContainText('2,500')
  await expect(page.getByTestId('udhaar-movement')).toContainText('Len-den taken')
})

test('len-den return date: late badge, WhatsApp reminder, home alert, audit list', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Due Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const r = await page.request.post('http://localhost:8000/api/v1/parties', { headers, data: { name: 'Tariq', phone: '03215550009', kinds: ['customer'] } })
  const tariq = await r.json()
  const day = (n: number) => new Date(Date.now() + 5 * 3600_000 - n * 86400_000).toISOString().slice(0, 10)

  // lent 25,000, to come back two days ago
  await page.goto(`/parties/${tariq.id}`)
  const card = page.getByTestId('party-lending')
  await card.getByTestId('lending-give').click()
  await page.getByLabel('Amount').fill('25000')
  await page.getByLabel('Return date (optional)').fill(day(2))
  await page.getByRole('button', { name: 'Save — money given' }).click()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByTestId('lending-due')).toContainText('2 days late')
  // reminder: WhatsApp opens with the message
  const popup = page.waitForEvent('popup')
  await card.getByRole('button', { name: 'Send reminder' }).click()
  const wa = await popup
  expect(wa.url()).toMatch(/^https:\/\/(api\.)?whatsapp\.com\/|^https:\/\/wa\.me\/923215550009\?text=/)
  await wa.close()
  await expect(page.getByTestId('lending-settled')).toContainText('WhatsApp opened')
  await expect(page.getByTestId('lending-due')).toContainText('Last reminded')
  await page.screenshot({ path: 'test-results/lending-due.png', fullPage: true })
  // the home screen asks for a look
  await page.goto('/')
  await expect(page.getByText('people late returning len-den')).toBeVisible()
  // the audit list, and moving the date clears "late"
  await page.goto('/audit/lending?preset=today')
  await expect(page.getByTestId('lend-due')).toContainText('Late')
  await page.goto(`/parties/${tariq.id}`)
  await page.getByTestId('lending-date').click()
  await page.getByLabel('Return date (optional)').fill(day(-10))
  await page.getByRole('button', { name: 'Save date' }).click()
  await expect(page.getByTestId('lending-due')).not.toContainText('late')
})
