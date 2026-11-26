/** ADR-140 (owner 2026-11-26): a phone's page — money spent on the unit added to its cost and deleted
 *  with a reason, the unit's own ledger with the A4 sheet, the quick check (QC), the WhatsApp offer in
 *  "More", the profit of a sold unit after its expenses, and a salesman who sees none of the cost.
 *  Every figure is the server's (`/devices/{id}/money`). */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('phone page: expenses on the unit, its ledger sheet, QC', async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Ledger Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Sheikh Amir', phone: '03215551111', kinds: ['supplier'] })
  const cust = await post('/parties', { name: 'Usman Tariq', phone: '03215551112', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((x: { name: string }) => x.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 30000, method: 'cash', devices: [{ device: { imei1: imei(`35698${stamp}01111`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 30000, asking_price: 36000 }] })
  const dev = pur.lines[0].device_id

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })

  await page.goto(`/stock/${dev}`)
  // the table has the line with its Add; nothing spent yet
  await expect(page.getByTestId('dline-added')).toBeVisible()
  await expect(page.getByTestId('dled-c-added')).toContainText('0')
  // add an expense from the line: it lands in the cost
  await page.getByTestId('line-expense').click()
  await page.getByTestId('dled-expense-amount').fill('1500')
  await page.getByTestId('dled-expense-screen_guard').click()
  await page.getByTestId('dled-expense-note').fill('Glass protector')
  await page.getByTestId('dled-expense-save').click()
  await expect(page.getByTestId('dled-expense-sheet')).toBeHidden()
  await expect(page.getByTestId('dled-c-base')).toContainText('30,000')
  await expect(page.getByTestId('dled-c-added')).toContainText('1,500')
  await expect(page.getByTestId('dled-c-net')).toContainText('31,500')
  await expect(page.getByTestId('dline-added')).toContainText('1,500')
  await expect(page.getByTestId('dline-base')).toContainText('30,000')
  await expect(page.getByTestId('dline-cost')).toContainText('31,500')
  await expect(page.getByTestId('dled-cost-row')).toContainText('Glass protector')
  const m = await get(`/devices/${dev}/money`)
  expect(m.summary.added).toBe('1500.00')
  // a second one from the card, then deleted with a reason
  await page.getByTestId('dled-add-expense').click()
  await page.getByTestId('dled-expense-amount').fill('500')
  await page.getByTestId('dled-expense-save').click()
  await expect(page.getByTestId('dled-cost-row')).toHaveCount(2)
  await page.getByTestId('dled-cost-undo').last().click()
  await page.getByTestId('dled-undo-why').fill('typed twice')
  await page.getByTestId('dled-undo-yes').click()
  await expect(page.getByTestId('dled-cost-row')).toHaveCount(1)
  await expect(page.getByTestId('dled-c-net')).toContainText('31,500')

  // the unit's own ledger: bought, spent; the server's totals; the A4 sheet
  const led = (await get(`/devices/${dev}/money`)).ledger
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })
  await expect(page.getByTestId('dled-lg-row')).toHaveCount(led.rows.length)
  await expect(page.getByTestId('dled-lg-out')).toContainText(fmt(led.out))
  await expect(page.getByTestId('dled-lg-net')).toContainText(fmt(led.net))
  await page.screenshot({ path: 'test-results/device-ledger.png', fullPage: true })
  await page.getByTestId('dled-ledger-a4').click()
  await expect(page.getByTestId('dled-lg-frame')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByTestId('dled-lg-csv')).toBeVisible()
  await page.getByTestId('dled-lg-close').click()

  // quick check: a fault marked makes the unit faulty; cleared, it is back in stock
  await expect(page.getByTestId('dled-qc-score')).toHaveText('14 / 14')
  await page.getByTestId('dled-qc-camera').click()
  await expect(page.getByTestId('dled-qc-score')).toHaveText('13 / 14')
  expect((await get(`/devices/${dev}`)).status).toBe('faulty')
  await page.getByTestId('dled-qc-camera').click()
  await expect(page.getByTestId('dled-qc-score')).toHaveText('14 / 14')
  expect((await get(`/devices/${dev}`)).status).toBe('in_stock')

  // "More" has the ledger sheet and the WhatsApp offer
  await page.getByTestId('device-more-toggle').click()
  await expect(page.getByTestId('device-ledger-sheet')).toBeVisible()
  await expect(page.getByTestId('device-pitch')).toBeVisible()

  // sold: the margin is after the expense (36,000 − 31,500), and no expense can be added
  await post('/sales', { party_id: cust.id, devices: [{ device_id: dev, price: 36000 }], paid: 36000 })
  await page.reload()
  await expect(page.getByTestId('dline-margin')).toContainText('4,500')
  await expect(page.getByTestId('line-expense')).toHaveCount(0)
  await expect(page.getByTestId('dled-add-expense')).toHaveCount(0)
  await expect(page.getByTestId('dled-lg-in')).toContainText('36,000')

  // Urdu: right to left, nothing wider than a phone
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByTestId('dled-ledger')).toBeVisible()
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()

  // a salesman: no expenses, no ledger, no cost lines
  const sp = `032${Math.floor(10_000_000 + Math.random() * 89_999_999)}`.slice(0, 11)
  await post('/staff', { name: 'Ali', phone: sp, password: 'e2e-secret-2', role: 'salesman' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('locale', 'en') })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(sp.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-2')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })
  await page.goto(`/stock/${dev}`)
  await expect(page.getByTestId('device-table')).toBeVisible()
  await expect(page.getByTestId('dled-costs')).toHaveCount(0)
  await expect(page.getByTestId('dled-ledger')).toHaveCount(0)
  await expect(page.getByTestId('dline-added')).toHaveCount(0)
})
