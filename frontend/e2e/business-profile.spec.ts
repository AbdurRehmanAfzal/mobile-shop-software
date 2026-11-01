/** Business profile (docs/30): logo upload, business / owner / tax details, the currency label used
 *  across the app, and the printed bill showing the logo, NTN and terms. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
// a 2x2 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGNkYPj/n4GBgYGJAQoYAAAhAgMB9b3iAAAAAElFTkSuQmCC', 'base64')

test('business profile: logo, details, currency label, printed bill', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Profile Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto('/more/settings')
  // logo
  await page.getByTestId('logo-input').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByTestId('logo-img')).toBeVisible()
  // business details
  await page.getByLabel('Registered business name').fill('Profile Traders (Pvt) Ltd')
  await page.getByLabel('Tagline (English)').fill('Phones you can trust')
  await page.getByLabel('Full address').fill('Shop 12, Hall Road')
  await page.getByRole('button', { name: 'Company (Pvt) Ltd' }).click()
  await page.getByRole('button', { name: 'Punjab', exact: true }).click()
  await page.getByTestId('save-business').click()
  await expect(page.getByTestId('save-business')).toContainText('Saved')
  // tax registration
  await page.getByLabel('NTN').fill('12345678')
  await page.getByLabel('FBR POS registration ID').fill('POS-4411')
  await page.getByTestId('save-tax').click()
  await expect(page.getByTestId('save-tax')).toContainText('Saved')
  // currency: PKR after the amount
  await page.getByTestId('currency-symbols').getByRole('button', { name: 'PKR' }).click()
  await page.getByRole('button', { name: 'After (500 PKR)' }).click()
  await expect(page.getByTestId('currency-preview')).toHaveText('45,000 PKR')
  await page.getByTestId('save-currency').click()
  await expect(page.getByTestId('save-currency')).toContainText('Saved')
  // printed bill: terms
  await page.getByLabel('Terms (English)').fill('No return after 7 days.')
  await page.getByTestId('save-print').click()
  await expect(page.getByTestId('save-print')).toContainText('Saved')
  await page.screenshot({ path: 'test-results/biz-settings.png', fullPage: true })

  // the app writes money with the new label
  await page.goto('/hisaab')
  await expect(page.getByText(/\d PKR/).first()).toBeVisible()

  // the printed bill (an item sale) shows logo, tagline, NTN, FBR POS ID, terms and the label
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const h = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const inv = await (await request.post('http://localhost:8000/api/v1/sales', { headers: h, data: { misc: [{ description: 'Charger', qty: 1, unit_price: 1500 }], paid: 1500 } })).json()
  const html = await (await request.get(`http://localhost:8000/api/v1/sales/${inv.id}/receipt?lang=en`, { headers: h })).text()
  expect(html).toContain('data:image/png;base64,')
  expect(html).toContain('Phones you can trust')
  expect(html).toContain('NTN 1234567-8')
  expect(html).toContain('FBR POS POS-4411')
  expect(html).toContain('No return after 7 days.')
  expect(html).toContain('1,500 PKR')
})
