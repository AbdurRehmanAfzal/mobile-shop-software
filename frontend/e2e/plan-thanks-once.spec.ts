/** Owner 2026-11-18 (ADR-105): after the fee is paid, the "plan renewed" thank-you shows once —
 *  not on every login, even when the shopkeeper never taps OK. Needs 03990000099 in SUPERUSER_PHONES. */

import { expect, test, type Page } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
test.setTimeout(120_000)

async function login(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })
}

test('the thank-you after paying shows once, not on every login', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const owner = phone()
  const made = await (await request.post('/api/v1/auth/signup', { data: { shop_name: `Thanks Shop ${owner.slice(-4)}`, owner_name: 'Thanks Owner', phone: owner, password: 'owner1234' } })).json()
  const sup = await (await request.post('/api/v1/auth/login', { data: { phone: SUPER.phone, password: SUPER.password } })).json()
  const paid = await request.post(`/api/v1/admin/shops/${made.me.active_shop_id}/payments`, { headers: { Authorization: `Bearer ${sup.tokens.access_token}` }, data: { amount: 2500, method: 'cash', months: 12 } })
  expect(paid.ok(), await paid.text()).toBeTruthy()

  // first login after the payment: the thank-you is there
  await login(page, owner, 'owner1234')
  const card = page.getByTestId('plan-thanks')
  await expect(card).toBeVisible({ timeout: 15_000 })
  await expect(card).toContainText('Thank you! Your plan is renewed')
  // the shopkeeper does not tap OK: he reloads, then logs out and in again
  await page.reload()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('plan-thanks')).toHaveCount(0)
  await page.evaluate(() => localStorage.removeItem('mobileshop.auth'))
  await login(page, owner, 'owner1234')
  await page.waitForTimeout(2500)
  await expect(page.getByTestId('plan-thanks')).toHaveCount(0)
})
