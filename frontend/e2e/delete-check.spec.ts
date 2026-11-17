/** Owner 2026-11-19 (ADR-100): the delete sheet says what must be undone first — here a phone that
 *  is on loan to another shop — with a button to that screen; a clean entry shows nothing extra. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('delete sheet: "first do this" for a phone on loan, nothing extra for a clean purchase', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Check Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Check Dealer', phone: '03219997771', kinds: ['supplier'] } })).json()).id
  const other = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Bilal Mobiles', phone: '03219997772', kinds: ['shop'] } })).json()).id
  const stamp = String(Date.now()).slice(-3)
  const buy = async (base: string) => {
    const r = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, paid: 10000, method: 'cash', devices: [{ device: { imei1: imei(base), brand_id: b.id, model_id: ms[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 10000, asking_price: 13000 }] } })
    expect(r.ok(), await r.text()).toBeTruthy()
    return r.json()
  }
  const loaned = await buy(`35693803578${stamp}`)
  const clean = await buy(`35693803579${stamp}`)
  const loan = await request.post('/api/v1/loans', { headers: h, data: { device_id: loaned.lines[0].device_id, party_id: other } })
  expect(loan.ok(), await loan.text()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })

  // the phone is with another shop: the sheet says so before anything is typed
  await page.goto(`/purchases/${loaned.id}?delete=1`)
  const box = page.getByTestId('delete-blockers')
  await expect(box).toBeVisible({ timeout: 15_000 })
  await expect(box).toContainText('First do this')
  await expect(box.getByTestId('blocker-on_loan')).toContainText('is with Bilal Mobiles on loan (amanat). Take it back first.')
  await page.screenshot({ path: 'test-results/delete-check.png' })
  await box.getByTestId('blocker-open').click()
  await expect(page).toHaveURL(/\/loans$/)

  // a purchase with nothing in the way: the usual warning only
  await page.goto(`/purchases/${clean.id}?delete=1`)
  await expect(page.getByText('What will happen')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('delete-blockers')).toHaveCount(0)
})
