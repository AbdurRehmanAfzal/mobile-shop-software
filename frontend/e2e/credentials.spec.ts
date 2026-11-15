/** Owner 2026-11-15 (ADR-088): the owner changes the password from More, sees the password / PIN
 *  history (never the values), and a fresh phone logs in with the PIN tab — no earlier login needed. */

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

test('change password, history, PIN login tab', async ({ browser, request }) => {
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Cred Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  expect((await request.put('/api/v1/me/pin', { headers: h, data: { password: 'e2e-secret-1', pin: '7391' } })).ok()).toBeTruthy()

  const en = async () => {
    const ctx = await browser.newContext()
    await ctx.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
    return ctx.newPage()
  }

  // change the password from More
  const page = await en()
  await login(page, ph, 'e2e-secret-1')
  await page.goto('/more')
  await page.getByRole('button', { name: 'Change password' }).click()
  await page.getByTestId('cp-current').fill('e2e-secret-1')
  await page.getByTestId('cp-new').fill('e2e-new-pass')
  await page.getByTestId('cp-confirm').fill('e2e-new-pazz')
  await expect(page.getByText('The two new passwords are not the same')).toBeVisible()
  await expect(page.getByTestId('cp-save')).toBeDisabled()
  await page.getByTestId('cp-confirm').fill('e2e-new-pass')
  await page.getByTestId('cp-save').click()
  await expect(page.getByText(/Password changed/)).toBeVisible()
  await page.screenshot({ path: 'test-results/cred-changed.png' })
  await page.getByRole('button', { name: 'Done' }).click()

  // the history: what happened, by whom — never the password or PIN
  await page.goto('/more/credentials')
  const list = page.getByTestId('cred-list')
  await expect(list).toContainText('Password — changed · by themselves')
  await expect(list).toContainText('PIN — set · by themselves')
  await expect(list).not.toContainText('e2e-new-pass')
  await expect(list).not.toContainText('7391')
  await page.screenshot({ path: 'test-results/cred-history.png', fullPage: true })

  // a fresh phone: the PIN tab is there without an earlier login
  const fresh = await en()
  await fresh.goto('/login')
  await fresh.getByRole('button', { name: 'PIN', exact: true }).click()
  await fresh.getByLabel('Mobile number').fill(ph)
  await fresh.getByLabel('PIN', { exact: true }).fill('7391')
  await fresh.screenshot({ path: 'test-results/cred-pin-tab.png' })
  await fresh.getByRole('button', { name: 'Next' }).click()
  await expect(fresh.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // the old password no longer works, the new one does
  const again = await en()
  await again.goto('/login')
  await again.getByLabel('Mobile number').fill(ph)
  await again.getByLabel('Password').fill('e2e-secret-1')
  await again.getByRole('button', { name: 'Login' }).click()
  await expect(again.getByPlaceholder("IMEI, phone or person's name")).not.toBeVisible()
  await login(again, ph, 'e2e-new-pass')
})
