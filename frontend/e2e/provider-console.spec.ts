/** Provider console (docs/28): the product owner's business view — income, pending and coming
 *  fees, every shop's package / time left / channel / usage, and license keys (make, send on
 *  WhatsApp, magic link the shopkeeper opens without logging in, renew, cancel).
 *  Needs 03990000099 in SUPERUSER_PHONES and a renewal key pair in backend/.env. */

import { expect, test, type Page } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const isoIn = (days: number) => { const d = new Date(Date.now() + days * 86_400_000); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const API = 'http://localhost:8000/api/v1'

async function login(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test.setTimeout(150_000)

test('provider console: income, shops, channels, keys with WhatsApp and the magic link', async ({ page, request, context }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  await request.post(`${API}/auth/signup`, { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const adminLogin = await (await request.post(`${API}/auth/login`, { data: { phone: SUPER.phone, password: SUPER.password } })).json()
  const ah = { Authorization: `Bearer ${adminLogin.tokens.access_token}`, 'X-Shop-Id': adminLogin.me.active_shop_id }
  const ownerPhone = phone()
  const name = `Console Shop ${ownerPhone.slice(-4)}`
  const shop = await (await request.post(`${API}/auth/signup`, { data: { shop_name: name, owner_name: 'Hamza', phone: ownerPhone, password: 'e2e-secret-1' } })).json()
  const shopId = shop.me.active_shop_id
  await request.patch(`${API}/admin/shops/${shopId}/plan`, { headers: ah, data: { plan: 'pro', expires_on: isoIn(5), monthly_fee: 3500 } })
  await request.post(`${API}/admin/shops/${shopId}/payments`, { headers: ah, data: { amount: 3500, method: 'easypaisa', months: 1, reference: 'EP-771' } })

  await login(page, SUPER.phone, SUPER.password)
  await page.goto('/admin')
  await page.getByTestId('open-business').click()
  await expect(page.getByTestId('prov-overview')).toBeVisible()
  await expect(page.getByText('Monthly income (MRR)')).toBeVisible()
  await expect(page.getByTestId('prov-channels')).toContainText('easypaisa')
  await expect(page.getByTestId('prov-month')).not.toContainText('Rs. 0')
  await page.screenshot({ path: 'test-results/prov-overview.png', fullPage: true })

  // shops: package, time left, paid total, channel, usage
  await page.getByRole('button', { name: 'Shops', exact: true }).click()
  await page.getByPlaceholder(/Search/).first().fill(name)
  const row = page.getByTestId('prov-shops').getByRole('button', { name: new RegExp(name) })
  await expect(row).toContainText('pro')
  await expect(row).toContainText('Rs. 3,500')
  await expect(row).toContainText('easypaisa')
  await expect(row).toContainText('Online (website / app)')
  await row.click()
  const sheet = page.getByTestId('prov-shop-sheet')
  await expect(sheet).toContainText('EP-771')
  await expect(sheet.getByRole('link', { name: 'Remind on WhatsApp' })).toHaveAttribute('href', /wa\.me\/92/)
  // a key for this shop from its sheet
  await sheet.getByRole('button', { name: 'Make a key' }).click()
  await page.getByTestId('make-key').getByRole('button', { name: '3 months' }).click()
  await page.getByTestId('make-key').getByRole('button', { name: 'Make a key' }).click()
  await expect(page.getByText('Key made — send it')).toBeVisible()
  const card = page.getByTestId('key-card').last()
  const code = (await card.getByTestId('key-code').textContent())!.trim()
  expect(code.startsWith('MS1.')).toBeTruthy()
  // WhatsApp opens a wa.me link with the key in it
  const popup = context.waitForEvent('page')
  await card.getByRole('button', { name: 'Send on WhatsApp' }).click()
  const wa = await popup
  expect(decodeURIComponent(wa.url())).toContain(code.slice(0, 20))
  await wa.close()
  await expect(card).toContainText('Sent 1×')
  await page.screenshot({ path: 'test-results/prov-key.png', fullPage: true })

  // the magic link: copy it, open it logged out
  await card.getByTestId('copy-link').click()
  const link = (await card.getByTestId('key-link').textContent())!.trim()
  expect(link).toMatch(/\/key\/[\w-]+$/)
  const guest = await context.browser()!.newContext()
  const g = await guest.newPage()
  await g.addInitScript(() => localStorage.setItem('locale', 'en'))
  await g.goto(new URL(link).pathname.replace(/^/, 'http://localhost:5173'))
  await expect(g.getByTestId('shown-key')).toHaveText(code)
  await expect(g.getByText('Your renewal key')).toBeVisible()
  await g.screenshot({ path: 'test-results/prov-magic.png', fullPage: true })

  // renew: a new key; the old link now says expired
  await card.getByRole('button', { name: 'Renew (new key)' }).click()
  await g.reload()
  await expect(g.getByText(/This link has expired/)).toBeVisible()
  await guest.close()

  // keys tab and payments tab with the channel filter
  // two sheets are open (the shop, and "Make a key" on top of it)
  await page.getByRole('button', { name: 'Close' }).last().click()
  await page.getByRole('button', { name: 'Close' }).last().click()
  await expect(page.getByTestId('prov-shop-sheet')).toHaveCount(0)
  await page.getByRole('button', { name: 'Keys', exact: true }).click()
  await expect(page.getByTestId('prov-keys').getByText(name).first()).toBeVisible()
  await page.getByRole('button', { name: 'Payments', exact: true }).click()
  await page.getByTestId('prov-pay-channels').getByRole('button', { name: 'easypaisa' }).click()
  await expect(page.getByTestId('prov-pays')).toContainText(name)
})
