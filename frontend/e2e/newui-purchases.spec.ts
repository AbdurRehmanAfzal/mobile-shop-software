/** ADR-134: the purchases list and the bill inspector in the new product, drawn from
 *  `10-purchases-and-bill-inspector.html`. The cards' totals are the server's bills; the filters and
 *  the search narrow the list; paying the rest is a payment allocated to the bill; changing what was
 *  paid is the live correction with a reason; change party and delete are the live ones. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: the purchases list, its filters, paying the rest, changing the party and deleting, as file 10 draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'List Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const dealer = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Hall Road Traders', phone: '03215550012', kinds: ['supplier'] } })).json()
  const seller = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Walk Seller', phone: '03215550013', kinds: ['customer'] } })).json()
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const tail = String(Date.now()).slice(-4)
  const dev = (base: string, cost: number) => ({ device: { imei1: imei(base), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost, asking_price: cost + 2000 })
  const buy = async (data: Record<string, unknown>) => { const r = await request.post('/api/v1/purchases', { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const I1 = `3569380${tail}001`, I2 = `3569380${tail}002`, I3 = `3569380${tail}003`, I4 = `3569380${tail}004`
  const a = await buy({ kind: 'supplier', party_id: dealer.id, paid: 0, devices: [dev(I1, 20000), dev(I2, 20000)] })
  const b = await buy({ kind: 'walk_in', party_id: seller.id, paid: 15000, method: 'cash', devices: [dev(I3, 15000)] })
  const c = await buy({ kind: 'supplier', party_id: dealer.id, paid: 9000, method: 'cash', devices: [dev(I4, 9000)] })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/purchases')
  await expect(page.getByTestId('nlist')).toBeVisible()
  await expect(page.getByTestId('nlist-rail')).toBeVisible()
  // the three cards: every bill, what is paid, what is still to give
  await expect(page.getByTestId('nlist-kpi-total')).toContainText('64,000')
  await expect(page.getByTestId('nlist-kpi-paid')).toContainText('24,000')
  await expect(page.getByTestId('nlist-kpi-due')).toContainText('40,000')
  await expect(page.getByTestId('nlist-kpi-topay')).toContainText('Hall Road Traders')
  await expect(page.getByTestId('nlist-count')).toContainText('Showing 3 of 3')
  await page.screenshot({ path: 'test-results/newui-purchases.png', fullPage: true })

  // filters and the search
  await page.getByTestId('nlist-kpi-topay').click()
  await expect(page.getByTestId('nlist-count')).toContainText('Showing 1 of 3')
  await page.getByTestId('nlist-f-walk_in').click()
  await expect(page.getByTestId(`nlist-card-${b.no}`)).toBeVisible()
  await expect(page.getByTestId('nlist-count')).toContainText('Showing 1 of 3')
  await page.getByTestId('nlist-f-all').click()
  await page.getByTestId('nlist-search').fill(imei(I2))
  await expect(page.getByTestId('nlist-count')).toContainText('Showing 1 of 3')
  await expect(page.getByTestId(`nlist-card-${a.no}`)).toContainText(imei(I2))
  await page.getByTestId('nlist-search').fill('')

  // an unpaid bill opens with its drawer; pay part, then the rest
  await page.getByTestId(`nlist-card-${a.no}`).click()
  await expect(page.getByTestId('nlist-bill-no')).toHaveText(a.no)
  await expect(page.getByTestId('nlist-state')).toContainText('To pay')
  await expect(page.getByTestId('nlist-left')).toContainText('40,000')
  await expect(page.getByTestId('nlist-drawer')).toBeVisible()
  await expect(page.getByTestId('nlist-lines')).toContainText(imei(I1))
  await page.getByTestId('nlist-pay-amount').fill('5000')
  await page.getByTestId('nlist-pay-save').click()
  await expect(page.getByTestId('nlist-left')).toContainText('35,000')
  await expect(page.getByTestId('nlist-kpi-due')).toContainText('35,000')
  await page.getByTestId('nlist-pay-toggle').click()
  await page.getByTestId('nlist-pay-full').click()
  await page.getByTestId('nlist-pay-save').click()
  await expect(page.getByTestId('nlist-state')).toContainText('Settled')
  await expect(page.getByTestId('nlist-kpi-due')).toContainText('0')
  expect(Number((await get(`/purchases/${a.id}`)).balance_due)).toBe(0)

  // change what was paid at the purchase (owner, with a reason)
  await page.getByTestId(`nlist-card-${b.no}`).click()
  await expect(page.getByTestId('nlist-state')).toContainText('Settled')
  await page.getByTestId('nlist-pay-toggle').click()
  await expect(page.getByTestId('nlist-pay-amount')).toHaveValue('15000')
  await page.getByTestId('nlist-pay-amount').fill('10000')
  await expect(page.getByTestId('nlist-fix-effect')).toBeVisible()
  await expect(page.getByTestId('nlist-pay-save')).toBeDisabled()
  await page.getByTestId('nlist-fix-reason').fill('was on udhaar')
  await page.getByTestId('nlist-pay-save').click()
  await expect(page.getByTestId('nlist-left')).toContainText('5,000')
  expect(Number((await get(`/purchases/${b.id}`)).balance_due)).toBe(5000)

  // change party
  await page.getByTestId('nlist-party').click()
  await page.getByTestId('nlist-party-q').fill('Hall')
  await page.getByTestId('nlist-party-hit').first().click()
  await expect(page.getByTestId('nlist-party-save')).toBeDisabled()
  await page.getByTestId('nlist-party-reason').fill('wrong person')
  await page.getByTestId('nlist-party-save').click()
  await expect(page.getByTestId('nlist-party-window')).toHaveCount(0)
  expect((await get(`/purchases/${b.id}`)).party_id).toBe(dealer.id)

  // delete: the bill is kept as Deleted and left out of the cards
  await page.getByTestId(`nlist-card-${c.no}`).click()
  await page.getByTestId('nlist-delete').click()
  await expect(page.getByTestId('nlist-delete-window')).toBeVisible()
  await expect(page.getByTestId('nlist-delete-confirm')).toBeDisabled()
  await page.getByTestId('nlist-delete-reason').fill('entered twice')
  await page.getByTestId('nlist-delete-confirm').click()
  await expect(page.getByTestId('nlist-delete-window')).toHaveCount(0)
  await expect(page.getByTestId(`nlist-card-${c.no}`)).toContainText('Deleted')
  await expect(page.getByTestId('nlist-kpi-total')).toContainText('55,000')
  expect((await get(`/purchases/${c.id}`)).status).toBe('voided')

  // Urdu: one language, right to left
  await page.getByTestId('nlist-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-purchases-ur.png', fullPage: true })
})
