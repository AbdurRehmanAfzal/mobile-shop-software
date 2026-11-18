/** Owner 2026-11-18 (ADR-107): a customer or dealer of another country — the country code in front
 *  of every mobile-number box is a picker; Pakistan stays the default and works as before. */

import { expect, test } from '@playwright/test'

test.setTimeout(120_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('a dealer in Dubai and a Pakistani customer: country code picker on the mobile number', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'World Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }

  // login: +92 is in front, the number goes in as always
  await page.goto('/login')
  await expect(page.getByTestId('phone-dial')).toHaveText('+92')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })

  // a new dealer in the UAE
  const tail = String(Date.now()).slice(-6)
  await page.goto('/parties')
  await page.getByRole('button', { name: 'New person' }).click()
  const sheet = page.getByTestId('sheet-backdrop')
  await sheet.getByLabel('Name', { exact: true }).fill('Dubai Trader')
  await sheet.getByTestId('phone-country').selectOption('AE')
  await expect(sheet.getByTestId('phone-dial')).toHaveText('+971')
  await expect(sheet.getByTestId('phone-country-hint')).toContainText('United Arab Emirates')
  await expect(sheet.getByTestId('phone-country-hint')).toContainText('+971 50 123 4567')
  const box = sheet.getByLabel('Mobile number (optional)')
  // too short: the box says so; then the whole number, written with the 0 people put in front
  await box.fill('50123')
  await box.blur()
  await expect(sheet.getByText(/too short or too long/)).toBeVisible()
  await page.screenshot({ path: 'test-results/phone-country.png', fullPage: true })
  await box.fill(`0501${tail}99999`)
  await expect(box).toHaveValue(`501${tail}`) // stops at the UAE's nine digits, the 0 dropped
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect.poll(async () => (await (await request.get('/api/v1/parties?q=Dubai', { headers: h })).json()).map((p: { phone: string }) => p.phone)).toEqual([`+971501${tail}`])

  // a whole number pasted with its code picks the country by itself
  await page.goto('/parties')
  await page.getByRole('button', { name: 'New person' }).click()
  await sheet.getByLabel('Name', { exact: true }).fill('London John')
  await sheet.getByLabel('Mobile number (optional)').fill(`+44 7911 ${tail}`)
  await expect(sheet.getByTestId('phone-dial')).toHaveText('+44')
  await expect(sheet.getByLabel('Mobile number (optional)')).toHaveValue(`7911${tail}`)
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect.poll(async () => (await (await request.get('/api/v1/parties?q=London', { headers: h })).json()).map((p: { phone: string }) => p.phone)).toEqual([`+447911${tail}`])

  // a Pakistani customer as before; and the dealer's page opens with his country in front
  await page.goto('/parties')
  await page.getByRole('button', { name: 'New person' }).click()
  await expect(sheet.getByTestId('phone-dial')).toHaveText('+92')
  await sheet.getByLabel('Name', { exact: true }).fill('Lahore Ali')
  await sheet.getByLabel('Mobile number (optional)').fill(`0300${tail}1`)
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect.poll(async () => (await (await request.get('/api/v1/parties?q=Lahore', { headers: h })).json()).map((p: { phone: string }) => p.phone)).toEqual([`0300${tail}1`])
  const dealer = (await (await request.get('/api/v1/parties?q=Dubai', { headers: h })).json())[0]
  await page.goto(`/parties/${dealer.id}?edit=1`)
  await expect(page.getByTestId('phone-dial').first()).toHaveText('+971')
  await expect(page.getByLabel('Mobile number (optional)')).toHaveValue(`501${tail}`)
})
