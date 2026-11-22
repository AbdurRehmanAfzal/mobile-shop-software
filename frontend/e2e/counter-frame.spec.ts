/** Owner 2026-11-22 (ADR-132): the frame of the new screens as a design of its own, "Counter" —
 *  on a laptop a panel from top to bottom with the shop's name, the jobs as tiles with their keys,
 *  the shop's pages and who is logged in. The other designs and a phone stay as they were. */

import { expect, test } from '@playwright/test'

test('counter frame: the panel, its links and keys, Urdu, and nothing new on a phone', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  const phone = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'Frame Mobiles', owner_name: 'Imran Ali', phone, password: 'e2e-secret-1' } })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })
  // a shop that never chose keeps the design it had
  await expect(page.getByTestId('side-panel')).toHaveAttribute('data-layout', 'classic')

  await page.goto('/more/appearance')
  await page.getByTestId('look-layout-counter').click()
  const panel = page.getByTestId('side-panel')
  await expect(panel).toHaveAttribute('data-layout', 'counter')
  await expect(page.getByTestId('side-brand')).toContainText('Frame Mobiles')
  await expect(page.getByTestId('side-user')).toContainText('Imran Ali')
  await expect(page.getByTestId('side-user')).toContainText('Owner')
  // the panel runs the whole height and nothing in it is cut off at 1280 × 720
  const box = await panel.boundingBox()
  expect(box!.y).toBe(0)
  expect(Math.round(box!.height)).toBe(720)
  const jobs = page.getByTestId('side-jobs')
  for (const key of ['F2', 'F3', 'F4', 'F6', 'F7', 'F8', 'F9', 'F10']) await expect(jobs).toContainText(key)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/counter-frame.png' })

  // the tiles and the keys go where they went
  await jobs.getByRole('link', { name: /Stock/ }).last().click()
  await expect(page).toHaveURL(/\/stock\/summary$/)
  await expect(panel).toBeVisible()
  await page.keyboard.press('F4')
  await expect(page).toHaveURL(/\/khata$/)
  await page.getByTestId('side-shop').getByRole('link', { name: 'Purchases' }).click()
  await expect(page).toHaveURL(/\/purchases$/)
  await page.screenshot({ path: 'test-results/counter-frame-page.png' })
  await page.getByTestId('side-brand').click()
  await expect(page).toHaveURL(/\/$/)

  // Urdu: the panel sits on the right
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.reload()
  await expect(panel).toBeVisible()
  const ur = await panel.boundingBox()
  expect(Math.round(ur!.x + ur!.width)).toBe(1280)
  await page.screenshot({ path: 'test-results/counter-frame-ur.png' })
  await page.evaluate(() => localStorage.setItem('locale', 'en'))

  // a phone: no panel, the shop's name in the header and the bottom bar, as in every design
  await page.setViewportSize({ width: 390, height: 800 })
  await page.reload()
  await expect(panel).toBeHidden()
  await expect(page.getByRole('link', { name: 'Frame Mobiles' }).first()).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
})
