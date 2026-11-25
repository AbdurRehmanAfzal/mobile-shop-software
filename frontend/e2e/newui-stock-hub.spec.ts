/** ADR-134: the stock screen of the new product (file 23) at /new/stock — the summary, models, every
 *  unit with the status tiles, advanced filters and the column chooser, dealers with their khata, the
 *  stock ledger; every figure the server's `/stock-hub/*`. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: the stock screen — summary, models, units with filters and fields, dealers, ledger, Urdu', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Stock Hub', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Bilal Software Dubai', phone: '03215550311', kinds: ['supplier'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number, c = 'box_pack') => ({ device: { imei1: imei(`35696${stamp}0${n}311`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: c, pta_status: 'pta_approved' }, cost: 20000, asking_price: 24000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 30000, method: 'cash', devices: [dev(1), dev(2), dev(3)] })
  await post('/sales', { devices: [{ device_id: pur.lines[0].device_id, price: 25000 }], paid: 25000 })
  await post('/accessories', { name: 'Fast Charger 25W', category: 'charger', price: 900, opening_qty: 6, opening_cost: 500 })
  const ov = await get('/stock-hub/overview')
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  // the summary is the server's
  await page.goto('/new/stock')
  await expect(page.getByTestId('nst')).toBeVisible()
  await expect(page.getByTestId('nst-worth')).toContainText(fmt(ov.cost))
  await expect(page.getByTestId('nst-asking')).toContainText(fmt(ov.asking))
  await expect(page.getByTestId('nst-payable')).toContainText(fmt(ov.payable))
  await expect(page.getByTestId('nst-kind-phone')).toContainText('2')
  await expect(page.getByTestId('nst-brand-row')).toHaveCount(ov.brands.length)
  await page.screenshot({ path: 'test-results/newui-stock-hub.png', fullPage: true })

  // a brand's models
  await page.getByTestId('nst-brand-models').first().click()
  await expect(page).toHaveURL(/tab=models/)
  await expect(page.getByTestId('nst-model-row')).toHaveCount(1)
  await expect(page.getByTestId('nst-models')).toContainText(model.name)

  // every unit in the shop (two phones) and the item
  await page.getByTestId('nst-tab-units').click()
  await expect(page.getByTestId('nst-unit-row')).toHaveCount(2)
  await expect(page.getByTestId('nst-item-row')).toHaveCount(1)
  await expect(page.getByTestId('nst-tile-available')).toContainText('2')
  // the column chooser: the cost column goes and comes back
  await page.getByTestId('nst-fields').click()
  await page.getByTestId('nst-field-cost').click()
  await page.getByTestId('nst-fields-save').click()
  await expect(page.getByTestId('nst-units')).not.toContainText('20,000')
  await page.getByTestId('nst-fields').click()
  await page.getByTestId('nst-field-cost').click()
  await page.getByTestId('nst-fields-save').click()
  await expect(page.getByTestId('nst-units')).toContainText('20,000')
  // advanced filters: sold units, then cleared from the chip
  await page.getByTestId('nst-adv-open').click()
  await page.getByTestId('nst-f-status-sold').click()
  await page.getByTestId('nst-f-apply').click()
  await expect(page.getByTestId('nst-unit-row')).toHaveCount(1)
  await expect(page.getByTestId('nst-chip')).toHaveCount(1)
  await page.getByTestId('nst-chip').click()
  await expect(page.getByTestId('nst-unit-row')).toHaveCount(2)
  // a unit opens its page
  await page.getByTestId('nst-unit-row').first().getByRole('button').first().click()
  await expect(page).toHaveURL(/\/new\/item\//)
  await page.goBack()

  // dealers with their khata
  await page.getByTestId('nst-tab-parties').click()
  const pr = (await get('/stock-hub/parties')).find((r: { party_id: string }) => r.party_id === dealer.id)
  await expect(page.getByTestId('nst-party')).toContainText('Bilal Software Dubai')
  await expect(page.getByTestId('nst-party').first()).toContainText(fmt(pr.billed))
  await page.getByTestId('nst-party-open').first().click()
  await expect(page).toHaveURL(new RegExp(`/new/parties/${dealer.id}`))
  await page.goBack()

  // the stock ledger, this month: three phones and the item in, one phone out
  await page.getByTestId('nst-tab-ledger').click()
  const led = await get(`/stock-hub/ledger?date_from=${new Date().toISOString().slice(0, 8)}01&date_to=${new Date().toISOString().slice(0, 10)}`)
  await expect(page.getByTestId('nst-l-row')).toHaveCount(led.rows.length)
  await expect(page.getByTestId('nst-l-out')).toContainText(String(led.out_units))
  await expect(page.getByTestId('nst-l-profit')).toContainText(fmt(led.profit))
  await page.getByTestId('nst-l-move').selectOption('out')
  await expect(page.getByTestId('nst-l-row')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/newui-stock-hub-ledger.png', fullPage: true })

  // Urdu: one language, right to left
  await page.getByTestId('nst-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.getByTestId('nst-tab-units').click()
  await page.screenshot({ path: 'test-results/newui-stock-hub-ur.png', fullPage: true })
})
