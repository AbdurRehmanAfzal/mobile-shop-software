/** Shop Audit P2-1: counter cash moved to the bank is neither a sale nor an expense. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('move money between accounts: balances move, profit and hisaab reasons stay honest', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Transfer Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const brand = (await get('/catalogue/brands'))[0]
  const model = (await get(`/catalogue/models?brand_id=${brand.id}`))[0]
  const sup = await post('/parties', { name: 'Dealer', phone: '03001111111', kinds: ['supplier'] })
  const pur = await post('/purchases', { kind: 'supplier', party_id: sup.id, devices: [{ device: { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 800, asking_price: 1000 }], paid: 800 })
  await post('/sales', { devices: [{ device_id: pur.lines[0].device_id, price: 1000 }], paid: 1000 })
  await post('/ledger/accounts', { kind: 'bank', name: 'HBL' })

  await page.goto('/more/cash')
  await page.getByRole('button', { name: 'Move money between accounts' }).click()
  await page.getByRole('button', { name: 'HBL', exact: true }).last().click()
  await page.getByLabel('Amount').fill('150')
  await page.getByLabel('Note').fill('deposit')
  await page.getByRole('button', { name: 'Move', exact: true }).click()
  const moved = page.getByTestId('transfers')
  await expect(moved).toContainText('HBL')
  await expect(moved).toContainText('deposit')
  await expect(moved).toContainText('150')
  await page.screenshot({ path: 'test-results/transfer.png', fullPage: true })
  const accounts = await get('/ledger/accounts')
  expect(accounts.find((a: { name: string }) => a.name === 'HBL').balance).toBe('150.00')
  expect(accounts.find((a: { is_default: boolean }) => a.is_default).balance).toBe('50.00')

  // hisaab: the move is its own reason; sales and profit untouched
  await page.goto('/hisaab')
  await expect(page.getByText('Moved to own account')).toBeVisible()
  await expect(page.getByText('Moved in from own account')).toBeVisible()
  const pnl = await get('/reports/profit-loss')
  expect(pnl.net_profit).toBe('200.00')
  expect(pnl.net_sales).toBe('1000.00')
})
