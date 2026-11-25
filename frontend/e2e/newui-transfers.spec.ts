/** ADR-134 / ADR-046: branch transfers in the new product — no file draws them, so they are drawn like
 *  files 10 / 12. Send is the live transfer (phones and items at their cost), undo the live undo with
 *  a reason; the branch sees what came in. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

test('new product: branch transfers — send a phone and items, the list and the lines, send it back', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const phone = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const imei = `35${Math.floor(1e12 + Math.random() * 8e12)}`.slice(0, 15).padEnd(15, '7')
  const signup = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Saddar Naya', owner_name: 'Owner', phone, password: 'e2e-secret-1' } })
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

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).not.toHaveURL(/\/login/, { timeout: 30_000 })
  await page.waitForLoadState('networkidle')
  await page.evaluate((id) => {
    const raw = localStorage.getItem('mobileshop.auth')
    if (raw) { const st = JSON.parse(raw); st.state = { ...(st.state ?? {}), activeShopId: id }; localStorage.setItem('mobileshop.auth', JSON.stringify(st)) }
  }, home)

  // opened from a phone (?device=): it is on the list already
  await page.goto(`/new/transfers/new?device=${device.id}`)
  await expect(page.getByTestId('ntr-drawer')).toBeVisible()
  await expect(page.getByTestId('ntr-picked')).toContainText(imei)
  await expect(page.getByTestId('ntr-send')).toBeEnabled() // one branch: chosen already
  await page.getByTestId('ntr-kind-items').click()
  await page.getByTestId('ntr-dq').fill('charger')
  await page.getByTestId('ntr-stock').getByRole('button', { name: /Fast charger 25W/ }).click()
  await page.getByTestId('ntr-plus').click()
  await expect(page.getByTestId('ntr-qty')).toHaveValue('2')
  await expect(page.getByTestId('ntr-cost')).toContainText('41,800')
  await page.screenshot({ path: 'test-results/newui-transfers-send.png', fullPage: true })
  await page.getByTestId('ntr-send').click()
  await expect(page.getByTestId('ntr-drawer')).toHaveCount(0)
  await expect(page.getByTestId('ntr-toast')).toContainText('Sent to Mall Road')
  await expect(page.getByTestId('ntr-k-out')).toContainText('1 transfers')
  await expect(page.getByTestId('ntr-head')).toContainText('Sent to Mall Road')
  await expect(page.getByTestId('ntr-head')).toContainText('41,800')
  await expect(page.getByTestId('ntr-lines')).toContainText('2 pieces')
  expect((await (await request.get(`/api/v1/devices/${device.id}`, { headers: h })).json()).status).toBe('transferred')
  const hb = { ...auth, 'X-Shop-Id': branch.id }
  expect((await (await request.get(`/api/v1/devices?q=${imei}`, { headers: hb })).json())[0].status).toBe('in_stock')
  expect((await (await request.get('/api/v1/transfers', { headers: hb })).json())[0].direction).toBe('in')
  await page.screenshot({ path: 'test-results/newui-transfers.png', fullPage: true })

  // sent by mistake: send it back with a reason
  await page.getByTestId('ntr-undo').click()
  await expect(page.getByTestId('ntr-undo-yes')).toBeDisabled()
  await page.getByTestId('ntr-undo-why').fill('wrong branch')
  await page.getByTestId('ntr-undo-yes').click()
  await expect(page.getByTestId('ntr-toast')).toContainText('Sent back')
  await expect(page.getByTestId('ntr-k-undone')).toContainText('1 transfers')
  expect((await (await request.get(`/api/v1/devices/${device.id}`, { headers: h })).json()).status).toBe('in_stock')

  // search
  await page.getByTestId('ntr-q').fill('charger')
  await expect(page.getByTestId('ntr-card').first()).toBeVisible()
  await page.getByTestId('ntr-q').fill('')

  // Urdu: one language, right to left
  await page.getByTestId('ntr-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-transfers-ur.png', fullPage: true })
})
