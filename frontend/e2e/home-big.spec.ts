/** Owner 2026-11-15: Exchange and Sales list among the home actions; Business overview and Shop audit
 *  as two big tiles side by side. */

import { expect, test } from '@playwright/test'

test('home: daily actions and the two big report tiles', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'Home Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  const acts = page.getByTestId('fast-actions')
  await expect(acts.getByRole('link', { name: /Sales list/ })).toBeVisible()
  const ov = page.getByTestId('home-overview')
  const au = page.getByTestId('home-audit')
  await expect(ov).toBeVisible()
  await expect(au).toBeVisible()
  // side by side, the same size
  const a = (await ov.boundingBox())!
  const b = (await au.boundingBox())!
  expect(Math.abs(a.y - b.y)).toBeLessThan(2)
  expect(Math.abs(a.width - b.width)).toBeLessThan(2)
  await page.screenshot({ path: 'test-results/home-big.png', fullPage: true })
  await au.click()
  await expect(page).toHaveURL(/\/audit/)
  await page.goBack()
  await page.getByTestId('home-overview').click()
  await expect(page).toHaveURL(/\/overview$/)
})
