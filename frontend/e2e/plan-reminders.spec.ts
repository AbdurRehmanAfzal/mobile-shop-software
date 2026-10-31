/** Owner addendum 3 (2026-10-31, docs/19): the subscription bar and the three-language popup,
 *  snooze on the server, no popup on the sale form, payment proof → calm blue bar, verification →
 *  thank-you with a receipt, soft-lock with backup, billing settings for the provider only.
 *  Needs 03990000099 in SUPERUSER_PHONES (backend/.env), like plans.spec. */

import { expect, test, type Page } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const isoIn = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10)
const API = 'http://localhost:8000/api/v1'

async function login(page: Page, ph: string, pw: string) {
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill(pw)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test.setTimeout(150_000)

test('plan reminders: bar, trilingual popup, snooze, no popup on the sale form, pending → verified → thanks, soft-lock', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  // the provider and a customer shop
  await request.post(`${API}/auth/signup`, { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const adminLogin = await (await request.post(`${API}/auth/login`, { data: { phone: SUPER.phone, password: SUPER.password } })).json()
  const ah = { Authorization: `Bearer ${adminLogin.tokens.access_token}`, 'X-Shop-Id': adminLogin.me.active_shop_id }
  const owner = phone()
  const shop = await (await request.post(`${API}/auth/signup`, { data: { shop_name: 'Reminder Shop', owner_name: 'Hamza', phone: owner, password: 'e2e-secret-1' } })).json()
  const shopId = shop.me.active_shop_id
  // billing details from the provider; the plan ends in 3 days with a fee of 2,500
  await request.put(`${API}/admin/billing`, { headers: ah, data: { bank: { bank_name: 'Meezan Bank', account_title: 'OOP Solutions', account_number: '0123456789', iban: 'PK36MEZN0000000123456789', branch: 'Faisalabad' }, support: { phone: '+92 316 4001668', whatsapp: '+92 316 4001668' } } })
  await request.patch(`${API}/admin/shops/${shopId}/plan`, { headers: ah, data: { plan: 'pro', expires_on: isoIn(3), monthly_fee: 2500 } })

  // login: orange bar + the popup in three languages, with the bank details
  await login(page, owner, 'e2e-secret-1')
  const bar = page.getByTestId('plan-bar')
  await expect(bar).toHaveAttribute('data-tone', 'orange')
  await expect(bar).toContainText('Your plan ends in 3 days')
  await expect(bar).toContainText('Plan khatam hone mein 3 din baqi hain')
  const pop = page.getByTestId('plan-popup')
  await expect(pop).toBeVisible()
  await expect(pop).toContainText('Your plan ends in 3 days')
  await expect(pop).toContainText('آپ کا پلان 3 دن میں ختم ہو رہا ہے')
  await expect(pop).toContainText('Aap ka plan 3 din mein khatam ho raha hai')
  await expect(pop.getByTestId('plan-pay-details')).toContainText('PK36MEZN0000000123456789')
  await expect(pop).toContainText('Rs. 2,500')
  await page.screenshot({ path: 'test-results/plan-popup.png', fullPage: true })
  // snooze 4 hours: the popup closes and stays closed after a reload (server-side)
  await pop.getByTestId('plan-later').click()
  await pop.getByTestId('plan-snooze').getByRole('button', { name: /In 4 hours/ }).click()
  await expect(pop).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('plan-bar')).toBeVisible()
  await expect(page.getByTestId('plan-popup')).toHaveCount(0)
  // the bar's Details reopens it by hand; close = snooze again
  await page.getByTestId('plan-bar').getByRole('button', { name: 'Details' }).click()
  await expect(page.getByTestId('plan-popup')).toBeVisible()
  await page.getByTestId('plan-close').click()
  await expect(page.getByTestId('plan-popup')).toHaveCount(0)

  // never on the sale form, even when the server would show it (fresh snooze state: 1 day left)
  await request.patch(`${API}/admin/shops/${shopId}/plan`, { headers: ah, data: { expires_on: isoIn(1) } })
  await page.goto('/sale/new')
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('plan-popup')).toHaveCount(0)
  await expect(page.getByTestId('plan-bar')).toHaveAttribute('data-tone', 'red')
  // back on Home it may show; the urgent stage only offers "a few hours"
  await page.goto('/')
  await expect(page.getByTestId('plan-popup')).toBeVisible()
  await page.getByTestId('plan-later').click()
  await expect(page.getByTestId('plan-snooze').getByRole('button')).toHaveCount(1)

  // Pay fee now → the fees page with the bank details and the proof form; a blue bar afterwards
  await page.getByTestId('plan-pay').click()
  await expect(page).toHaveURL(/\/more\/fees$/)
  await expect(page.getByTestId('fees-bank')).toContainText('Meezan Bank')
  await expect(page.getByLabel('Amount (Rs)')).toHaveValue('2500')
  await page.getByLabel('Transaction ID / reference').fill('TX-777')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(page.getByText(/Thank you. The software provider will check it/)).toBeVisible()
  await page.goto('/')
  await expect(page.getByTestId('plan-bar')).toHaveAttribute('data-tone', 'blue')
  await expect(page.getByTestId('plan-bar')).toContainText('Payment received, verification pending')
  await expect(page.getByTestId('plan-popup')).toHaveCount(0)

  // the provider verifies: the bar is gone, the thank-you shows once with the receipt number
  const pending = await (await request.get(`${API}/admin/fee-payments?status=pending`, { headers: ah })).json()
  const approved = await (await request.post(`${API}/admin/fee-payments/${pending[0].id}/approve`, { headers: ah, data: {} })).json()
  expect(approved.receipt_no).toMatch(/^SUB-\d{4}$/)
  await page.reload()
  const thanks = page.getByTestId('plan-thanks')
  await expect(thanks).toBeVisible()
  await expect(thanks).toContainText('Thank you! Your plan is renewed')
  await expect(thanks).toContainText(approved.receipt_no)
  await page.screenshot({ path: 'test-results/plan-thanks.png' })
  await thanks.getByTestId('plan-thanks-ok').click()
  await expect(page.getByTestId('plan-bar')).toHaveCount(0)
  await page.reload()
  await expect(page.getByTestId('plan-thanks')).toHaveCount(0)

  // soft-lock: the full-screen notice, view still works, backup downloads, the sale is refused
  await request.patch(`${API}/admin/shops/${shopId}/plan`, { headers: ah, data: { expires_on: isoIn(-30) } })
  await page.goto('/')
  const lock = page.getByTestId('plan-lock')
  await expect(lock).toBeVisible()
  await expect(lock).toContainText('The plan has ended')
  await expect(lock).toContainText('پلان ختم ہو گیا ہے')
  await page.screenshot({ path: 'test-results/plan-lock.png' })
  await lock.getByTestId('plan-lock-view').click()
  await expect(lock).toHaveCount(0)
  await expect(page.getByTestId('plan-bar')).toHaveAttribute('data-tone', 'locked')
  await page.goto('/more/fees')
  const dl = page.waitForEvent('download')
  await page.getByTestId('fees-backup').click()
  expect((await dl).suggestedFilename()).toMatch(/^mobileshop-backup-.*\.zip$/)
  const oh = { Authorization: `Bearer ${shop.tokens.access_token}`, 'X-Shop-Id': shopId }
  const refused = await request.post(`${API}/parties`, { headers: oh, data: { name: 'Ali Raza', phone: '03001112233', kinds: ['customer'] } })
  expect(refused.status()).toBe(403)

  // the provider: billing sheet, a manual payment with a receipt, a renewal code
  await page.evaluate(() => localStorage.removeItem('mobileshop.auth'))
  await login(page, SUPER.phone, SUPER.password)
  await page.goto('/admin')
  await page.getByTestId('billing-open').click()
  await expect(page.getByTestId('billing-sheet')).toBeVisible()
  await expect(page.getByLabel('Bank name')).toHaveValue('Meezan Bank')
  await page.getByLabel('Grace days after expiry').fill('10')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByText('Reminder Shop').first().click()
  await page.getByTestId('record-payment').click()
  await expect(page.getByText(/Receipt SUB-\d{4}/).first()).toBeVisible()
  await page.getByTestId('make-code').click()
  await expect(page.getByTestId('renewal-code-out')).toContainText('MS1.', { timeout: 15_000 })
})
