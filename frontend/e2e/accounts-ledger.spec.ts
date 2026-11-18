/** Owner 2026-11-18 (ADR-104): the Accounts page, the chart of accounts and the general ledger —
 *  and a trial-balance line opening the entries behind it. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('accounts page, chart of accounts and general ledger', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Books Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Books Dealer', phone: '03219990001', kinds: ['supplier'] } })).json()).id
  const buyer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Books Buyer', phone: '03219990002', kinds: ['customer'] } })).json()).id
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, paid: 40000, method: 'cash', devices: [{ device: { imei1: imei(`35693803590${String(Date.now()).slice(-3)}`), brand_id: b.id, model_id: ms[0].id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 65000, asking_price: 70000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()
  const dev = (await pr.json()).lines[0].device_id
  const sale = await request.post('/api/v1/sales', { headers: h, data: { party_id: buyer, devices: [{ device_id: dev, price: 70000 }], paid: 50000 } })
  expect(sale.ok(), await sale.text()).toBeTruthy()
  const no = (await sale.json()).no

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })

  // Accounts: the four figures (cash 50,000 in − 40,000 out; buyer owes 20,000; dealer is owed 25,000)
  await page.goto('/accounts')
  await expect(page.getByTestId('acct-cash')).toContainText('10,000')
  await expect(page.getByTestId('acct-get')).toContainText('20,000')
  await expect(page.getByTestId('acct-give')).toContainText('25,000')
  await page.screenshot({ path: 'test-results/accounts.png', fullPage: true })

  // the chart of accounts, then the sales account's entries
  await page.getByTestId('acct-link-chart').click()
  await expect(page).toHaveURL(/\/reports\/ledger$/)
  await expect(page.getByTestId('chart-income')).toContainText('Sales')
  await expect(page.getByTestId('chart-asset')).toContainText('Stock at cost')
  await page.screenshot({ path: 'test-results/chart-of-accounts.png', fullPage: true })
  await page.getByTestId('chart-row-sales').click()
  const gl = page.getByTestId('general-ledger')
  await expect(gl.getByTestId('gl-account')).toHaveText('Sales')
  await expect(gl.getByTestId('gl-row')).toHaveCount(1)
  await expect(gl.getByTestId('gl-row')).toContainText(no)
  await expect(gl.getByTestId('gl-row')).toContainText('Credit 70,000')
  await expect(gl.getByTestId('gl-totals')).toContainText('70,000')
  await expect(gl.getByTestId('gl-count')).toHaveText('1 of 1 entries')
  await page.screenshot({ path: 'test-results/general-ledger.png', fullPage: true })
  await gl.getByTestId('gl-change').click()
  await expect(page.getByTestId('chart-asset')).toBeVisible()

  // a line of the trial balance opens the entries behind it
  await page.goto('/reports?tab=books')
  await page.getByRole('button', { name: 'Trial balance' }).click()
  await page.getByTestId('trial-row').filter({ hasText: 'Cost of goods sold' }).click()
  await expect(page).toHaveURL(/\/reports\/ledger\?account=cogs/)
  await expect(page.getByTestId('gl-row')).toContainText('Debit 65,000')
})
