/** ADR-134 / ADR-032: the shop audit in the new product — no file draws it, so it is drawn like file
 *  02. The overview's figures are the live audit's (`/shop-audit/overview`, `/reconcile`); the period
 *  lives in the address; the sections not drawn yet open the live screen for the same period. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: shop audit — the frame with the period and the sections, the overview as the server counts it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Audit Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Hall Road Traders', phone: '03215550141', kinds: ['supplier'] })
  const ali = await post('/parties', { name: 'Ali Jaranwala', phone: '03215550142', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35693${stamp}0${n}141`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 9000, asking_price: 12000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 5000, method: 'cash', devices: [dev(1), dev(2)] })
  await post('/sales', { party_id: ali.id, devices: [{ device_id: pur.lines[0].device_id, price: 15000 }], paid: 10000 })
  const ov = await get('/shop-audit/overview?preset=this_month')
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/audit')
  await expect(page.getByTestId('naudit')).toBeVisible()
  await expect(page.getByTestId('naudit-p-this_month')).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('naudit-sections').getByRole('button')).toHaveCount(13) // the other sections, security included for the owner
  await expect(page.getByTestId('naudit-sales')).toContainText(fmt(ov.sales.net_sales))
  await expect(page.getByTestId('naudit-sales')).toContainText('1 bills')
  await expect(page.getByTestId('naudit-profit')).toContainText(fmt(ov.profit.net_profit))
  await expect(page.getByTestId('naudit-purchases')).toContainText(fmt(ov.purchases.purchases_net))
  await expect(page.getByTestId('naudit-receivable')).toContainText(fmt(ov.debt.receivable.closing))
  await expect(page.getByTestId('naudit-payable')).toContainText(fmt(ov.debt.payable.closing))
  await expect(page.getByTestId('naudit-stock')).toContainText(`${ov.stock.closing.count} phones`)
  await expect(page.getByTestId('naudit-checks')).toBeVisible()
  await page.screenshot({ path: 'test-results/newui-audit.png', fullPage: true })

  // the period lives in the address
  await page.getByTestId('naudit-p-yesterday').click()
  await expect(page).toHaveURL(/preset=yesterday/)
  await expect(page.getByTestId('naudit-sales')).toContainText('0 bills')
  await page.getByTestId('naudit-p-custom').click()
  await expect(page.getByTestId('naudit-from')).toBeVisible()
  await page.getByTestId('naudit-p-this_month').click()

  // a section not drawn yet opens the live screen for the same period
  await page.getByTestId('naudit-live-finance').click()
  await expect(page).toHaveURL(/\/audit\/finance\?preset=this_month/)
  await page.goBack()
  await expect(page.getByTestId('naudit')).toBeVisible()

  // Urdu: one language, right to left
  await page.getByTestId('naudit-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-audit-ur.png', fullPage: true })
})
