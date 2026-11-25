/** ADR-134: shop audit → Finance in the new product, in the audit's frame. Profit & loss, cash & bank,
 *  expenses and tax are the live audit's figures; the tab and the period live in the address. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: audit finance — profit and loss, cash and bank, expenses, tax, as the server counts them', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Finance Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Hall Road Traders', phone: '03215550151', kinds: ['supplier'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35693${stamp}0${n}151`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 9000, asking_price: 12000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 9000, method: 'cash', devices: [dev(1), dev(2)] })
  await post('/sales', { devices: [{ device_id: pur.lines[0].device_id, price: 14000 }], paid: 14000 })
  const cats = await get('/expenses/categories')
  await post('/expenses', { category_id: cats[0].id, amount: 1500, description: 'Tea for the week' })
  const q = 'preset=this_month'
  const pnl = await get(`/shop-audit/pnl?${q}`)
  const cash = await get(`/shop-audit/cash?${q}`)
  const exp = await get(`/shop-audit/expenses?${q}`)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  // from the audit's frame: Finance is drawn now and keeps the period
  await page.goto('/new/audit?preset=this_month')
  await page.getByTestId('naudit-sections').getByRole('link', { name: 'Finance' }).click()
  await expect(page).toHaveURL(/\/new\/audit\/finance\?preset=this_month/)
  await expect(page.getByTestId('nfin')).toBeVisible()

  // profit and loss
  await expect(page.getByTestId('nfin-hero')).toContainText(fmt(pnl.current.net_profit))
  await expect(page.getByTestId('nfin-statement')).toContainText(fmt(pnl.current.net_sales))
  await expect(page.getByTestId('nfin-statement')).toContainText(fmt(pnl.current.cogs))
  await expect(page.getByTestId('nfin-series')).toBeVisible()
  await page.screenshot({ path: 'test-results/newui-audit-finance.png', fullPage: true })

  // cash and bank
  await page.getByTestId('nfin-tab-cash').click()
  await expect(page).toHaveURL(/tab=cash/)
  await expect(page.getByTestId('nfin-c-in')).toContainText(fmt(cash.in_total))
  await expect(page.getByTestId('nfin-c-out')).toContainText(fmt(cash.out_total))
  await expect(page.getByTestId('nfin-c-close')).toContainText(fmt(cash.closing))
  await expect(page.getByTestId('nfin-cameIn')).toBeVisible()
  await expect(page.getByTestId('nfin-accounts')).toBeVisible()

  // expenses
  await page.getByTestId('nfin-tab-expenses').click()
  await expect(page.getByTestId('nfin-exp-hero')).toContainText(fmt(exp.total))
  await expect(page.getByTestId('nfin-largest')).toContainText('Tea for the week')

  // tax: no tax on these bills
  await page.getByTestId('nfin-tab-tax').click()
  await expect(page.getByTestId('nfin-t-bills')).toContainText('0 / 1')

  // a reload keeps the tab and the period
  await page.reload()
  await expect(page.getByTestId('nfin-tax')).toBeVisible()
  await expect(page.getByTestId('naudit-p-this_month')).toHaveAttribute('aria-pressed', 'true')

  // Urdu: one language, right to left
  await page.getByTestId('naudit-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.getByTestId('nfin-tab-pnl').click()
  await page.screenshot({ path: 'test-results/newui-audit-finance-ur.png', fullPage: true })
})
