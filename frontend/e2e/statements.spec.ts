/** Owner 2026-11-18 (ADR-103): the account ledger of one person and the item-wise stock sheet with
 *  cost — offered on the person's page and on the stock-worth page, printed on A4. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('account ledger and item-wise stock sheet', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Ledger Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const b = brands.find((x: { name: string }) => x.name === 'Nokia')
  const ms = await (await request.get(`/api/v1/catalogue/models?brand_id=${b.id}`, { headers: h })).json()
  const stores = await (await request.get('/api/v1/catalogue/storages', { headers: h })).json()
  const dealer = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Raheel Naseer', phone: '03110111550', kinds: ['supplier'] } })).json()).id
  const stamp = String(Date.now()).slice(-3)
  const dev = (i: number, model = 0) => ({ imei1: imei(`3569380358${i}${stamp}`), brand_id: b.id, model_id: ms[model].id, storage_id: stores[0]?.id, ram_gb: 12, condition: 'box_pack', pta_status: 'pta_approved' })
  const pay = async (amount: number, reference?: string) => expect((await request.post('/api/v1/payments', { headers: h, data: { party_id: dealer, direction: 'out', amount, reference } })).ok()).toBeTruthy()
  await pay(230000, 'UBL clear')
  const buy = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer, paid: 0, devices: [{ device: dev(1), cost: 90000, asking_price: 96000 }, { device: dev(2), cost: 70000, asking_price: 76000 }, { device: dev(3), cost: 70000, asking_price: 76000 }, { device: dev(4, 1), cost: 138000, asking_price: 145000 }] } })
  expect(buy.ok(), await buy.text()).toBeTruthy()
  await pay(58000)

  // the printed pages, as the app's PDF shows them
  const ledger = await (await request.get(`/api/v1/exports/parties/${dealer}/ledger`, { headers: h })).text()
  expect(ledger).toContain('Account Ledger')
  expect(ledger).toContain('— 1 @ 90,000 = 90,000')
  expect(ledger).toContain('The shop has to pay Raheel Naseer')
  await page.setViewportSize({ width: 794, height: 1123 })
  await page.setContent(ledger, { waitUntil: 'load' })
  await page.screenshot({ path: 'test-results/account-ledger.png', fullPage: true })
  const stock = await (await request.get('/api/v1/exports/stock-cost', { headers: h })).text()
  expect(stock).toContain('Stock with Cost Price (Item Wise)')
  expect(stock).toContain('Grand total')
  await page.setContent(stock, { waitUntil: 'load' })
  await page.screenshot({ path: 'test-results/stock-item-wise.png', fullPage: true })
  await page.setViewportSize({ width: 430, height: 900 })

  // where the shopkeeper finds them
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })
  await page.goto(`/parties/${dealer}?tab=ledger`)
  const card = page.getByTestId('party-ledger')
  await expect(card).toContainText('Account ledger')
  await expect(card.getByTestId('ledger-from')).toBeVisible()
  await page.goto('/stock/summary')
  await expect(page.getByTestId('stock-items-card')).toContainText('Item-wise stock sheet')
})
