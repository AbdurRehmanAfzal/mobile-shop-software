/** docs/35 §5 item 5 (owner 2026-11-04): the shop sends a repair's status link; the customer opens
 *  it without logging in and sees the progress and what is left to pay, never the phone number. */

import { expect, test } from '@playwright/test'

test('repair status link for the customer', async ({ page, browser, request }) => {
  const phone = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await (await request.post('/api/v1/auth/signup', { data: { shop_name: 'Fix Point', owner_name: 'Owner', phone, password: 'e2e-secret-1' } })).json()
  const h = { Authorization: `Bearer ${s.tokens.access_token}`, 'X-Shop-Id': s.me.active_shop_id ?? s.me.shops[0].id }
  const cust = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Usman Tariq', phone: '03215550003', kinds: ['customer'] } })).json()
  const job = await (await request.post('/api/v1/repairs', { headers: h, data: { party_id: cust.id, device_desc: 'Vivo Y20', imei: '352099001761481', fault_codes: ['screen'], estimate: 5500, advance: 1000, promised_at: '2030-01-05' } })).json()
  await request.post(`/api/v1/repairs/${job.id}/status`, { headers: h, data: { status: 'in_progress' } })

  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto(`/repairs/${job.id}`)
  await page.getByRole('button', { name: 'Send status link to customer' }).click()
  const sheet = page.getByTestId('status-link-sheet')
  await expect(sheet.getByRole('link', { name: /Send on WhatsApp/ })).toHaveAttribute('href', /wa\.me\/923215550003\?text=.*%2Fr%2F/)
  const url = (await page.getByTestId('status-link').textContent())!.trim()
  expect(url).toMatch(/\/r\/[0-9a-f]{32}\.[0-9a-f]{24}$/)

  // the customer: a fresh browser, no login
  const ctx = await browser.newContext()
  const cust_page = await ctx.newPage()
  await cust_page.addInitScript(() => localStorage.setItem('locale', 'en'))
  await cust_page.goto(url)
  const view = cust_page.getByTestId('repair-status-page')
  await expect(view).toContainText('Fix Point')
  await expect(view).toContainText('Vivo Y20')
  await expect(view).toContainText('In progress')
  await expect(view).toContainText('4,500')
  await expect(view).not.toContainText('03215550003')
  await expect(view).not.toContainText('352099001761481')
  await cust_page.screenshot({ path: 'test-results/repair-status.png', fullPage: true })
  // Urdu
  await cust_page.getByRole('button', { name: 'اردو' }).click()
  await expect(view).toContainText('باقی دینے ہیں')
  // a changed link opens nothing
  await cust_page.goto(url.replace(/.$/, (c) => (c === '0' ? '1' : '0')))
  await expect(cust_page.getByTestId('repair-status-page')).toContainText(/not valid|درست نہیں/)
  await ctx.close()
})
