/** Owner 2026-11-15 (ADR-080): with "Only phones I allow" on, a salesman's new phone waits for the
 *  owner — even with the right password; the owner sees it on the home screen and allows it. */

import { expect, test, type Page } from '@playwright/test'

test.setTimeout(180_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function fill(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
}

test('a new staff phone waits for the owner', async ({ browser, request }) => {
  const ph = phone()
  const sp = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Secure Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  expect((await request.post('/api/v1/staff', { headers: h, data: { name: 'Counter Boy', phone: sp, password: 'e2e-secret-2', role: 'salesman' } })).ok()).toBeTruthy()

  const en = async () => {
    const ctx = await browser.newContext()
    await ctx.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
    return ctx.newPage()
  }

  // the owner switches it on
  const owner = await en()
  await fill(owner, ph, 'e2e-secret-1')
  await expect(owner.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await owner.goto('/more/security')
  await owner.getByTestId('sec-devices').click()
  await expect(owner.getByText('On — a stolen password is not enough')).toBeVisible()

  // the salesman, right password, new phone: waits
  const sales = await en()
  await fill(sales, sp, 'e2e-secret-2')
  await expect(sales.getByText(/The owner must allow it first/)).toBeVisible()
  await sales.screenshot({ path: 'test-results/sec-waiting.png' })

  // the owner sees it on the home screen and allows it
  await owner.goto('/')
  await owner.getByTestId('home-device-asks').click()
  await expect(owner).toHaveURL(/\/more\/security$/)
  await expect(owner.getByTestId('sec-pending')).toContainText('Counter Boy')
  await owner.getByTestId('sec-pending').getByRole('button', { name: 'Allow' }).click()
  await expect(owner.getByTestId('sec-approved')).toContainText('Counter Boy')
  await owner.screenshot({ path: 'test-results/sec-owner.png', fullPage: true })

  // now that phone logs in
  await sales.getByRole('button', { name: 'Login' }).click()
  await expect(sales.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // another browser (another phone) with the same password still waits
  const thief = await en()
  await fill(thief, sp, 'e2e-secret-2')
  await expect(thief.getByText(/The owner must allow it first/)).toBeVisible()

  // Log out all staff: the salesman's open login ends
  await owner.getByTestId('sec-logout-all').click()
  await owner.getByTestId('sec-logout-confirm').click()
  await expect(owner.getByText(/logins ended/)).toBeVisible()
  await sales.goto('/stock')
  await expect(sales).toHaveURL(/\/login/)
})
