/** Shopkeepers 2026-11-20 (ADR-117): the shop's own price code — the owner makes a pattern in
 *  Settings (a sign per digit, lakh / thousand / hundred, prefix, postfix), sees his prices in it
 *  as he types, saves it, and ticks "Cost in code" / "Asking price in code" on a phone's sticker. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const IMEI = '356938035649871'

test('own price code: made in settings, previewed, printed on the sticker for cost and asking', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Code Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Code Dealer', phone: '03213334444', kinds: ['supplier'] } })).json()).id
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: IMEI, brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 258000, asking_price: 285000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })

  // Settings: off at first; switched on it starts with A to I and Z, lakh L, thousand T, hundred H
  await page.goto('/more/settings')
  await expect(page.getByTestId('pcode-form')).toHaveCount(0)
  await page.getByTestId('pcode-on').click()
  const form = page.getByTestId('pcode-form')
  await expect(form.getByTestId('pcode-d1')).toHaveValue('A')
  await expect(form.getByTestId('pcode-d0')).toHaveValue('Z')
  const preview = form.getByTestId('pcode-preview')
  await expect(preview).toContainText('BHEL') // 285,000 = 2.85 lakh
  await expect(preview).toContainText('DET') // 45,000
  await expect(preview).toContainText('Used for a digit and for a size too: H') // 8 and hundred, said not refused
  // the shopkeeper's own example: ## before, @@ after
  await form.getByTestId('pcode-prefix').fill('##')
  await form.getByTestId('pcode-postfix').fill('@@')
  await expect(preview).toContainText('##BHEL@@')
  // a price of his own, and the other ways of writing it
  await form.getByTestId('pcode-try').fill('258000')
  await expect(preview).toContainText('##BEHL@@')
  await form.getByTestId('pcode-style-exact').click()
  await expect(preview).toContainText('##BLHET@@')
  await form.getByTestId('pcode-style-digits').click()
  await expect(preview).toContainText('##BHEZZZ@@')
  await form.getByTestId('pcode-style-short').click()
  // a sign used twice is said at once and cannot be saved
  await form.getByTestId('pcode-d2').fill('A')
  await expect(preview).toContainText('Every digit needs its own sign')
  await expect(page.getByTestId('pcode-save')).toBeDisabled()
  await form.getByTestId('pcode-d2').fill('b') // typed small, kept capital
  await expect(form.getByTestId('pcode-d2')).toHaveValue('B')
  await expect(preview).toContainText('##BHEL@@')
  await page.getByTestId('pcode-on').scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'test-results/price-code.png' })
  // fits the narrowest phone
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  await page.getByTestId('pcode-save').click()
  await expect(page.getByText('Saved. Tick "Cost in code"')).toBeVisible()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('pcode-prefix')).toHaveValue('##')

  // the phone's sticker: the two ticks print the cost and the asking price in the code
  await page.goto(`/stock/${dev}`)
  const sticker = page.getByTestId('sticker-preview')
  const doc = () => sticker.getByTestId('sticker-frame').getAttribute('srcdoc')
  await expect.poll(doc, { timeout: 15_000 }).toContain('Rs. 285,000')
  expect(await doc()).not.toContain('##')
  await sticker.getByRole('checkbox', { name: 'Asking price in code' }).click()
  await expect.poll(doc).toContain('##BHEL@@')
  await sticker.getByRole('checkbox', { name: 'Cost in code' }).click()
  await expect.poll(doc).toContain('##BEHL@@')
  await sticker.getByRole('checkbox', { name: 'Price', exact: true }).click() // only the code, no plain price
  await expect.poll(doc).not.toContain('Rs. 285,000')
  expect(await doc()).toContain('##BHEL@@')
  await page.screenshot({ path: 'test-results/price-code-sticker.png' })

  // switched off again: the 10-letter code word is back
  await page.goto('/more/settings')
  await page.getByTestId('pcode-on').click()
  await page.getByTestId('pcode-save').click()
  const page2 = await (await request.get(`/api/v1/labels/devices?ids=${dev}&fields=name,code&lang=en&fv=2`, { headers: h })).text()
  expect(page2).toContain('AHSBBB')
})
