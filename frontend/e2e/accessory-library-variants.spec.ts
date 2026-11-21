/** Accessories shops 2026-11-20 (ADR-118): a new item is found in the built-in list by a few
 *  letters and its card fills itself; the colours the shop keeps are ticked and each becomes its
 *  own item with its own stock; the item's page shows the other kinds and adds one more. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('built-in accessories list fills the card; variants become items with their own stock', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Xcess Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })

  // a new item: a few letters find it in the built-in list
  await page.goto('/accessories')
  await page.getByRole('button', { name: 'New item' }).click()
  const form = page.getByTestId('item-form')
  await form.getByLabel('Name').fill('anker 65w')
  const hits = form.getByTestId('lib-hits')
  await expect(hits.getByTestId('lib-hit').first()).toBeVisible({ timeout: 10_000 })
  await hits.getByRole('button', { name: /^Anker 65W GaN Charger/ }).click()
  await expect(form.getByLabel('Name')).toHaveValue('Anker 65W GaN Charger')
  await expect(hits).toHaveCount(0) // picked: the list steps back
  // ADR-126: the same four numbered steps as inside a purchase; here the pieces are what is on the shelf
  for (const t of ['1. What is it?', '2. What kind of thing?', '3. Which colours or sizes do you keep?', '4. How many you have, and the prices']) await expect(form).toContainText(t)
  await expect(form.getByTestId('buy-kind')).toContainText('Charger')
  await expect(form.getByLabel('Reorder at')).toHaveCount(0) // under "More details"
  // its usual colours are offered; two are kept, and one of the shop's own
  const variants = form.getByTestId('variants')
  await variants.getByRole('checkbox', { name: 'Black' }).click()
  await variants.getByRole('checkbox', { name: 'White' }).click()
  await variants.getByTestId('var-own').fill('Burgundy Red')
  await variants.getByTestId('var-add').click()
  await expect(variants.getByTestId('var-count')).toContainText('3 items will be made')
  await variants.getByLabel('On the shelf now · Black').fill('5')
  await variants.getByLabel('On the shelf now · White').fill('3')
  await form.getByLabel('Sale price').fill('6500')
  await form.getByLabel('Cost each').fill('4000')
  await page.screenshot({ path: 'test-results/item-variants.png', fullPage: true })
  // fits the narrowest phone
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  await form.getByTestId('item-save').click()

  // the list: three items of one product, each with its label and its own count
  await expect(page.getByTestId('item-variant')).toHaveCount(3)
  const items = await (await request.get('/api/v1/accessories?q=Anker 65W', { headers: h })).json()
  expect(items.map((x: { variant: string; qty: number }) => `${x.variant}:${x.qty}`).sort()).toEqual(['Black:5', 'Burgundy Red:0', 'White:3'])
  expect(new Set(items.map((x: { variant_group: string }) => x.variant_group)).size).toBe(1)
  expect(items.every((x: { brand: string; wattage: string; category: string }) => x.brand === 'Anker' && x.wattage === '65W' && x.category === 'charger')).toBeTruthy()

  // an item's page: the other kinds, and one more colour added there
  const black = items.find((x: { variant: string }) => x.variant === 'Black')
  await page.goto(`/accessories/${black.id}`)
  await expect(page.getByTestId('item-hero-variant')).toHaveText('Black')
  const kinds = page.getByTestId('item-kinds')
  await expect(kinds.getByTestId('item-kind')).toHaveCount(3)
  await kinds.getByTestId('item-kind-add').click()
  const sheet = page.getByTestId('sheet-backdrop')
  await sheet.getByRole('checkbox', { name: 'Blue' }).click()
  await sheet.getByLabel('On the shelf now · Blue').fill('2')
  await sheet.getByTestId('item-kind-save').click()
  await expect(kinds.getByTestId('item-kind')).toHaveCount(4)
  await expect(kinds).toContainText('Blue')
  await kinds.getByRole('button', { name: /White/ }).click()
  await expect(page).not.toHaveURL(new RegExp(black.id))

  // the built-in list knows the shop has it now; a cover for a model is made from the model list
  await page.goto('/accessories')
  await page.getByRole('button', { name: 'New item' }).click()
  await page.getByTestId('item-form').getByLabel('Name').fill('anker 65w gan')
  await expect(page.getByTestId('lib-hits')).toContainText('In your stock')
  await page.getByTestId('item-form').getByLabel('Name').fill('iphone 17 cover')
  await expect(page.getByTestId('lib-hits')).toContainText('Back Cover for Apple iPhone 17', { timeout: 10_000 })

  // a sale picks one colour and only its stock moves
  const sale = await request.post('/api/v1/sales', { headers: h, data: { misc: [{ description: 'charger', accessory_id: black.id, qty: 2, unit_price: 6500 }], paid: 13000 } })
  expect(sale.ok(), await sale.text()).toBeTruthy()
  const after = await (await request.get(`/api/v1/accessories/${black.id}/variants`, { headers: h })).json()
  expect(Object.fromEntries(after.map((x: { variant: string; qty: number }) => [x.variant, x.qty]))).toEqual({ Black: 3, White: 3, 'Burgundy Red': 0, Blue: 2 })
})
