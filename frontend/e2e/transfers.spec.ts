/** docs/35 §5 item 2 (owner 2026-11-04): the owner sends a phone and some items to another branch;
 *  the phone leaves this shop's stock and is in stock at the branch with the same IMEI. */

import { expect, test } from '@playwright/test'

test('send a phone and an item to another branch', async ({ page, request }) => {
  const phone = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const imei = `35${Math.floor(1e12 + Math.random() * 8e12)}`.slice(0, 15).padEnd(15, '7')
  const signup = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Saddar Mobiles', owner_name: 'Owner', phone, password: 'e2e-secret-1' } })
  expect(signup.ok()).toBeTruthy()
  const s = await signup.json()
  const auth = { Authorization: `Bearer ${s.tokens.access_token}` }
  const home = s.me.active_shop_id ?? s.me.shops[0].id
  const h = { ...auth, 'X-Shop-Id': home }
  const branch = await (await request.post('/api/v1/shops', { headers: h, data: { name: 'Mall Road', city: 'Lahore' } })).json()
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const brand = brands.find((b: { name: string }) => b.name === 'Samsung') ?? brands[0]
  const model = (await (await request.get(`/api/v1/catalogue/models?brand_id=${brand.id}`, { headers: h })).json())[0]
  const dev = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 40000, asking_price: 45000 } })
  expect(dev.ok(), await dev.text()).toBeTruthy()
  const device = await dev.json()
  await request.post('/api/v1/accessories', { headers: h, data: { name: 'Fast charger 25W', price: 1500, opening_qty: 10, opening_cost: 900 } })

  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  // two shops: pick the first one if the app asks
  await page.waitForLoadState('networkidle')
  await page.evaluate((id) => {
    const raw = localStorage.getItem('mobileshop.auth')
    if (raw) { const st = JSON.parse(raw); st.state = { ...(st.state ?? {}), activeShopId: id }; localStorage.setItem('mobileshop.auth', JSON.stringify(st)) }
  }, home)

  // from the phone's page
  await page.goto(`/stock/${device.id}`)
  await page.getByRole('button', { name: 'Send to another branch' }).click()
  await expect(page.getByTestId('transfer-new')).toContainText(imei)
  await page.getByRole('button', { name: /Mall Road/ }).click()
  await page.getByRole('button', { name: 'Add an item' }).click()
  await page.getByText('Fast charger 25W').first().click()
  await page.getByRole('button', { name: '+', exact: true }).click()
  await expect(page.getByLabel('How many')).toHaveValue('2')
  await expect(page.getByTestId('transfer-new')).toContainText('41,800')
  await page.getByTestId('transfer-send').click()
  await expect(page.getByText('Sent to Mall Road')).toBeVisible()
  await page.screenshot({ path: 'test-results/transfer-done.png' })

  // this shop: the phone is no longer in stock
  const here = await (await request.get(`/api/v1/devices/${device.id}`, { headers: h })).json()
  expect(here.status).toBe('transferred')
  // the branch: in stock with the same IMEI; the list there shows it came in
  const hb = { ...auth, 'X-Shop-Id': branch.id }
  const there = await (await request.get(`/api/v1/devices?q=${imei}`, { headers: hb })).json()
  expect(there[0].status).toBe('in_stock')
  const list = await (await request.get('/api/v1/transfers', { headers: hb })).json()
  expect(list[0].direction).toBe('in')
})
