/** ADR-134: the new product lives at its own address, `/new`, with the frame drawn in the owner's
 *  mock-ups — a 252px panel (shop mark and name, the counter's tiles with their F-keys, the nine
 *  shop tiles, the IMEI hint) and a sticky bar with search, language, light / dark and the user.
 *  The software the shops run is untouched: its own addresses look and work exactly as before. */

import { expect, test } from '@playwright/test'

test('the new product at /new: its frame, its keys, Urdu, and the live software untouched', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'Naya Mobiles', owner_name: 'Imran Ali', phone: ph, password: 'e2e-secret-1' } })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  // the live software is as it always was: its own frame, no panel of the new product
  await expect(page.getByTestId('side-panel')).toHaveAttribute('data-layout', 'classic')
  await expect(page.getByTestId('newui-panel')).toHaveCount(0)
  await page.goto('/more/appearance')
  await expect(page.getByTestId('look-layout-counter')).toHaveCount(0) // the new product is not a "look"

  // the new product
  await page.goto('/new')
  const panel = page.getByTestId('newui-panel')
  await expect(panel).toBeVisible()
  await expect(page.getByTestId('newui-brand')).toContainText('Naya Mobiles')
  const box = await panel.boundingBox()
  expect(Math.round(box!.width)).toBe(252)
  expect(box!.y).toBe(0)
  expect(Math.round(box!.height)).toBe(720)
  const jobs = page.getByTestId('newui-jobs')
  for (const key of ['F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10']) await expect(jobs).toContainText(key)
  await expect(page.getByTestId('newui-tiles').getByRole('link')).toHaveCount(9)
  await expect(page.getByTestId('newui-bar')).toBeVisible()
  await expect(page.getByTestId('newui-search')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/newui-frame.png' })

  // a screen that is not drawn yet says so and opens the one that works
  await expect(page.getByTestId('newui-soon')).toBeVisible()
  await jobs.getByRole('link', { name: /Stock/ }).click()
  await expect(page).toHaveURL(/\/new\/stock\/summary$/)
  await expect(panel).toBeVisible()
  await expect(page.getByTestId('nsum')).toBeVisible() // drawn: the stock summary
  await page.getByTestId('newui-tiles').getByRole('link', { name: 'Purchases' }).click()
  await expect(page).toHaveURL(/\/new\/purchases$/)
  await expect(page.getByTestId('nlist')).toBeVisible() // drawn (file 10): full screen with its own rail
  await page.goto('/new/stock/summary')
  await page.keyboard.press('F4')
  await expect(page).toHaveURL(/\/new\/(khata|parties)/)
  await expect(page.getByTestId('nkh').or(page.getByTestId('nkh-wait'))).toBeVisible() // drawn (file 06)
  await page.goto('/new/reports')
  await expect(page.getByTestId('newui-open-old')).toHaveAttribute('href', '/reports') // not drawn yet

  // dark, as the mock-up draws it
  await page.getByTestId('newui-theme').click()
  await expect(page.locator('[data-newui="1"]')).toBeVisible()
  await page.screenshot({ path: 'test-results/newui-frame-dark.png' })
  await page.getByTestId('newui-theme').click()

  // Urdu: the panel moves to the right
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.reload()
  await expect(panel).toBeVisible()
  const ur = await panel.boundingBox()
  expect(Math.round(ur!.x + ur!.width)).toBe(1280)
  await page.screenshot({ path: 'test-results/newui-frame-ur.png' })
  await page.evaluate(() => localStorage.setItem('locale', 'en'))

  // a phone: the panel is behind the menu button
  await page.setViewportSize({ width: 390, height: 800 })
  await page.goto('/new')
  await expect(page.getByTestId('newui-menu')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.getByTestId('newui-menu').click()
  await expect(panel).toBeInViewport()
  await page.screenshot({ path: 'test-results/newui-frame-phone.png', fullPage: true })
})
