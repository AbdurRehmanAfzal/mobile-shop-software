/** ADR-134: the shop audit's tabs drawn from mock-up 22 — sales & purchases (model-wise with every
 *  phone's trail), udhaar & len-den, stock & ageing, staff & security, bills, products, returns &
 *  repairs, the master ledger and the reports centre — each figure checked against the server's own
 *  for a small seeded shop; the period and the sub-tab live in the address; Urdu right to left. */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: audit tabs from file 22 — every figure as the server counts it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Audit Tabs', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Hall Road Traders', phone: '03215550161', kinds: ['supplier'] })
  const ali = await post('/parties', { name: 'Ali Jaranwala', phone: '03215550162', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const imeis = [1, 2].map((n) => imei(`35693${stamp}0${n}161`.slice(0, 14)))
  const dev = (i: number) => ({ device: { imei1: imeis[i], brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 9000, asking_price: 12000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 5000, method: 'cash', devices: [dev(0), dev(1)] })
  const sale = await post('/sales', { party_id: ali.id, devices: [{ device_id: pur.lines[0].device_id, price: 15000 }], paid: 10000 })
  const q = 'preset=this_month'
  const sales = await get(`/shop-audit/sales?${q}`)
  const units = await get(`/shop-audit/sales/units?${q}`)
  const bought = await get(`/shop-audit/purchases/units?${q}`)
  const purchases = await get(`/shop-audit/purchases?${q}`)
  const udhaar = await get(`/shop-audit/udhaar?${q}`)
  const inv = await get('/shop-audit/inventory')
  const staff = await get(`/shop-audit/staff?${q}`)
  const bills = await get(`/shop-audit/invoices?${q}`)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  // sales & purchases: the hero, the model card with the phone's trail, the bills
  await page.goto(`/new/audit/sales?${q}`)
  await expect(page.getByTestId('nsa')).toBeVisible()
  await expect(page.getByTestId('nsa-billed')).toContainText(fmt(sales.totals.billed))
  await expect(page.getByTestId('nsa-credit')).toContainText(fmt(sales.totals.on_credit))
  const m = page.getByTestId('nsa-model').first()
  await expect(m).toContainText(units.models[0].label)
  await expect(m).toContainText(fmt(units.models[0].revenue))
  await expect(m.getByTestId('nsa-units')).toContainText(imeis[0])
  await expect(m.getByTestId('nsa-units')).toContainText('Hall Road Traders')
  await expect(m.getByTestId('nsa-units')).toContainText('Ali Jaranwala')
  await expect(m.getByTestId('nsa-units')).toContainText(fmt(units.models[0].rows[0].bill_due))
  // the eye hides cost and profit on screen
  await page.getByTestId('naudit-eye').click()
  await expect(m).toContainText('•••')
  await page.getByTestId('naudit-eye').click()
  await page.getByTestId('nsa-view-bills').click()
  await expect(page).toHaveURL(/view=bills/)
  await expect(page.getByTestId('nsa-bills')).toContainText(sale.no)
  await page.getByTestId('nsa-st-partial').click()
  await expect(page).toHaveURL(/status=partial/)
  await expect(page.getByTestId('nsa-bills')).toContainText(sale.no)
  await page.screenshot({ path: 'test-results/newui-audit-sales.png', fullPage: true })
  await page.getByTestId('nsa-side-purchases').click()
  await expect(page).toHaveURL(/side=purchases/)
  await expect(page.getByTestId('nsa-bought')).toContainText(fmt(purchases.totals.total))
  await page.getByTestId('nsa-view-models').click()
  await expect(page.getByTestId('nsa-model').first()).toContainText(fmt(bought.models[0].invested))
  await expect(page.getByTestId('nsa-units').first()).toContainText(imeis[1])

  // udhaar & len-den
  await page.goto(`/new/audit/udhaar?${q}`)
  await expect(page.getByTestId('nud-receivable')).toContainText(fmt(udhaar.receivable.closing))
  await expect(page.getByTestId('nud-payable')).toContainText(fmt(udhaar.payable.closing))
  await expect(page.getByTestId('nud-owes-us')).toContainText('Ali Jaranwala')
  await expect(page.getByTestId('nud-we-owe')).toContainText('Hall Road Traders')
  await page.getByTestId('nud-tab-lending').click()
  await expect(page).toHaveURL(/tab=lending/)
  await expect(page.getByTestId('nud-l-owed')).toBeVisible()

  // stock & ageing
  await page.goto(`/new/audit/stock?${q}`)
  await expect(page.getByTestId('nstk-count')).toContainText(String(inv.count))
  await expect(page.getByTestId('nstk-rows')).toContainText(imeis[1])
  await page.getByTestId('nstk-search').fill('no-such-phone')
  await expect(page.getByTestId('nstk-rows')).toHaveCount(0)
  await page.getByTestId('nstk-tab-summary').click()
  await expect(page.getByTestId('nstk-suppliers')).toContainText('Hall Road Traders')
  await page.getByTestId('nstk-tab-verification').click()
  await expect(page.getByTestId('nstk-ver')).toBeVisible()

  // staff & security (the owner sees the log)
  await page.goto(`/new/audit/staff?${q}`)
  await expect(page.getByTestId('nstf-total')).toContainText(fmt(staff.totals.sales_billed))
  await page.getByTestId('nstf-tab-security').click()
  await expect(page.getByTestId('nstf-log')).toBeVisible()

  // bills, products, returns, the master ledger, reports
  await page.goto(`/new/audit/bills?${q}`)
  const saleKind = bills.by_kind.find((k: { kind: string }) => k.kind === 'sale')
  await expect(page.getByTestId('nbil-k-sale')).toContainText(String(saleKind.count))
  await page.goto(`/new/audit/products?${q}`)
  await expect(page.getByTestId('npro-rows')).toContainText(units.models[0].label)
  await page.goto(`/new/audit/returns?${q}`)
  await expect(page.getByTestId('nret-counts')).toBeVisible()
  await page.goto(`/new/audit/ledger?${q}`)
  await expect(page.getByTestId('nled-totals')).toBeVisible()
  await page.goto(`/new/audit/reports?${q}`)
  await expect(page.getByTestId('nrep-builder')).toBeVisible()

  // Urdu: one language, right to left
  await page.goto(`/new/audit/sales?${q}`)
  await page.getByTestId('naudit-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByTestId('nsa-billed')).toContainText(fmt(sales.totals.billed))
  await page.screenshot({ path: 'test-results/newui-audit-sales-ur.png', fullPage: true })
})
