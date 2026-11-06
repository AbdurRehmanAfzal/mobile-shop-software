/** docs/36 §4 (ADR-050): the owner sets up FBR Digital Invoicing in Settings — the token is saved
 *  and never shown again, switching on needs the NTN; a shop without FBR shows no FBR line on bills.
 *  (No bill is sent here: the real FBR is not called from the tests.) */

import { expect, test } from '@playwright/test'

test('FBR Digital Invoicing settings', async ({ page, request }) => {
  const phone = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await (await request.post('/api/v1/auth/signup', { data: { shop_name: 'FBR Shop', owner_name: 'Owner', phone, password: 'e2e-secret-1' } })).json()
  const h = { Authorization: `Bearer ${s.tokens.access_token}`, 'X-Shop-Id': s.me.active_shop_id ?? s.me.shops[0].id }

  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto('/more/settings')
  await expect(page.getByText('FBR Digital Invoicing').first()).toBeVisible()
  await expect(page.getByText("Add the shop's NTN under Tax registration first.")).toBeVisible()
  // the token alone, switched on without an NTN: refused
  await page.getByTestId('fbr-token').fill('sandbox-token-abc')
  await page.getByText('Send bills to FBR', { exact: true }).click()
  const card = page.locator('section', { has: page.getByText('FBR Digital Invoicing') }).last()
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.getByText(/NTN/).last()).toBeVisible()

  // with the NTN it saves; the token is never shown again
  await request.patch('/api/v1/shops/current', { headers: h, data: { ntn: '0786909' } })
  await page.reload()
  await page.getByTestId('fbr-token').fill('sandbox-token-abc')
  await page.getByText('Send bills to FBR', { exact: true }).click()
  const card2 = page.locator('section', { has: page.getByText('FBR Digital Invoicing') }).last()
  await card2.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card2.getByRole('button', { name: 'Saved' })).toBeVisible()
  const st = await (await request.get('/api/v1/fbr/settings', { headers: h })).json()
  expect(st.enabled && st.token_set && st.env === 'sandbox').toBeTruthy()
  expect(JSON.stringify(st)).not.toContain('sandbox-token-abc')
  await page.reload()
  await expect(page.getByTestId('fbr-token')).toHaveValue('')
  await expect(page.getByTestId('fbr-token')).toHaveAttribute('placeholder', /saved/)
  await page.screenshot({ path: 'test-results/fbr-settings.png', fullPage: true })
  // switch it off again so nothing is sent to FBR from tests
  await request.put('/api/v1/fbr/settings', { headers: h, data: { enabled: false } })
})
