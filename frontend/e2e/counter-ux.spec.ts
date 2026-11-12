/** Owner 2026-11-06: a profile menu top right (who is logged in, profile, log out); a sale starts as
 *  "Walk-in customer"; a new person needs only name, phone and type (the rest under "More details");
 *  the extra cash given goes back as change or, when the customer owes from before, to the old udhaar;
 *  the laptop side panel's shop pages are drawn as tappable rows. */

import { expect, test } from '@playwright/test'

test('profile menu, walk-in, short person form, extra cash to old udhaar, side panel', async ({ page, request }) => {
  const phone = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await (await request.post('/api/v1/auth/signup', { data: { shop_name: 'Counter Shop', owner_name: 'Imran Ali', phone, password: 'e2e-secret-1' } })).json()
  const h = { Authorization: `Bearer ${s.tokens.access_token}`, 'X-Shop-Id': s.me.active_shop_id ?? s.me.shops[0].id }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const brand = brands.find((b: { name: string }) => b.name === 'Samsung') ?? brands[0]
  const model = (await (await request.get(`/api/v1/catalogue/models?brand_id=${brand.id}`, { headers: h })).json())[0]
  const mk = (imei: string, price: number) => request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: price - 1000, asking_price: price } })
  const d1 = await (await mk('490154203237518', 10000)).json()
  await mk('356938035643809', 2000)
  // a customer who owes Rs. 3,000 from an old bill
  const cust = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Ahmed Khan', phone: '03219876543', kinds: ['customer'] } })).json()
  const old = await request.post('/api/v1/sales', { headers: h, data: { party_id: cust.id, devices: [{ device_id: d1.id, price: 10000 }], paid: 7000 } })
  expect(old.status()).toBe(201)

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // the side panel: dashboard and the shop pages as rows
  const side = page.getByTestId('side-shop')
  for (const t of ['People & khata', 'Shop audit', "Day's hisaab", 'Reports', 'Cash & bank', 'Purchases', 'Staff', 'Settings', 'All options']) await expect(side.getByRole('link', { name: t })).toBeVisible()
  await expect(page.getByTestId('side-home')).toContainText('Dashboard')
  await side.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/more\/settings$/)

  // the profile menu, top right
  await page.getByTestId('profile-button').click()
  await expect(page.getByTestId('profile-name')).toHaveText('Imran Ali')
  await expect(page.getByTestId('profile-menu')).toContainText('Owner')
  await page.screenshot({ path: 'test-results/profile-menu.png' })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('profile-menu')).toHaveCount(0)

  // a new person: name, phone and type only; the rest under "More details"
  await page.goto('/parties')
  await page.getByRole('button', { name: 'New person' }).first().click()
  await expect(page.getByLabel('Name', { exact: true })).toBeVisible()
  await expect(page.getByLabel('CNIC', { exact: true })).toHaveCount(0)
  await page.getByTestId('party-more').click()
  await expect(page.getByLabel('CNIC', { exact: true })).toBeVisible()
  await page.keyboard.press('Escape')

  // the sale starts as walk-in; choosing Ahmed lets the extra cash clear his old udhaar
  await page.goto('/sale/new')
  await page.getByRole('button', { name: new RegExp(model.name) }).first().click()
  await expect(page.getByTestId('walk-in')).toContainText('Walk-in customer')
  // nothing chosen yet: the sale waits for a customer or a ticked walk-in
  await expect(page.getByRole('button', { name: 'Complete sale' })).toBeDisabled()
  await page.getByLabel('Cash given by the customer').fill('5000')
  await expect(page.getByTestId('change')).toHaveText('Rs. 3,000')
  await expect(page.getByTestId('to-khata')).toHaveCount(0)
  await page.getByPlaceholder('Name, phone or CNIC').fill('Ahmed')
  await page.getByRole('button', { name: /Ahmed Khan/ }).first().click()
  await page.getByTestId('to-khata').click()
  await expect(page.getByTestId('change')).toHaveText('Rs. 0')
  await page.screenshot({ path: 'test-results/sale-to-khata.png', fullPage: true })
  if (await page.getByTestId('walk-in-tick').isVisible()) await page.getByTestId('walk-in-tick').check() // walk-in is ticked on purpose (owner 2026-11-12)
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()
  const p = await (await request.get(`/api/v1/parties/${cust.id}`, { headers: h })).json()
  expect(p.balance).toBe('0.00')

  // log out from the profile menu
  await page.getByTestId('profile-button').click()
  await page.getByTestId('profile-logout').click()
  await expect(page).toHaveURL(/\/(login|welcome)/)
})
