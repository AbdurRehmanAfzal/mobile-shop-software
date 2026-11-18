/** Owner 2026-11-18 (ADR-106): amanat goes to anyone (a customer here, not only another shop);
 *  the sticker has its own ticks for RAM, battery health, battery cycles and the serial number,
 *  and its bars are the IMEI — or the shop's own code when the shop chooses that. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('amanat to a customer; sticker ticks and the IMEI barcode', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Amanat Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  await request.post('/api/v1/parties', { headers: h, data: { name: 'Sara Customer', phone: '03219990011', kinds: ['customer'] } })
  const tail = String(Date.now()).slice(-3)
  const add = async (im: string, extra: object) => {
    const r = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: im, brand_id: b.id, model_id: ms[0].id, condition: 'used', pta_status: 'pta_approved', cost_price: 40000, asking_price: 45000, ...extra } })
    expect(r.ok(), await r.text()).toBeTruthy()
    return r.json()
  }
  const im1 = imei(`35693803591${tail}`)
  const im2 = imei(`35693803592${tail}`)
  await add(im1, {})
  const two = await add(im2, { ram_gb: 8, battery_health: 87, battery_cycles: 312, serial: 'F2LXK9QWERTY' })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })

  // amanat to a customer from the loans page
  await page.goto('/loans')
  await page.getByRole('button', { name: 'Give a phone on amanat' }).click()
  await page.getByPlaceholder(/IMEI/).last().fill(im1)
  await page.getByRole('button', { name: new RegExp(im1) }).first().click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Sara')
  await page.getByRole('button', { name: /Sara Customer/ }).first().click()
  await page.getByRole('button', { name: 'Give on loan' }).click()
  await expect(page.getByText(/Given on amanat/)).toBeVisible()
  await expect(page.locator('article').first()).toContainText('Sara Customer')
  await page.screenshot({ path: 'test-results/amanat-customer.png', fullPage: true })

  // the phone's page: the same choice of anyone in "Give on loan"
  await page.goto(`/stock/${two.id}`)
  const card = page.getByTestId('sticker-preview')
  const doc = () => page.getByTestId('sticker-frame').getAttribute('srcdoc')
  // a new shop starts with RAM, battery health and cycles ticked, and the IMEI in the bars
  await expect.poll(doc, { timeout: 15_000 }).toContain('RAM 8GB · Battery 87% · 312 cycles')
  expect(await doc()).not.toContain('S/N')
  await card.getByTestId('sticker-f-serial').click()
  await expect.poll(doc).toContain('S/N F2LXK9QWERTY')
  await card.getByTestId('sticker-f-ram').click()
  await expect.poll(doc).not.toContain('RAM 8GB')
  expect(await doc()).toContain('Battery 87% · 312 cycles')
  await expect(card.getByTestId('label-bar-imei')).toHaveAttribute('aria-checked', 'true')
  const withImei = await doc()
  await page.screenshot({ path: 'test-results/sticker-ticks.png', fullPage: true })
  // the shop's own code instead: the bars change and the code is not the IMEI
  await card.getByTestId('label-bar-code').click()
  await expect.poll(async () => (await doc()) !== withImei).toBeTruthy()
  // untick the IMEI line: the readable text under the bars is the shop's code (MS…)
  await card.getByTestId('sticker-f-imei').click()
  await expect.poll(doc).toContain(two.barcode)
  await card.getByTestId('label-bar-imei').click()
  await expect.poll(doc).toContain(`<div class="imei">${im2}</div>`)
})
