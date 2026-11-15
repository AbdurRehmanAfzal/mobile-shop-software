/** Owner 2026-11-15 (ADR-090 part 2): a payment's amount is corrected from its row (the old one kept
 *  as Deleted), and a galla → bank move made by mistake is undone, each after the warning. */

import { expect, test, type Page } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function login(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test('payment edit and cash move undo', async ({ browser, request }) => {
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Undo Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const party = await (await request.post('/api/v1/parties', { headers: h, data: { kinds: ['customer'], name: 'Bilal Edit', phone: '03001239999' } })).json()
  expect((await request.post('/api/v1/payments', { headers: h, data: { party_id: party.id, direction: 'in', amount: 3000 } })).ok()).toBeTruthy()
  const accounts = await (await request.get('/api/v1/ledger/accounts', { headers: h })).json()
  const bank = await (await request.post('/api/v1/ledger/accounts', { headers: h, data: { kind: 'bank', name: 'Meezan Test' } })).json()
  expect((await request.post('/api/v1/ledger/transfers', { headers: h, data: { from_account_id: accounts[0].id, to_account_id: bank.id, amount: 2000 } })).ok()).toBeTruthy()

  const ctx = await browser.newContext()
  await ctx.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const page = await ctx.newPage()
  await login(page, ph, 'e2e-secret-1')

  // the payment: 3,000 typed instead of 30,000 → Edit from the row
  await page.goto('/payments')
  await page.getByTestId('bill-edit').first().click()
  await expect(page.getByTestId('payment-edit')).toBeVisible()
  await page.getByTestId('pedit-amount').fill('30000')
  await page.getByTestId('pedit-reason').fill('typed 3000')
  await page.screenshot({ path: 'test-results/pay-edit.png' })
  await page.getByTestId('pedit-save').click()
  await expect(page.getByTestId('payment-edit')).toHaveCount(0)
  await expect(page.getByText('30,000').first()).toBeVisible()
  await expect(page.getByText('Deleted').first()).toBeVisible()

  // the cash move: undo after the warning
  await page.goto('/more/cash')
  await page.getByTestId('transfers').getByTestId('row-delete').click()
  await expect(page.getByTestId('delete-warning')).toContainText('the money goes back')
  await page.getByLabel('Why?').fill('wrong account')
  await page.getByTestId('sheet-backdrop').getByRole('button', { name: 'Undo this move' }).click()
  await expect(page.getByTestId('transfers').locator('.line-through')).toHaveCount(1)
  await page.screenshot({ path: 'test-results/cash-undo.png' })
})
