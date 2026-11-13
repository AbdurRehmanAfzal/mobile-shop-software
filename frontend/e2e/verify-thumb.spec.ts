/** Owner 2026-11-13 (ADR-069): the ID check takes a photo of the seller's thumb impression —
 *  optional; it is kept with the check and printed on the declaration. */

import { expect, test } from '@playwright/test'

test.setTimeout(120_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
// a 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

test('thumb impression on the ID check', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Thumb Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const seller = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Thumb Seller', phone: '03214446666', kinds: ['customer'] } })).json()).id
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'walk_in', party_id: seller, devices: [{ device: { imei1: '356938035649997', brand_id: nokia.id, model_id: models[0].id, condition: 'used', pta_status: 'pta_approved' }, cost: 5000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto(`/stock/${dev}/verify`)
  const tile = page.locator('label').filter({ hasText: 'Thumb (optional)' })
  await expect(tile).toBeVisible()
  await tile.locator('input[type=file]').setInputFiles({ name: 'thumb.png', mimeType: 'image/png', buffer: PNG })
  await expect(tile.locator('img')).toBeVisible()
  await page.screenshot({ path: 'test-results/verify-thumb.png', fullPage: true })
  await page.getByRole('button', { name: 'Save' }).last().click()

  const v = await (await request.get(`/api/v1/devices/${dev}/verification`, { headers: h })).json()
  expect(v.thumb_path).toBeTruthy()
  expect(v.missing).not.toContain('thumb_path')
  const html = await (await request.get(`/api/v1/devices/${dev}/verification/declaration?lang=en`, { headers: h })).text()
  expect(html).toContain('Thumb impression')
  expect(html).toContain('data:image/png;base64,')
})
