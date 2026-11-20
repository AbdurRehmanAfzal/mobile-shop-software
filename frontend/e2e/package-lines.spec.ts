/** Owner 2026-11-21 (ADR-122): the provider ticks what a shop trades — mobiles, laptops,
 *  accessories, in any mix — when he opens it. The shop sees only that; what is not in its package
 *  is a locked chip and a note with a WhatsApp message to the provider already written.
 *  Needs 03990000099 in SUPERUSER_PHONES. */

import { expect, test, type Page } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
test.setTimeout(240_000)

async function login(page: Page, ph: string, password: string) {
  await page.evaluate(() => { const l = localStorage.getItem('locale'); localStorage.clear(); sessionStorage.clear(); if (l) localStorage.setItem('locale', l) }).catch(() => undefined)
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(password)
  await page.getByRole('button', { name: 'Login' }).click()
}

test('the provider ticks what a shop trades; the shop sees the rest as not in its package', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })

  // 1. the provider opens an accessories-and-laptops shop: three plain ticks
  await login(page, SUPER.phone, SUPER.password)
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })
  await page.goto('/control')
  await page.getByRole('button', { name: 'Open a new shop' }).first().click()
  const owner = phone()
  await page.getByLabel('Shop name', { exact: true }).fill('Gadget Corner')
  await page.getByLabel("Owner's name").fill('Kashif')
  await page.getByLabel("Owner's mobile (login)").fill(owner)
  await page.getByLabel('Password for the owner').fill('kashif1234')
  const trade = page.getByTestId('trade-picker').last()
  await expect(trade).toContainText('What does this shop trade?')
  // a new shop follows its plan: mobiles and accessories, no laptops
  await expect(trade.getByTestId('trade-mobiles')).toBeChecked()
  await expect(trade.getByTestId('trade-accessories')).toBeChecked()
  await expect(trade.getByTestId('trade-laptops')).not.toBeChecked()
  await trade.getByTestId('trade-laptops').check()
  await trade.getByTestId('trade-mobiles').uncheck()
  await trade.getByTestId('trade-accessories').uncheck()
  await expect(trade.getByTestId('trade-laptops')).toBeDisabled() // the last line cannot be unticked
  await trade.getByTestId('trade-accessories').check()
  await page.screenshot({ path: 'test-results/trade-picker.png' })
  await page.getByRole('button', { name: 'Open a new shop' }).last().click()
  await expect(page.getByText('Shop opened')).toBeVisible({ timeout: 60_000 })

  // 2. that shop: no mobiles anywhere, and it says how to get them
  await login(page, owner, 'kashif1234')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30_000 })
  await page.goto('/stock')
  const kinds = page.getByTestId('stock-kinds')
  await expect(kinds.getByTestId('kind-laptop')).toBeVisible()
  await expect(kinds.getByTestId('kind-items')).toBeVisible()
  await expect(kinds.getByTestId('kind-phone')).toHaveCount(0)
  await expect(kinds.getByTestId('kind-locked-mobiles')).toBeVisible()
  await expect(kinds.getByTestId('kind-locked-laptops')).toHaveCount(0)
  await kinds.getByTestId('kind-locked-mobiles').click()
  const note = page.getByTestId('sheet-backdrop').getByTestId('not-in-package')
  await expect(note).toContainText('Not in your package: Mobiles, tablets and smart watches')
  await expect(note).toContainText('To add it, contact the software company.')
  const href = await note.getByTestId('not-in-package-ask').getAttribute('href')
  expect(href).toMatch(/^https:\/\/wa\.me\/\d+\?text=/)
  const msg = decodeURIComponent(href!.split('text=')[1])
  expect(msg).toContain('Gadget Corner')
  expect(msg).toContain(owner)
  expect(msg).toContain('Mobiles, tablets and smart watches')
  await page.screenshot({ path: 'test-results/not-in-package.png' })
  await page.keyboard.press('Escape')
  // the purchase: laptops and items only, the same note under them
  await request.post('/api/v1/parties', { headers: { Authorization: `Bearer ${(await (await request.post('/api/v1/auth/login', { data: { phone: owner, password: 'kashif1234' } })).json()).tokens.access_token}` }, data: { name: 'Gadget Dealer', phone: '03016661010', kinds: ['supplier'] } })
  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /From a dealer/ }).click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Gadget Dealer')
  await page.getByText('Gadget Dealer').first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByRole('button', { name: 'Add accessory / watch' })).toBeVisible()
  await expect(page.getByTestId('add-locked')).toHaveCount(0)
  await expect(page.getByTestId('not-in-package-lines')).toHaveText('Not in your package: Mobiles, tablets and smart watches')
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  // Urdu: one language at a time
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('not-in-package-lines')).toContainText('آپ کے پیکج میں شامل نہیں')
  await page.evaluate(() => localStorage.setItem('locale', 'en'))

  // 3. an ordinary mobile shop: laptops are the line it does not have; a shop with everything sees no note
  const plain = phone()
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'Plain Mobiles', owner_name: 'Owner', phone: plain, password: 'e2e-secret-1' } })
  await login(page, plain, 'e2e-secret-1')
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })
  await page.goto('/stock')
  await expect(page.getByTestId('kind-phone')).toBeVisible()
  await expect(page.getByTestId('kind-items')).toBeVisible()
  await expect(page.getByTestId('kind-locked-laptops')).toBeVisible()
  await expect(page.getByTestId('kind-locked-mobiles')).toHaveCount(0)
  await login(page, SUPER.phone, SUPER.password) // the provider's own login has every line
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })
  await page.goto('/stock')
  await expect(page.getByTestId('kind-laptop')).toBeVisible()
  await expect(page.locator('[data-testid^="kind-locked-"]')).toHaveCount(0)
})
