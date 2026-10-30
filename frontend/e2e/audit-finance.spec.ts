/** Shop Audit → Finance (docs/17 P4): P&L lines with the period before, cash by reason and
 *  channel with a transfer kept apart, a remittance row, expenses by category, tax rows. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('finance audit: P&L, cash reasons and channels, remittance, expenses, tax', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Finance Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const patch = async (p: string, data: unknown) => { const r = await page.request.patch(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const brand = (await get('/catalogue/brands'))[0]
  const model = (await get(`/catalogue/models?brand_id=${brand.id}`))[0]
  const dev = (imei: string) => ({ imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' })
  const sup = await post('/parties', { name: 'Dealer', phone: '03001111111', kinds: ['supplier'] })
  const cus = await post('/parties', { name: 'Ahmed', phone: '03002222222', kinds: ['customer'] })
  const pur = await post('/purchases', { kind: 'supplier', party_id: sup.id, devices: [{ device: dev('490154203237518'), cost: 800, asking_price: 1000 }, { device: dev('356938035643809'), cost: 30000, asking_price: 37100 }, { device: dev('352099001761481'), cost: 800, asking_price: 1000 }], paid: 0 })
  const [a, b, c] = pur.lines.map((l: { device_id: string }) => l.device_id)
  // a taxed cash sale, a remittance sale, a discounted credit sale; tea 100, rent 5,000; cash → bank 300
  await patch('/shops/current', { tax_enabled: true, tax_rate: 18, tax_inclusive: false })
  await post('/sales', { party_id: cus.id, devices: [{ device_id: a, price: 1000 }], paid: 1180 })
  await patch('/shops/current', { tax_enabled: false })
  await post('/sales', { party_id: cus.id, devices: [{ device_id: b, price: 37100 }], paid: 37100, payment: { method: 'remittance', currency: 'SAR', foreign_amount: 500, rate: 74.2, sender_name: 'Ahmed Raza', country: 'Saudi Arabia', service: 'Western Union', reference: 'MTCN 1234567890' } })
  await post('/sales', { party_id: cus.id, devices: [{ device_id: c, price: 1000 }], discount: 100, paid: 0 })
  const cats = Object.fromEntries(((await get('/expenses/categories')) as { key: string; id: string }[]).map((x) => [x.key, x.id]))
  await post('/expenses', { category_id: cats.tea, amount: 100 })
  await post('/expenses', { category_id: cats.rent, amount: 5000, description: 'October' })
  const accounts = (await get('/ledger/accounts')) as { id: string; kind: string }[]
  await post('/ledger/transfers', { from_account_id: accounts.find((x) => x.kind === 'cash')!.id, to_account_id: accounts.find((x) => x.kind === 'remittance')!.id, amount: 300 })

  // P&L: gross 39,100 − discount 100 = net 39,000; cost 31,600; expenses 5,100; profit 2,300
  await page.goto('/audit/finance?preset=this_month')
  const hero = page.getByTestId('fin-hero')
  await expect(hero).toContainText('Rs. 2,300')
  const lines = page.getByTestId('fin-lines')
  await expect(lines).toContainText('Sales before discounts')
  await expect(lines).toContainText('39,100')
  await expect(lines).toContainText('Net sales')
  await expect(lines).toContainText('39,000')
  await expect(lines).toContainText('Tax collected')
  await expect(lines).toContainText('180')
  await expect(page.getByTestId('fin-series')).toBeVisible()
  await page.screenshot({ path: 'test-results/audit-finance-pnl.png', fullPage: true })

  // Cash & bank: reasons, the transfer apart, the remittance row
  await page.getByRole('button', { name: 'Cash & bank', exact: true }).click()
  await expect(page).toHaveURL(/tab=cash/)
  const cameIn = page.getByTestId('reasons-cameIn')
  await expect(cameIn).toContainText('Sales paid at the counter')
  await expect(cameIn).toContainText('38,280')
  await expect(cameIn).toContainText('Moved in from own account')
  const wentOut = page.getByTestId('reasons-wentOut')
  await expect(wentOut).toContainText('Expenses')
  await expect(wentOut).toContainText('5,100')
  await expect(wentOut).toContainText('Moved to own account')
  await expect(page.getByTestId('cash-channels')).toContainText('Remittance')
  const intl = page.getByTestId('cash-intl')
  await expect(intl).toContainText('Ahmed')
  await expect(intl).toContainText('SAR 500 @ 74.20')
  await expect(intl).toContainText('Western Union')
  await expect(intl).toContainText('+ Rs. 37,100')
  await page.screenshot({ path: 'test-results/audit-finance-cash.png', fullPage: true })

  // Expenses: by category with the largest first
  await page.getByRole('button', { name: 'Expenses', exact: true }).click()
  await expect(page.getByTestId('exp-hero')).toContainText('Rs. 5,100')
  const cats2 = page.getByTestId('exp-cats')
  await expect(cats2.locator('a').first()).toContainText('5,000')
  await expect(page.getByTestId('exp-largest')).toContainText('October')

  // Tax: the one taxed bill
  await page.getByRole('button', { name: 'Tax', exact: true }).click()
  await expect(page.getByTestId('tax-totals')).toContainText('1 / 3')
  const rows = page.getByTestId('tax-rows')
  await expect(rows).toContainText('Ahmed')
  await expect(rows).toContainText('1,000 @ 18% excl.')
  await expect(rows).toContainText('180')
  await page.screenshot({ path: 'test-results/audit-finance-tax.png', fullPage: true })

  // the overview links to the finance section and back
  await page.getByRole('link', { name: 'Overview' }).click()
  await expect(page).toHaveURL(/\/audit\?/)
  await expect(page.getByTestId('kpi-sales')).toContainText('39,000')
})
