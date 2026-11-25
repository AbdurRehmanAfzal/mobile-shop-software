/** ADR-134 / ADR-050: FBR digital invoicing in the new product — no file draws it, so it is drawn like
 *  file 03. The setup checklist is the live FBR settings (the token is never sent to the app); the
 *  bills are the live submissions. Tests never call the real FBR: no sale is made with FBR on, and
 *  neither "Test FBR" nor "Send again" is pressed. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

test('new product: FBR — off and not set up, then the token and NTN saved and switched on; the setup opens tab 4', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'FBR Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  // a new shop: off, nothing set up, no bills
  await page.goto('/new/fbr')
  await expect(page.getByTestId('nfbr')).toBeVisible()
  await expect(page.getByTestId('nfbr-env')).toHaveText('Off')
  await expect(page.getByTestId('nfbr-ready')).toHaveText('Not set up yet')
  await expect(page.getByTestId('nfbr-test')).toBeDisabled()
  await expect(page.getByTestId('nfbr-empty')).toBeVisible()
  await expect(page.getByTestId('nfbr-k-sent')).toContainText('0')

  // the NTN and a (fake) token saved, switched on in sandbox — nothing is sold, so nothing goes to FBR
  expect((await request.patch('/api/v1/shops/current', { headers: h, data: { ntn: '1234567-8' } })).ok()).toBeTruthy()
  expect((await request.put('/api/v1/fbr/settings', { headers: h, data: { enabled: true, env: 'sandbox', token: 'not-a-real-token' } })).ok()).toBeTruthy()
  const live = await (await request.get('/api/v1/fbr/settings', { headers: h })).json()
  expect(live.token_set).toBe(true)
  expect(JSON.stringify(live)).not.toContain('not-a-real-token') // the token never comes back
  await page.reload()
  await expect(page.getByTestId('nfbr-env')).toHaveText('Sandbox (test)')
  await expect(page.getByTestId('nfbr-ready')).toHaveText('On — new sale bills are sent to FBR')
  await expect(page.getByTestId('nfbr-steps')).toContainText('NTN saved')
  await expect(page.getByTestId('nfbr-setup')).toContainText('1234567-8')
  await expect(page.getByTestId('nfbr-test')).toBeEnabled()
  await page.screenshot({ path: 'test-results/newui-fbr.png', fullPage: true })

  // the setup opens Shop settings on its FBR tab
  await page.getByTestId('nfbr-settings').click()
  await expect(page).toHaveURL(/\/new\/more\/settings\?tab=4$/)
  await expect(page.getByTestId('nset-c-fbr')).toBeVisible()
  await expect(page.getByTestId('nset-fbr-on')).toBeChecked()

  // Urdu: one language, right to left
  await page.goto('/new/fbr')
  await page.getByTestId('nfbr-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-fbr-ur.png', fullPage: true })
  // switched off again, so no later test sends anything
  await request.put('/api/v1/fbr/settings', { headers: h, data: { enabled: false } })
})
