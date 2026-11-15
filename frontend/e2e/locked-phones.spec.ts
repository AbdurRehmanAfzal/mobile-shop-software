/** Owner 2026-11-15 (ADR-085): an iCloud-locked phone is bought with a short form (no IMEI), kept
 *  apart in stock (the Locked card), named on its page, and taken apart for parts. */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('buy a locked phone and use it for parts', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Lock Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  await request.post('/api/v1/parties', { headers: h, data: { name: 'Lock Traders', phone: '03217772222', kinds: ['supplier'] } })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // the purchase: + Locked phone, a short form without the IMEI
  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /From a dealer/ }).click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Lock')
  await page.getByRole('button', { name: /Lock Traders/ }).first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByTestId('add-locked').click()
  const sheet = page.getByTestId('locked-sheet')
  await expect(sheet).toBeVisible()
  await expect(sheet.getByTestId('lock-icloud')).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Apple', exact: true }).click()
  await sheet.getByRole('button', { name: /^iPhone/ }).first().click()
  await sheet.getByTestId('locked-cost').fill('30000')
  await page.screenshot({ path: 'test-results/locked-sheet.png', fullPage: true })
  await sheet.getByTestId('locked-save').click()
  await expect(page.getByText('iCloud locked').first()).toBeVisible()
  await page.getByTestId('purchase-review-open').click()
  await page.getByTestId('review-ok').check()
  await page.getByTestId('purchase-save').click()

  let devId = ''
  await expect.poll(async () => {
    const list = await (await request.get('/api/v1/devices?locked=true', { headers: h })).json()
    devId = list[0]?.id ?? ''
    return list.length ? [list[0].lock_type, String(list[0].imei1).startsWith('LCK')] : null
  }).toEqual(['icloud', true])

  // stock: the Locked card filters to it
  await page.goto('/stock')
  await page.getByTestId('stock-cards').getByRole('button', { name: /Locked/ }).click()
  await expect(page.getByText('iCloud locked').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/locked-stock.png', fullPage: true })

  // its page: the panel, then Use for parts
  await page.goto(`/stock/${devId}`)
  await expect(page.getByTestId('locked-panel')).toBeVisible()
  await page.getByTestId('use-for-parts').click()
  await page.getByRole('button', { name: 'Camera', exact: true }).click()
  await page.getByRole('button', { name: 'Battery', exact: true }).click()
  await page.getByTestId('parts-confirm').click()
  await expect(page.getByTestId('locked-panel')).toContainText('Used for parts')
  const dev = await (await request.get(`/api/v1/devices/${devId}`, { headers: h })).json()
  expect(dev.status).toBe('used_for_parts')
  await page.screenshot({ path: 'test-results/locked-parts.png', fullPage: true })
})
