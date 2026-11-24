/** ADR-134: the day's hisaab in the new product, drawn from `04-day-hisaab.html`. Every figure is
 *  the server's day report; the list's split / time / IMEI / cost come from its additive keys; the
 *  filters narrow the list; the eye hides profit; another day is empty. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: the day\'s hisaab — banner, came in / went out, six figures, what was sold with its filters and a bill\'s drawer, as file 04 draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Hisaab Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Hall Road Traders', phone: '03215550041', kinds: ['supplier'] })
  const ali = await post('/parties', { name: 'Ali Jaranwala', phone: '03215550042', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const tail = String(Date.now()).slice(-4)
  const I = [1, 2, 3].map((k) => imei(`3569380${tail}03${k}`))
  const dev = (x: string) => ({ device: { imei1: x, brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 7000, asking_price: 9000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 21000, method: 'cash', devices: I.map(dev) })
  const ids = pur.lines.map((l: { device_id: string }) => l.device_id)
  await post('/sales', { party_id: ali.id, devices: [{ device_id: ids[0], price: 15000 }], paid: 10000 }) // part udhaar
  await post('/sales', { devices: [{ device_id: ids[1], price: 12000 }], paid: 12000 }) // cash
  await post('/sales', { party_id: ali.id, devices: [{ device_id: ids[2], price: 8000 }], paid: 0 }) // full udhaar
  await post('/payments', { party_id: ali.id, direction: 'in', amount: 1000 }) // udhaar back
  const day = await get('/reports/day')
  expect(day.sales_total).toBe('35000.00')

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/hisaab')
  await expect(page.getByTestId('nday')).toBeVisible()
  await expect(page.getByTestId('nday-rail')).toBeVisible()
  await expect(page.getByTestId('nday-total')).toContainText('35,000')
  await expect(page.getByTestId('nday-phones')).toContainText('3 phones')
  await expect(page.getByTestId('nday-profit')).toContainText(Number(day.profit).toLocaleString('en-US'))
  await expect(page.getByTestId('nday-margin')).toContainText(`${day.margin}%`)
  await expect(page.getByTestId('nday-back')).toContainText('1,000')
  await expect(page.getByTestId('nday-out')).toContainText('21,000') // stock bought
  await page.screenshot({ path: 'test-results/newui-hisaab.png', fullPage: true })

  // the list, its tabs and the two figures that filter it
  await expect(page.getByTestId('nday-row')).toHaveCount(3)
  await expect(page.getByTestId('nday-rows')).toContainText('Paid 10,000 · Udhaar 5,000')
  await expect(page.getByTestId('nday-rows')).toContainText('8,000 baqi')
  await page.getByTestId('nday-f-cash').click()
  await expect(page.getByTestId('nday-row')).toHaveCount(1)
  await page.getByTestId('nday-given').click()
  await expect(page.getByTestId('nday-row')).toHaveCount(2)
  await expect(page.getByTestId('nday-count')).toContainText('Showing 2 of 3')
  await page.getByTestId('nday-f-all').click()
  await page.getByTestId('nday-q').fill(I[1])
  await expect(page.getByTestId('nday-row')).toHaveCount(1)
  await page.getByTestId('nday-q').fill('')

  // a bill's drawer: IMEI, cost, profit, what was paid and is left
  await page.getByTestId('nday-row').filter({ hasText: '15,000' }).click()
  await expect(page.getByTestId('nday-drawer')).toContainText(I[0])
  await expect(page.getByTestId('nday-drawer')).toContainText('7,000')
  await expect(page.getByTestId('nday-receive')).toContainText('5,000')

  // the eye hides profit
  await page.getByTestId('nday-eye').click()
  await expect(page.getByTestId('nday-profit')).toContainText('•')

  // yesterday: nothing sold
  await page.getByTestId('nday-p-yesterday').click()
  await expect(page.getByTestId('nday-total')).toContainText('0')
  await expect(page.getByTestId('nday-rows')).toContainText('Nothing sold')

  // Urdu: one language, right to left
  await page.getByTestId('nday-p-today').click()
  await page.getByTestId('nday-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-hisaab-ur.png', fullPage: true })
})
