/** Owner 2026-11-18 (ADR-108): laptops, for the shops the provider switches them on for. Bought on
 *  the same purchase form as a phone: the Laptop type, the serial number, a built-in brand and
 *  model, the common details (processor, generation, RAM, drive, screen) — then in stock under
 *  "Laptops" and sold like any phone. Needs 03990000099 in SUPERUSER_PHONES. */

import { expect, test } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
test.setTimeout(180_000)

test('laptops: off by default; switched on, a used laptop is bought, shown in stock and sold', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const ph = phone()
  const made = await (await request.post('/api/v1/auth/signup', { data: { shop_name: 'Laptop Point', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })).json()
  const h = { Authorization: `Bearer ${made.tokens.access_token}` }
  const shop = made.me.active_shop_id
  await request.post('/api/v1/parties', { headers: h, data: { name: 'Laptop Dealer', phone: '03016660077', kinds: ['supplier'] } })

  const login = async () => {
    await page.goto('/login')
    await page.getByLabel('Mobile number').fill(ph)
    await page.getByLabel('Password').fill('e2e-secret-1')
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })
  }
  const toDeviceForm = async () => {
    await page.goto('/purchase/new')
    await page.getByRole('button', { name: /From a dealer/ }).click()
    await page.getByPlaceholder('Name, phone or CNIC').fill('Laptop Dealer')
    await page.getByText('Laptop Dealer').first().click()
    await page.getByRole('button', { name: 'Next' }).click()
    await page.getByRole('button', { name: 'Add device' }).click()
    await expect(page.getByTestId('devcat-phone')).toBeVisible()
  }

  // 1. a shop without the module: three types as always, no Dell among the brands
  await login()
  await toDeviceForm()
  await expect(page.getByTestId('devcat-laptop')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Dell', exact: true })).toHaveCount(0)
  await page.goto('/stock')
  await expect(page.getByTestId('stock-kinds')).not.toContainText('Laptops')

  // 2. the provider switches laptops on for this shop
  const sup = await (await request.post('/api/v1/auth/login', { data: { phone: SUPER.phone, password: SUPER.password } })).json()
  const plan = (await (await request.get('/api/v1/me', { headers: h })).json()).plan.modules as string[]
  const on = await request.patch(`/api/v1/admin/shops/${shop}/modules`, { headers: { Authorization: `Bearer ${sup.tokens.access_token}` }, data: { modules: [...plan, 'laptops'] } })
  expect(on.ok(), await on.text()).toBeTruthy()
  // log out; the purchase form's unfinished entry goes too
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear() })
  await login()

  // 3. a used Dell Latitude from the dealer: common details first
  await toDeviceForm()
  await page.getByTestId('devcat-laptop').click()
  await expect(page.getByLabel('IMEI', { exact: true })).toHaveCount(0) // a laptop has no IMEI
  const serial = `5CG${String(Date.now()).slice(-7)}`
  await page.getByLabel('Serial number').fill(serial)
  await page.getByRole('button', { name: 'Dell', exact: true }).click()
  await page.getByPlaceholder('Search').fill('5490')
  await page.getByRole('button', { name: 'Latitude 5490', exact: true }).click()
  const common = page.getByTestId('specs-common')
  await common.getByRole('button', { name: 'Core i5', exact: true }).click()
  await common.getByRole('button', { name: '8th Gen', exact: true }).click()
  await common.getByRole('button', { name: 'SSD', exact: true }).click()
  await common.getByRole('button', { name: '14', exact: true }).click()
  await page.getByLabel('RAM (GB)').fill('8')
  await page.locator('select').filter({ hasText: '256GB' }).first().selectOption({ label: '256GB' })
  await page.getByRole('button', { name: 'Used', exact: true }).click()
  await page.getByLabel('Cost price').fill('60000')
  await page.getByLabel('Asking price').fill('68000')
  await page.screenshot({ path: 'test-results/laptop-form.png', fullPage: true })
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await page.getByTestId('purchase-review-open').click()
  await page.getByTestId('review-ok').check()
  await page.getByTestId('purchase-save').click()
  await expect(page.getByText('Purchase saved')).toBeVisible()

  // 4. stock: the Laptops tab, the line shopkeepers quote
  await page.goto('/stock')
  await page.getByTestId('stock-kinds').getByRole('button', { name: 'Laptops' }).click()
  await expect(page.getByText('Latitude 5490').first()).toBeVisible()
  await expect(page.getByText(/Core i5 8th Gen · 8GB · 256GB SSD · 14"/).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/laptop-stock.png', fullPage: true })

  // 5. sold like a phone (the server's own bill carries the same line)
  const dev = (await (await request.get('/api/v1/devices?category=laptop', { headers: h })).json())[0]
  expect(dev.imei1).toBe(serial)
  expect(dev.verification_status).toBe('not_required')
  const buyer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Laptop Buyer', phone: '03016660088', kinds: ['customer'] } })).json()).id
  const sale = await request.post('/api/v1/sales', { headers: h, data: { party_id: buyer, devices: [{ device_id: dev.id, price: 67000 }], paid: 67000 } })
  expect(sale.ok(), await sale.text()).toBeTruthy()
  await page.goto(`/sales/${(await sale.json()).id}`)
  await expect(page.getByText('Latitude 5490').first()).toBeVisible()
  await page.goto(`/stock/${dev.id}`)
  await expect(page.getByText('Sold').first()).toBeVisible()
  await expect(page.getByText(serial).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/laptop-page.png', fullPage: true })
})
