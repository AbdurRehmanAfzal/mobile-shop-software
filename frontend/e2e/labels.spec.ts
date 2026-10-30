/** Owner (2026-10-30): price stickers with a barcode. From a phone's page, from the stock list for
 *  several phones at once, right after adding stock, and for items; the cost code word in settings. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('stickers: options sheet, print page with barcode, many at once, cost code word', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Sticker Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${brand.id}&q=105`))[0]
  const add = async (imei: string, cost: number, asking: number) => (await page.request.post('http://localhost:8000/api/v1/devices/opening-stock', { headers, data: { imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: cost, asking_price: asking } })).json()
  const a = await add('490154203237518', 40000, 45000)
  await add('356938035643809', 8000, 9500)

  // settings: the code word
  await page.goto('/more/settings')
  await page.getByLabel('Code word (10 letters)').fill('mobileshpk')
  await expect(page.getByText(/Example: 45000 = /)).toContainText('LEMMM')
  await page.getByRole('button', { name: 'Save' }).last().click()
  await expect(page.getByRole('button', { name: 'Saved' })).toBeVisible()

  // one phone: the sheet, the print page opens with the barcode and the price
  await page.goto(`/stock/${a.id}`)
  await page.getByRole('button', { name: 'Print sticker' }).click()
  await expect(page.getByText('Price sticker')).toBeVisible()
  await page.getByRole('button', { name: '60 × 40 mm' }).click()
  await page.getByRole('button', { name: 'Cost code' }).click()
  await page.getByRole('button', { name: '2', exact: true }).click()
  await page.screenshot({ path: 'test-results/label-sheet.png', fullPage: true })
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Print', exact: true }).click()])
  await pop.waitForLoadState()
  const html = await pop.content()
  expect(html).toContain('490154203237518')
  expect(html).toContain('Rs. 45,000')
  expect(html).toContain('LMMMM')
  expect(html).toContain('<svg')
  expect(html).toContain('size:60mm 40mm')
  expect((html.match(/class="label"/g) ?? []).length).toBe(2)
  await pop.screenshot({ path: 'test-results/label-print.png' })
  await pop.close()
  await page.keyboard.press('Escape')

  // the choices were remembered on the shop
  const shop = await get('/shops/current')
  expect(shop.label_prefs.size).toBe('60x40')
  expect(shop.label_code_word).toBe('MOBILESHPK')

  // stock list: pick both phones, A4 sheet
  await page.goto('/stock')
  await page.getByRole('button', { name: 'Stickers', exact: true }).click()
  await page.getByRole('button', { name: 'Select all' }).click()
  await page.getByRole('button', { name: 'Stickers (2)' }).click()
  await page.getByRole('button', { name: 'A4 sheet (65 per page)' }).click()
  const [pop2] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Print', exact: true }).click()])
  await pop2.waitForLoadState()
  const html2 = await pop2.content()
  expect(html2).toContain('size:A4')
  expect(html2).toContain('356938035643809')
  expect(html2).toContain('490154203237518')
  await pop2.close()
})
