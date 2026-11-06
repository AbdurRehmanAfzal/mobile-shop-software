/** Owner (2026-10-29): the public landing page — a visitor on / sees it, the request form reaches the
 *  super admin, who opens the shop from it. Needs 03990000099 in SUPERUSER_PHONES. */

import { expect, test } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
test.setTimeout(120_000)

test('landing page: modules, prices, request a shop; the super admin opens it from the request', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })

  await page.goto('/')
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.getByRole('heading', { name: 'Run your mobile shop from your phone' })).toBeVisible()
  // the prices (the module guide's examples carry rupee amounts too): yearly first, then monthly
  await expect(page.locator('#pricing').getByText('Rs. 15,000')).toBeVisible()
  await page.getByTestId('billing-month').click()
  await expect(page.locator('#pricing').getByText('Rs. 1,500')).toBeVisible()
  await expect(page.locator('#pricing').getByText('Rs. 3,000')).toBeVisible()
  await page.getByTestId('billing-year').click()
  // the video beside what it shows, and the module guide opens with both explanations
  await expect(page.getByTestId('landing-video')).toContainText('Repair labs')
  await page.getByTestId('landing-guide').locator('summary').first().click()
  await expect(page.getByTestId('landing-guide')).toContainText('How it works inside')
  await expect(page.getByText('Repairs', { exact: true }).first()).toBeVisible()
  await expect(page.locator('video')).toBeVisible()
  // owner 2026-11-03: what makes it different, a yearly price, our sites, a readable CTA
  const unique = page.getByTestId('landing-unique')
  for (const t of ['Android app', 'Works offline', "Seller's signed consent", 'Used-phone verification']) await expect(unique).toContainText(t)
  await expect(unique.getByRole('link', { name: 'Download the app' })).toHaveAttribute('href', '/app.apk')
  await expect(page.getByTestId('year-pro')).toContainText('Rs. 30,000')
  await page.getByTestId('billing-month').click()
  await expect(page.locator('#pricing').getByText('Rs. 3,000')).toBeVisible()
  await expect(page.getByTestId('landing-sites').getByRole('link', { name: /ifixapplephone\.com/ })).toHaveAttribute('href', 'https://ifixapplephone.com')
  await expect(page.getByTestId('landing-sites').getByRole('link', { name: /oopsolutions\.com/ })).toHaveAttribute('href', 'https://oopsolutions.com')
  // owner 2026-11-06: the FBR band, honest that it is off until the shop's NTN and token are in
  const fbr = page.getByTestId('landing-fbr')
  await expect(fbr).toContainText('Bills ready for FBR')
  await expect(fbr).toContainText('QR code')
  await expect(fbr).toContainText('Off by default')
  await expect(page.locator('#new')).toContainText('Ready for FBR Digital Invoicing')
  await expect(page.locator('#new')).toContainText('Move stock between branches')
  expect(await page.getByTestId('hero-cta').evaluate((e) => getComputedStyle(e).color)).toBe('rgb(14, 22, 19)')
  await page.screenshot({ path: 'test-results/landing.png', fullPage: true })
  // Urdu
  await page.getByRole('button', { name: 'اردو' }).click()
  await expect(page.getByRole('heading', { name: 'اپنی موبائل شاپ اپنے فون سے چلائیں' })).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()

  // the request form
  const phone = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  await page.getByLabel('Your name').fill('Hamza Iqbal')
  await page.getByLabel('Shop name', { exact: true }).fill('Hamza Mobile Centre')
  await page.getByLabel('City').fill('Multan')
  await page.getByLabel('Mobile number').fill(phone.slice(1))
  await page.getByRole('button', { name: 'pro', exact: true }).click()
  await page.getByRole('button', { name: 'Send request' }).click()
  await expect(page.getByText(/Thank you! We will contact you/)).toBeVisible()

  // the super admin sees it and opens the shop from it (owner name, phone and plan prefilled)
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(SUPER.phone)
  await page.getByLabel('Password').fill(SUPER.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/admin')
  await expect(page.getByText('Shop requests from the website')).toBeVisible()
  const row = page.locator('div', { hasText: /^Hamza Mobile Centre · Multan/ }).first()
  await expect(page.getByText('Hamza Mobile Centre · Multan').first()).toBeVisible()
  void row
  await page.locator('div', { has: page.getByText(`Hamza Iqbal · ${phone}`) }).getByRole('button', { name: 'Open a new shop' }).last().click()
  await expect(page.getByLabel("Owner's name")).toHaveValue('Hamza Iqbal')
  await expect(page.getByLabel("Owner's mobile (login)")).toHaveValue(phone.slice(1))
  await expect(page.getByRole('button', { name: 'pro', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Open a new shop' }).last().click()
  await expect(page.getByText('Shop opened')).toBeVisible({ timeout: 30_000 })
  await page.keyboard.press('Escape')
  await expect(page.getByText(`Hamza Iqbal · ${phone}`)).toHaveCount(0)
})
