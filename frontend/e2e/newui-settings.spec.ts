/** ADR-134: shop settings in the new product, drawn from `07-shop-settings.html`. One "Save all
 *  changes" sends only what changed to the live settings (`PATCH /shops/current`, the barcode and FBR
 *  settings); the bill and the sticker on the right follow the form. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

test('new product: shop settings — five tabs, search, save all, the bill and sticker previews, as file 07 draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Settings Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/more/settings')
  await expect(page.getByTestId('nset')).toBeVisible()
  await expect(page.getByTestId('nset-save')).toBeDisabled()
  await expect(page.getByTestId('nset-bill-name')).toHaveText('Settings Naya')

  // 1. shop & branding: the bill follows the form
  await page.getByTestId('nset-address').fill('Shop 3, Katchery Bazar, Faisalabad')
  await page.getByTestId('nset-tagline').fill('New & used PTA phones')
  await page.getByTestId('nset-owner').fill('Abdul Owner')
  await expect(page.getByTestId('nset-count')).toHaveText('3')
  await expect(page.getByTestId('nset-bill')).toContainText('New & used PTA phones')
  await expect(page.getByTestId('nset-bill')).toContainText('Shop 3, Katchery Bazar')
  await page.screenshot({ path: 'test-results/newui-settings.png', fullPage: true })

  // 2. receipts & currency
  await page.getByTestId('nset-tab-2').click()
  await page.getByTestId('nset-sym-PKR').click()
  await expect(page.getByTestId('nset-cur-sample')).toHaveText('PKR 45,000')
  await expect(page.getByTestId('nset-bill-total')).toHaveText('PKR 45,000')
  await page.getByTestId('nset-pp-bank').check()
  await page.getByTestId('nset-bank').fill('Meezan Bank')
  await expect(page.getByTestId('nset-bill-bank')).toContainText('Meezan Bank')
  await page.getByTestId('nset-prefix').fill('CMB')
  await expect(page.getByTestId('nset-bill-no')).toHaveText('CMB-000123')

  // 3. barcode prefix and the code word on the sticker
  await page.getByTestId('nset-tab-3').click()
  await page.getByTestId('nset-bc-prefix').fill('AB')
  await page.getByTestId('nset-codeword').fill('QWERTYUIOP')
  await expect(page.getByTestId('nset-code-out')).toHaveText('TYQQQ')
  await expect(page.getByTestId('nset-sticker')).toContainText('TYQQQ')
  await page.getByTestId('nset-printer-sticker-usb').click()
  await page.getByTestId('nset-size-50x30').click()
  await expect(page.getByTestId('nset-preview')).toContainText('50×30 mm')
  await page.screenshot({ path: 'test-results/newui-settings-3.png' })

  // 4. tax and FBR
  await page.getByTestId('nset-tab-4').click()
  await page.getByTestId('nset-tax-on').check()
  await page.getByTestId('nset-tax-rate').fill('18')
  await page.getByTestId('nset-ntn').fill('1234567-8')
  await expect(page.getByTestId('nset-bill-ids')).toContainText('NTN: 1234567-8')
  await page.getByTestId('nset-hs-phone').fill('8517.1300')

  // 5. rules: an out-of-order age band blocks the save
  await page.getByTestId('nset-tab-5').click()
  await page.getByTestId('nset-below_asking-pin').click()
  await page.getByTestId('nset-band-1').fill('10')
  await expect(page.getByTestId('nset-save')).toBeDisabled()
  await page.getByTestId('nset-band-1').fill('30')
  await page.getByTestId('nset-cpid').fill('★')
  await expect(page.getByTestId('nset-sticker-cpid')).toHaveText('★')
  await page.screenshot({ path: 'test-results/newui-settings-5.png' })

  // save all
  await expect(page.getByTestId('nset-save')).toBeEnabled()
  await page.getByTestId('nset-save').click()
  await expect(page.getByTestId('nset-toast')).toHaveText('Saved')
  await expect(page.getByTestId('nset-count')).toHaveCount(0)
  const shop = await get('/shops/current')
  expect(shop.address).toBe('Shop 3, Katchery Bazar, Faisalabad')
  expect(shop.tagline).toBe('New & used PTA phones')
  expect(shop.owner_name).toBe('Abdul Owner')
  expect(shop.currency.symbol).toBe('PKR')
  expect(shop.print_prefs.bank).toBe(true)
  expect(shop.bank_details.bank).toBe('Meezan Bank')
  expect(shop.invoice_prefix).toBe('CMB')
  expect(shop.label_code_word).toBe('QWERTYUIOP')
  expect(shop.tax_enabled).toBe(true)
  expect(shop.tax_rate).toBe('18.00')
  expect(shop.sale_rules.below_asking).toBe('pin')
  expect(shop.device_prefs.cpid_label).toBe('★')
  expect(shop.audit_prefs).toBeNull() // put back as it was: not sent at all
  expect((await get('/barcodes/settings')).prefix).toBe('AB')
  expect((await get('/fbr/settings')).kinds.phone.hs_code).toBe('8517.1300')

  // the shop's own price pattern: the examples are the server's
  await page.getByTestId('nset-tab-3').click()
  await page.getByTestId('nset-pc-on').check()
  await expect(page.getByTestId('nset-pattern')).toBeVisible()
  await expect(page.getByTestId('nset-code-out')).not.toHaveText('…')
  await page.getByTestId('nset-save').click()
  await expect(page.getByTestId('nset-count')).toHaveCount(0)
  expect((await get('/shops/current')).price_code).not.toBeNull()

  // search across the tabs
  await page.getByTestId('nset-q').fill('barcode')
  await expect(page.getByTestId('nset-c-barcode')).toBeVisible()
  await expect(page.getByTestId('nset-c-shop')).toHaveCount(0)
  await page.getByTestId('nset-q').fill('')

  // Urdu: one language, right to left
  await page.getByTestId('nset-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-settings-ur.png', fullPage: true })
})
