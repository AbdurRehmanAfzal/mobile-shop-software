/** docs/36 §6 (owner 2026-11-06): phones taxed at import carry no tax on a taxed bill; the counter types
 *  the cash given and sees the change; the bill prints both, the tax by rate and the amount in words. */

import { expect, test } from '@playwright/test'

test('phone taxed at import, cash given and change, amount in words', async ({ page, request }) => {
  const phone = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await (await request.post('/api/v1/auth/signup', { data: { shop_name: 'Tax Invoice Shop', owner_name: 'Owner', phone, password: 'e2e-secret-1' } })).json()
  const h = { Authorization: `Bearer ${s.tokens.access_token}`, 'X-Shop-Id': s.me.active_shop_id ?? s.me.shops[0].id }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const brand = brands.find((b: { name: string }) => b.name === 'Samsung') ?? brands[0]
  const model = (await (await request.get(`/api/v1/catalogue/models?brand_id=${brand.id}`, { headers: h })).json())[0]
  await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 38000, asking_price: 40000 } })

  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // the owner switches it on in Settings
  await page.goto('/more/settings')
  await page.getByText('Phones: sales tax paid at import (no tax on the bill)').click()
  await page.getByRole('button', { name: 'Save', exact: true }).last().click()
  await expect.poll(async () => (await (await request.get('/api/v1/shops/current', { headers: h })).json()).phones_tax_at_import).toBe(true)

  await page.goto('/sale/new')
  await page.getByRole('button', { name: new RegExp(model.name) }).first().click()
  await page.getByLabel('Add tax to this bill').check()
  await expect(page.getByLabel('Tax %')).toHaveValue('18')
  // no tax on the phone: the bill stays 40,000
  await expect(page.getByText('Rs. 40,000').last()).toBeVisible()
  await page.getByLabel('Cash given by the customer').fill('41000')
  await expect(page.getByTestId('change')).toHaveText('Rs. 1,000')
  await page.screenshot({ path: 'test-results/bill-details-sale.png', fullPage: true })
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  const sales = await (await request.get('/api/v1/sales?limit=1', { headers: h })).json()
  const inv = (Array.isArray(sales) ? sales : sales.items)[0]
  expect(inv.tax_amount).toBe('0.00')
  const html = await (await request.get(`/api/v1/sales/${inv.id}/receipt?lang=en`, { headers: h })).text()
  for (const want of ['Rupees Forty Thousand Only', 'Cash given', 'Change', 'Ninth Schedule', 'Cashier:']) expect(html).toContain(want)
})
