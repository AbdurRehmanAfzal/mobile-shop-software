/** Owner 2026-11-14 (ADR-077): the tally sheet's staff copy has no money; a salesman asks, the owner
 *  allows on the stock-worth page (and sees the request on the home screen), then the salesman prints it. */

import { expect, test, type Page } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function login(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test('staff copy with the owner allowing it', async ({ browser, request }) => {
  const ph = phone()
  const sp = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Staff Tally Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const st = await request.post('/api/v1/staff', { headers: h, data: { name: 'Counter Boy', phone: sp, password: 'e2e-secret-2', role: 'salesman' } })
  expect(st.ok(), await st.text()).toBeTruthy()
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Tally Dealer', phone: '03219993333', kinds: ['supplier'] } })).json()).id
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, devices: [{ device: { imei1: '356938035643809', brand_id: b.id, model_id: ms[0].id, condition: 'used', pta_status: 'pta_approved' }, cost: 12345, asking_price: 15555 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()

  // the staff copy itself: the phone, no money
  const copy = await (await request.get('/api/v1/exports/stock-tally?format=pdf&lang=en&staff=true', { headers: h })).text()
  expect(copy).toContain('356938035643809')
  for (const m of ['12,345', '15,555', 'To get', 'Asking']) expect(copy).not.toContain(m)

  const en = async () => {
    const ctx = await browser.newContext()
    await ctx.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
    return ctx.newPage()
  }
  // the salesman asks
  const sales = await en()
  await login(sales, sp, 'e2e-secret-2')
  await sales.goto('/stock/summary')
  await expect(sales.getByTestId('tally-print')).toHaveCount(0)
  await sales.getByTestId('tally-ask').click()
  await expect(sales.getByTestId('tally-waiting')).toBeVisible()

  // the owner sees it on the home screen and allows it
  const owner = await en()
  await login(owner, ph, 'e2e-secret-1')
  await owner.getByTestId('home-tally-asks').click()
  await expect(owner).toHaveURL(/\/stock\/summary$/)
  await expect(owner.getByTestId('tally-staff')).toBeVisible()
  await expect(owner.getByTestId('tally-requests')).toContainText('Counter Boy')
  await owner.getByTestId('tally-requests').getByRole('button', { name: 'Allow' }).click()
  await expect(owner.getByTestId('tally-requests').getByRole('button', { name: 'Take back' })).toBeVisible()
  await owner.screenshot({ path: 'test-results/tally-owner.png', fullPage: true })

  // the salesman now has the staff copy only
  await sales.reload()
  await expect(sales.getByTestId('tally-print-staff')).toBeVisible()
  await expect(sales.getByTestId('tally-print')).toHaveCount(0)
  await sales.screenshot({ path: 'test-results/tally-salesman.png', fullPage: true })
})
