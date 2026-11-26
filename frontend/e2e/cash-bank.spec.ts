/** ADR-142 (owner 2026-11-26): Cash & bank — the four figures, the accounts as cards, the chosen
 *  account's book on the page with search and in / out / transfers, money out recorded from an account
 *  as an expense, the book as CSV, the opening balance of a below-zero account filled to zero, Urdu;
 *  a salesman sees no book. Balances and book rows are the server's. */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)

test('cash & bank: figures, accounts, the book, money out, opening filled', async ({ page, request }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Cash Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const cust = await post('/parties', { name: 'Usman Tariq', phone: '03215551311', kinds: ['customer'] })
  const hbl = await post('/ledger/accounts', { kind: 'bank', name: 'HBL', account_no: '0011223344', opening_balance: 50000 })
  await post('/payments', { party_id: cust.id, direction: 'in', amount: 8000, notes: 'advance' })
  let accounts = await get('/ledger/accounts')
  const cash = accounts.find((a: { is_default: boolean }) => a.is_default)
  await post('/ledger/transfers', { from_account_id: cash.id, to_account_id: hbl.id, amount: 3000, note: 'deposit' })
  accounts = await get('/ledger/accounts')
  const bal = (id: string) => Number(accounts.find((a: { id: string }) => a.id === id).balance)
  const fmt = (v: string | number) => Math.abs(Number(v)).toLocaleString('en-US', { maximumFractionDigits: 0 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })

  await page.goto('/more/cash')
  // the figures: the server's balances, cash and bank apart
  await expect(page.getByTestId('cashx-f-cash')).toContainText(fmt(bal(cash.id)))
  await expect(page.getByTestId('cashx-f-bank')).toContainText(fmt(bal(hbl.id)))
  await expect(page.getByTestId('cashx-f-all')).toContainText(fmt(bal(cash.id) + bal(hbl.id)))
  await expect(page.getByTestId('cashx-account')).toHaveCount(accounts.length)
  // the counter's cash is chosen first: its book, with the payment in and the move out
  const book = await get(`/ledger/accounts/${cash.id}/book`)
  await expect(page.getByTestId('cashx-book-balance')).toContainText(fmt(bal(cash.id)))
  await expect(page.getByTestId('cashx-row')).toHaveCount(book.rows.length)
  await page.screenshot({ path: 'test-results/cash-bank.png', fullPage: true })
  await page.getByTestId('cashx-flt-in').click()
  await expect(page.getByTestId('cashx-row')).toHaveCount(1)
  await page.getByTestId('cashx-flt-transfer').click()
  await expect(page.getByTestId('cashx-row')).toHaveCount(1)
  await page.getByTestId('cashx-flt-all').click()
  await page.getByPlaceholder('Search a bill no., person or note...').fill('8000')
  await expect(page.getByTestId('cashx-row')).toHaveCount(1)
  await page.getByPlaceholder('Search a bill no., person or note...').fill('')

  // the bank card opens the bank's book
  await page.getByTestId('cashx-f-bank').click()
  await expect(page.getByTestId('cashx-book-name')).toContainText('HBL')
  await expect(page.getByTestId('cashx-book-balance')).toContainText('53,000')

  // money out of the bank by hand: an expense paid from it
  await page.getByTestId('cashx-manual').click()
  await page.getByTestId('cashx-manual-in').click()
  await expect(page.getByTestId('cashx-in-people')).toBeVisible()
  await page.getByTestId('cashx-manual-out').click()
  await page.getByTestId('cashx-manual-cat').selectOption({ index: 1 })
  await page.getByTestId('cashx-manual-amount').fill('2000')
  await page.getByTestId('cashx-manual-desc').fill('bank charges')
  await page.getByTestId('cashx-manual-save').click()
  await expect(page.getByTestId('cashx-manual-sheet')).toContainText('2,000')
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.getByTestId('cashx-book-balance')).toContainText('51,000')
  expect(Number((await get('/ledger/accounts')).find((a: { id: string }) => a.id === hbl.id).balance)).toBe(51000)

  // the book as a file
  const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('cashx-csv').click()])
  expect(dl.suggestedFilename()).toBe('cash-book-HBL.csv')

  // a wallet that went below zero: the hint, and the opening that brings it to zero
  const jc = await post('/ledger/accounts', { kind: 'jazzcash', name: 'Shop JazzCash' })
  await post('/payments', { party_id: cust.id, direction: 'out', amount: 4000, cash_account_id: jc.id })
  await page.reload()
  await expect(page.getByTestId('cash-below-zero')).toBeVisible()
  await page.getByTestId('cash-below-zero').getByRole('button').first().click()
  await page.getByTestId('cashx-fill').click()
  await expect(page.getByTestId('opening-input')).toHaveValue('4000')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByTestId('cash-below-zero')).toHaveCount(0)

  // Urdu: right to left, nothing wider than a phone
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.reload()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await expect(page.getByTestId('cashx-figures')).toBeVisible()
  await page.setViewportSize({ width: 360, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBeTruthy()

  // a salesman: the accounts, but no book
  const sp = `032${Math.floor(10_000_000 + Math.random() * 89_999_999)}`.slice(0, 11)
  await post('/staff', { name: 'Ali', phone: sp, password: 'e2e-secret-2', role: 'salesman' })
  await page.evaluate(() => { localStorage.clear(); localStorage.setItem('locale', 'en') })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(sp.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-2')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 60_000 })
  await page.goto('/more/cash')
  await expect(page.getByTestId('cashx-accounts')).toBeVisible()
  await expect(page.getByTestId('cashx-rows')).toHaveCount(0)
  await expect(page.getByTestId('cashx-manual')).toHaveCount(0)
})
