/** Owner 2026-11-09 (ADR-056): a wrong IMEI or the wrong dealer, found after the stock was saved,
 *  is put right from the phone's page and the purchase page; the history shows old and new. */

import { expect, test } from '@playwright/test'

test.setTimeout(120_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('correct an IMEI and the dealer after saving', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Fix Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const party = async (name: string, phoneNo: string) => (await (await request.post('/api/v1/parties', { headers: h, data: { name, phone: phoneNo, kinds: ['supplier'] } })).json()).id as string
  const wrong = await party('Wrong Traders', '03001111111')
  await party('Right Traders', '03002222222')
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: wrong, devices: [{ device: { imei1: '356938035643890', brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 1000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const p = await pr.json()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // the wrong dealer
  await page.goto(`/purchases/${p.id}`)
  await page.getByTestId('purchase-party-change').click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Right')
  await page.getByRole('button', { name: /Right Traders/ }).first().click()
  await page.getByLabel('Reason').fill('picked the wrong dealer')
  await page.getByTestId('purchase-party-save').click()
  await expect(page.getByRole('button', { name: 'Right Traders' })).toBeVisible()

  // the wrong IMEI
  await page.goto(`/stock/${p.lines[0].device_id}`)
  await page.getByTestId('fix-imei').click()
  await page.getByLabel('IMEI', { exact: true }).fill('356938035643809')
  await page.getByLabel('Reason').fill('typing mistake')
  await page.getByTestId('fix-imei-save').click()
  await expect(page.getByText('356938035643809').first()).toBeVisible()
  const fixes = page.getByTestId('timeline-corrected')
  await expect(fixes.filter({ hasText: '356938035643890 → 356938035643809' })).toHaveCount(1)
  await expect(fixes.filter({ hasText: 'Wrong Traders → Right Traders' })).toHaveCount(1)
  await page.screenshot({ path: 'test-results/fix-after-purchase.png', fullPage: true })
})
