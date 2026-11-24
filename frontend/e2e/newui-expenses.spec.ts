/** ADR-134: expenses & day closing in the new product, drawn from `05-expenses-and-day-closing.html`.
 *  An expense is the live expense (its category, from the galla), edit replaces it, delete voids it
 *  with a reason; the galla's preview and close are the server's. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: expenses & day closing — add, edit, delete an expense, count and close the galla, as file 05 draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Kharcha Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Hall Road Traders', phone: '03215550051', kinds: ['supplier'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  // stock bought on udhaar, one sold for cash: 12,000 into the galla today
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 0, devices: [{ device: { imei1: imei(`3569380${String(Date.now()).slice(-4)}051`), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 9000, asking_price: 12000 }] })
  await post('/sales', { devices: [{ device_id: pur.lines[0].device_id, price: 12000 }], paid: 12000 })
  const live = async () => ((await get('/expenses')) as { status: string; amount: string }[]).filter((e) => e.status !== 'voided')

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/expenses')
  await expect(page.getByTestId('nexp')).toBeVisible()
  await expect(page.getByTestId('nexp-rail')).toBeVisible()
  await expect(page.getByTestId('nexp-in')).toContainText('12,000')
  await expect(page.getByTestId('nexp-expected')).toContainText('12,000')
  await expect(page.getByTestId('nexp-src-bank')).toBeDisabled() // no bank account yet

  // add: tea, +500 +100, a note
  await page.getByTestId('nexp-cat-tea').click()
  await page.getByTestId('nexp-plus-500').click()
  await page.getByTestId('nexp-plus-100').click()
  await expect(page.getByTestId('nexp-amount')).toHaveValue('600')
  await page.getByTestId('nexp-note').fill('Chai for customers')
  await page.getByTestId('nexp-save').click()
  await expect(page.getByTestId('nexp-rows')).toContainText('Chai for customers')
  await expect(page.getByTestId('nexp-total')).toContainText('600')
  await expect(page.getByTestId('nexp-expected')).toContainText('11,400')
  expect((await live()).map((e) => e.amount)).toEqual(['600.00'])
  await page.screenshot({ path: 'test-results/newui-expenses.png', fullPage: true })

  // edit: 700 (the old one is replaced)
  await page.getByTestId('nexp-row').filter({ hasText: 'Chai for customers' }).getByTestId('nexp-edit').click()
  await expect(page.getByTestId('nexp-amount')).toHaveValue('600')
  await page.getByTestId('nexp-amount').fill('700')
  await page.getByTestId('nexp-save').click()
  await expect(page.getByTestId('nexp-total')).toContainText('700')
  expect((await live()).map((e) => e.amount)).toEqual(['700.00'])

  // delete with a reason: kept as Deleted, the money back in the galla
  await page.getByTestId('nexp-row').filter({ hasText: '700' }).filter({ hasNot: page.getByText('Deleted') }).getByTestId('nexp-delete').click()
  await expect(page.getByTestId('nexp-void-yes')).toBeDisabled()
  await page.getByTestId('nexp-void-why').fill('entered by mistake')
  await page.getByTestId('nexp-void-yes').click()
  await expect(page.getByTestId('nexp-total')).toContainText('0')
  await expect(page.getByTestId('nexp-expected')).toContainText('12,000')
  expect(await live()).toEqual([])

  // close the day: match expected, the difference, lock
  await page.getByTestId('nexp-drawer-card').click()
  await expect(page.getByTestId('nexp-wf-expected')).toContainText('12,000')
  await page.getByTestId('nexp-counted').fill('11,500'.replace(',', ''))
  await expect(page.getByTestId('nexp-variance')).toContainText('500')
  await expect(page.getByTestId('nexp-variance')).toContainText('short')
  await page.getByTestId('nexp-match').click()
  await expect(page.getByTestId('nexp-variance')).toContainText('Matches')
  await page.getByTestId('nexp-lock').click()
  await expect(page.getByTestId('nexp-closed')).toBeVisible()
  await expect(page.getByTestId('nexp-closed-badge')).toBeVisible()
  const closes = await get('/expenses/day-close')
  expect(closes[0].counted).toBe('12000.00')

  // Urdu: one language, right to left
  await page.getByTestId('nexp-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-expenses-ur.png', fullPage: true })
})
