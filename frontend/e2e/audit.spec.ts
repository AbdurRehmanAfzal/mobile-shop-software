/** Shop Audit → Overview (docs/17 P3): the period bar, opening → closing balances, revenue apart
 *  from cash, as-of day, the checks card, and tiles that open the list behind the number. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const iso = (daysAgo: number) => { const d = new Date(); d.setDate(d.getDate() - daysAgo); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }

test('shop audit overview: period, balances, revenue vs cash, as-of, checks, drill-down', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Audit Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const brand = (await get('/catalogue/brands'))[0]
  const model = (await get(`/catalogue/models?brand_id=${brand.id}`))[0]
  const sup = await post('/parties', { name: 'Dealer', phone: '03001111111', kinds: ['supplier'] })
  const cus = await post('/parties', { name: 'Ahmed', phone: '03002222222', kinds: ['customer'] })
  const dev = (imei: string) => ({ imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' })
  // 45 days ago: two phones bought for 800 each (cash), one sold on credit for 1,000
  const pur = await post('/purchases', { kind: 'supplier', party_id: sup.id, date: iso(45), devices: [{ device: dev('490154203237518'), cost: 800, asking_price: 1000 }, { device: dev('356938035643809'), cost: 800, asking_price: 1200 }], paid: 1600 })
  const [a, b] = pur.lines.map((l: { device_id: string }) => l.device_id)
  const inv1 = await post('/sales', { party_id: cus.id, date: iso(45), devices: [{ device_id: a, price: 1000 }], paid: 0 })
  // 10 days ago: the other sold for 1,200 cash; Ahmed pays 400 of his old bill
  await post('/sales', { date: iso(10), devices: [{ device_id: b, price: 1200 }], paid: 1200 })
  await post('/payments', { party_id: cus.id, direction: 'in', amount: 400, date: iso(10), allocations: [{ document_type: 'invoice', document_id: inv1.id, amount: 400 }] })

  // a custom period covering the last 30 days
  await page.goto(`/audit?preset=custom&from=${iso(30)}&to=${iso(0)}`)
  await expect(page.getByTestId('audit-period')).toContainText('31 days')
  const sales = page.getByTestId('kpi-sales')
  await expect(sales).toContainText('Rs. 1,200')
  await expect(sales).toContainText('1 bills')
  await expect(page.getByTestId('kpi-profit')).toContainText('Rs. 400')
  await expect(page.getByTestId('kpi-inflows')).toContainText('1,600')
  await expect(page.getByTestId('kpi-outflows')).toContainText('0')
  await expect(page.getByTestId('kpi-purchases')).toContainText('0')
  const money = page.getByTestId('kpi-money')
  await expect(money).toContainText('Rs. 0')
  await expect(money).toContainText('Start -1,600')
  const recv = page.getByTestId('kpi-receivable')
  await expect(recv).toContainText('Rs. 600')
  await expect(recv).toContainText('Start 1,000')
  await expect(recv).toContainText('Received in period 400')
  const stock = page.getByTestId('kpi-stock')
  await expect(stock).toContainText('0 phones')
  await expect(stock).toContainText('Start 1')
  await expect(page.getByTestId('audit-checks')).toContainText('The books check out')
  await page.screenshot({ path: 'test-results/audit-overview.png', fullPage: true })

  // "All time" starts on the first record day and holds both sales
  await page.getByRole('button', { name: 'All time', exact: true }).click()
  await expect(page).toHaveURL(/preset=all_time/)
  await expect(page.getByTestId('kpi-sales')).toContainText('Rs. 2,200')
  await expect(page.getByTestId('kpi-sales')).toContainText('2 bills')
  await expect(page.getByTestId('kpi-purchases')).toContainText('1,600')

  // as of 20 days ago: Ahmed still owed 1,000 and one phone was in stock
  await page.getByRole('button', { name: /^As of/ }).click()
  await page.getByLabel('as of').fill(iso(20))
  await expect(page).toHaveURL(/as_of=/)
  await expect(page.getByText('Balances on the chosen day')).toBeVisible()
  await expect(page.getByTestId('kpi-receivable')).toContainText('Rs. 1,000')
  await expect(page.getByTestId('kpi-stock')).toContainText('1 phones')
  await page.screenshot({ path: 'test-results/audit-asof.png', fullPage: true })

  // drill-down: the sales tile opens the bills of the period
  await page.getByTestId('kpi-sales').click()
  await expect(page).toHaveURL(/\/invoices\?kind=sale&from=/)
  await expect(page.getByText('INV-').first()).toBeVisible()

  // the audit is reachable from More and Reports
  await page.goto('/more')
  await expect(page.getByRole('button', { name: 'Shop audit' })).toBeVisible()
  await page.goto('/reports')
  await page.getByTestId('to-audit').click()
  await expect(page).toHaveURL(/\/audit/)
})
