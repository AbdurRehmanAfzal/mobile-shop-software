/** ADR-134: cash & bank in the new product, drawn from `03-cash-and-bank.html`. Every balance is the
 *  server's; an account below zero gets its opening balance; a new wallet; a move between accounts
 *  and its undo; money out as an expense from the chosen account (no free entry, docs/38 §4). */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: cash & bank — opening balance, a new wallet, a move and its undo, money out, as file 03 draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Cash Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const dealer = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Hall Road Traders', phone: '03215550031', kinds: ['supplier'] } })).json()
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  // paid 9,000 in cash from a galla that was never given its opening balance: it goes below zero
  const buy = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer.id, paid: 9000, method: 'cash', devices: [{ device: { imei1: imei(`3569380${String(Date.now()).slice(-4)}021`), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 9000, asking_price: 11000 }] } })
  expect(buy.ok(), await buy.text()).toBeTruthy()
  const bal = async (kind: string) => Number(((await get('/ledger/accounts')) as { kind: string; balance: string }[]).filter((a) => a.kind === kind).reduce((x, a) => x + Number(a.balance), 0))

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/more/cash')
  await expect(page.getByTestId('ncash')).toBeVisible()
  await expect(page.getByTestId('ncash-rail')).toBeVisible()
  await expect(page.getByTestId('ncash-cash')).toContainText('9,000')
  await expect(page.getByTestId('ncash-cash')).toContainText('−')
  await expect(page.getByTestId('ncash-rows')).toContainText('Purchase')
  await page.screenshot({ path: 'test-results/newui-cash.png', fullPage: true })

  // below zero: the opening balance that makes it zero
  await expect(page.getByTestId('ncash-below')).toBeVisible()
  await page.getByTestId('ncash-fill').click()
  await expect(page.getByTestId('ncash-opening')).toHaveValue('9000')
  await page.getByTestId('ncash-opening-save').click()
  await expect(page.getByTestId('ncash-below')).toHaveCount(0)
  await expect(page.getByTestId('ncash-current')).toContainText('0')
  expect(await bal('cash')).toBe(0)

  // a new wallet with its opening balance
  await page.getByTestId('ncash-add').click()
  await page.getByTestId('ncash-kind-easypaisa').click()
  await page.getByTestId('ncash-add-name').fill('Shop Easypaisa')
  await page.getByTestId('ncash-add-opening').fill('5000')
  await page.getByTestId('ncash-add-save').click()
  await expect(page.getByTestId('ncash-book-title')).toContainText('Shop Easypaisa')
  await expect(page.getByTestId('ncash-bank')).toContainText('5,000')

  // move 2,000 from the wallet to the galla, then undo it
  await page.getByTestId('ncash-move').click()
  await page.getByTestId('ncash-move-amount').fill('2000')
  await page.getByTestId('ncash-move-save').click()
  await expect(page.getByTestId('ncash-bank')).toContainText('3,000')
  await expect(page.getByTestId('ncash-cash')).toContainText('2,000')
  expect(await bal('cash')).toBe(2000)
  await page.getByTestId('ncash-f-transfer').click()
  await expect(page.getByTestId('ncash-count')).toContainText('Showing 1 of')
  await page.getByTestId('ncash-undo-transfer').click()
  await expect(page.getByTestId('ncash-undo-yes')).toBeDisabled()
  await page.getByTestId('ncash-undo-why').fill('wrong account')
  await page.getByTestId('ncash-undo-yes').click()
  await expect(page.getByTestId('ncash-bank')).toContainText('5,000')
  expect(await bal('easypaisa')).toBe(5000)

  // money out of the wallet is an expense; money in points to the khata / the counter
  await page.getByTestId('ncash-f-all').click()
  await page.getByTestId('ncash-manual').click()
  await page.getByTestId('ncash-manual-in').click()
  await expect(page.getByTestId('ncash-manual-in-help')).toBeVisible()
  await page.getByTestId('ncash-manual-out').click()
  await page.getByTestId('ncash-manual-cat').selectOption({ index: 1 })
  await page.getByTestId('ncash-manual-desc').fill('Shop tea')
  await page.getByTestId('ncash-manual-amount').fill('500')
  await page.getByTestId('ncash-manual-save').click()
  await expect(page.getByTestId('ncash-bank')).toContainText('4,500')
  await expect(page.getByTestId('ncash-rows')).toContainText('Expense')
  expect(await bal('easypaisa')).toBe(4500)

  // Urdu: one language, right to left
  await page.getByTestId('ncash-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-cash-ur.png', fullPage: true })
})
