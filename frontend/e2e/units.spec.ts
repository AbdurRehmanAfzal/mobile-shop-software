/** Owner (2026-10-30): the Vivo scenario on the screens. 14 Apr bought from A for 35,000 (30,000
 *  paid); 15 Apr sold to B for 40,000 (35,000 received); 17 Apr paid A 2,000 for this phone; 18 Apr
 *  B paid 3,000 for this phone. The phone page, A's page and B's page must all say the same. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('unit-wise money: phone page, both customers, pay for this phone, receipt', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Vivo Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Vivo') ?? (await get('/catalogue/brands'))[0]
  const model = (await get(`/catalogue/models?brand_id=${brand.id}`))[0]
  const a = await post('/parties', { name: 'Customer A', phone: '03001111111', kinds: ['customer'] })
  const b = await post('/parties', { name: 'Customer B', phone: '03002222222', kinds: ['customer'] })
  const pur = await post('/purchases', { kind: 'walk_in', party_id: a.id, date: '2026-04-14', devices: [{ device: { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'used', pta_status: 'pta_approved' }, cost: 35000, asking_price: 45000 }], paid: 30000 })
  const devId = pur.lines[0].device_id
  await post(`/devices/${devId}/verification/override`, { reason: 'known' })
  const inv = await post('/sales', { party_id: b.id, date: '2026-04-15', devices: [{ device_id: devId, price: 40000 }], paid: 35000 })
  await post('/payments', { party_id: a.id, direction: 'out', amount: 2000, date: '2026-04-17', allocations: [{ document_type: 'purchase', document_id: pur.id, amount: 2000 }] })

  // the phone: summary tiles, both sides, the timeline in order
  await page.goto(`/stock/${devId}`)
  await expect(page.getByText('Money on this phone')).toBeVisible()
  const tiles = page.getByTestId('unit-tiles')
  for (const v of ['35,000', '3,000', '40,000', '5,000']) await expect(tiles).toContainText(v)
  await expect(tiles).toContainText('Margin')
  await expect(page.getByRole('button', { name: 'Customer A' }).first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Customer B' }).first()).toBeVisible()
  await page.screenshot({ path: 'test-results/unit-money.png', fullPage: true })

  // receive 3,000 for this phone (18 Apr step): allocated to the bill, B now owes 2,000
  await page.getByRole('button', { name: 'Receive for this phone' }).click()
  await expect(page.getByText(inv.no).last()).toBeVisible()
  await expect(page.getByLabel('Amount')).toHaveValue('5000')
  await page.getByLabel('Amount').fill('3000')
  await page.getByRole('button', { name: 'Receive money', exact: true }).click()
  await expect(page.getByText(/Payment saved|saved/i).first()).toBeVisible()
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Print receipt', exact: true }).last().click()])
  await pop.waitForLoadState()
  const html = await pop.content()
  expect(html).toContain('Payment received')
  expect(html).toContain('Rs. 3,000')
  expect(html).toContain(inv.no)
  await pop.close()
  await page.getByRole('button', { name: 'Done', exact: true }).click()
  await expect(page.getByTestId('unit-tiles')).toContainText('2,000')
  const timeline = page.locator('.card.p-0').last()
  await expect(timeline).toContainText('Received')
  await expect(timeline).toContainText('left to get 2,000')
  await expect(timeline).toContainText('left to pay 3,000')

  // Customer A: we owe 3,000, one phone bought from them, pending
  await page.goto(`/parties/${a.id}`)
  await expect(page.getByText('I have to give')).toBeVisible()
  await expect(page.getByTestId('party-split')).toContainText('We owe (phones)')
  await expect(page.getByTestId('party-split')).toContainText('3,000')
  const rowA = page.locator('.card.divide-y').first()
  await expect(rowA).toContainText('490154203237518')
  await expect(rowA).toContainText('Bought')
  await expect(rowA).toContainText('We owe')
  await page.screenshot({ path: 'test-results/unit-party-a.png', fullPage: true })

  // Customer B: they owe 2,000 on the Vivo
  await page.goto(`/parties/${b.id}`)
  await expect(page.getByText('I will get')).toBeVisible()
  await expect(page.getByTestId('party-split')).toContainText('They owe (phones)')
  await expect(page.getByTestId('party-split')).toContainText('2,000')
  const rowB = page.locator('.card.divide-y').first()
  await expect(rowB).toContainText('Sold')
  await expect(rowB).toContainText('They owe')
  const parties = await get('/parties?q=Customer')
  expect(parties.map((p: { name: string; balance: string }) => [p.name, p.balance]).sort()).toEqual([['Customer A', '-3000.00'], ['Customer B', '2000.00']])
})
