/** Owner 2026-11-15 (ADR-090): every entry has Edit / Delete on its row, and Delete first says
 *  what will happen, with an example. Expense (the shopkeeper's case) and a person. */

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

test('expense and person: edit / delete from the row, with the warning', async ({ browser, request }) => {
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Del Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const cats = await (await request.get('/api/v1/expenses/categories', { headers: h })).json()
  const tea = cats.find((c: { key: string }) => c.key === 'tea') ?? cats[0]
  expect((await request.post('/api/v1/expenses', { headers: h, data: { category_id: tea.id, amount: 5000, description: 'typed wrong' } })).ok()).toBeTruthy()
  expect((await request.post('/api/v1/parties', { headers: h, data: { kinds: ['customer'], name: 'Twice Added', phone: '03001231234' } })).ok()).toBeTruthy()

  const ctx = await browser.newContext()
  await ctx.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const page = await ctx.newPage()
  await login(page, ph, 'e2e-secret-1')

  // the expense: Edit opens its form, Delete says what happens first
  await page.goto('/expenses')
  await page.getByTestId('bill-edit').first().click()
  await expect(page.getByText('Edit expense')).toBeVisible()
  await page.keyboard.press('Escape')
  await page.goto('/expenses')
  await page.getByTestId('bill-delete').first().click()
  const warn = page.getByTestId('delete-warning')
  await expect(warn).toContainText('What will happen')
  await expect(warn).toContainText('The money comes back into the galla')
  await expect(warn).toContainText('Example')
  await page.screenshot({ path: 'test-results/del-expense.png' })
  await page.getByLabel('Reason').fill('typed 5000 instead of 500')
  await page.getByTestId('bill-delete-confirm').click()
  await expect(page.getByTestId('bill-delete')).toHaveCount(0)

  // the person: Edit from the row opens the form, Delete with the warning removes them
  await page.goto('/parties')
  await page.getByTestId('row-edit').first().click()
  await expect(page).toHaveURL(/\/parties\/.+\?edit=1/)
  await expect(page.getByRole('textbox').first()).toBeVisible()
  await page.goto('/parties')
  await page.getByTestId('row-delete').first().click()
  await expect(page.getByTestId('delete-warning')).toContainText('their old bills stay')
  await page.screenshot({ path: 'test-results/del-party.png' })
  await page.getByRole('button', { name: 'Delete' }).last().click()
  await expect(page.getByText('Twice Added')).toHaveCount(0)
})
