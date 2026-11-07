/** Owner 2026-11-07: an Appearance page (from the dashboard and the profile menu) where the user
 *  changes the theme, the design of the dashboard and side panel (Classic, Tiles, Simple, Bold),
 *  the colours, main colour, text size, corners and font; every design keeps the whole side panel
 *  on one 1280×720 screen, in English and Urdu, and a phone never scrolls sideways. */

import { expect, test, type Page } from '@playwright/test'

const SHOTS = process.env.LOOK_SHOTS // a folder: save a screenshot of each design there

async function signupAndLogin(page: Page, request: import('@playwright/test').APIRequestContext) {
  const phone = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'Look Shop', owner_name: 'Imran Ali', phone, password: 'e2e-secret-1' } })
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(phone.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test('appearance: every design, colour and size, on a laptop', async ({ page, request }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await signupAndLogin(page, request)

  // from the dashboard
  await page.getByTestId('home-appearance').click()
  await expect(page).toHaveURL(/\/more\/appearance$/)
  await expect(page.getByTestId('appearance-page')).toBeVisible()

  for (const lang of ['en', 'ur'] as const) {
    if (lang === 'ur') {
      await page.evaluate(() => localStorage.setItem('locale', 'ur'))
      await page.reload()
    }
    for (const layout of ['classic', 'tiles', 'simple', 'bold']) {
      await page.goto('/more/appearance')
      await page.getByTestId(`look-layout-${layout}`).click()
      await expect(page.getByTestId(`look-layout-${layout}`)).toHaveAttribute('aria-pressed', 'true')
      await expect(page.getByTestId('side-panel')).toHaveAttribute('data-layout', layout)
      await page.getByTestId('side-home').click()
      await expect(page.getByTestId('glance')).toHaveAttribute('data-layout', layout)
      // the whole side panel fits the screen: its last link ends above the bottom, nothing scrolls
      const panel = page.getByTestId('side-panel')
      const last = panel.getByRole('link').last()
      const box = await last.boundingBox()
      expect(box && box.y + box.height).toBeLessThanOrEqual(720)
      expect(await panel.evaluate((el) => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/laptop-${lang}-${layout}.png` })
    }
  }
  await page.evaluate(() => localStorage.setItem('locale', 'en'))
  await page.goto('/more/appearance')

  // main colour, corners, text size and dark: applied to the page at once
  await page.getByTestId('look-accent-blue').click()
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--emerald'))).toBe('37 99 235')
  await page.getByTestId('look-corners-square').click()
  await page.getByTestId('look-text-large').click()
  await page.getByTestId('look-theme-dark').click()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  // kept after a reload
  await page.reload()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('dark')
  expect(await page.evaluate(() => document.documentElement.style.fontSize)).toBe('109%')
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/appearance-dark.png`, fullPage: true })

  // back to default
  await page.getByTestId('look-reset').click()
  expect(await page.evaluate(() => document.documentElement.dataset.theme)).toBe('light')
  expect(await page.evaluate(() => document.documentElement.dataset.layout)).toBe('classic')
  await expect(page.getByTestId('look-reset')).toBeDisabled()

  // also in the profile menu
  await page.getByTestId('profile-button').click()
  await page.getByTestId('profile-appearance').click()
  await expect(page).toHaveURL(/\/more\/appearance$/)
})

test('appearance: the dashboard designs on a phone', async ({ page, request }) => {
  await page.setViewportSize({ width: 375, height: 740 })
  await signupAndLogin(page, request)
  for (const layout of ['classic', 'tiles', 'simple', 'bold']) {
    await page.goto('/more/appearance')
    await page.getByTestId(`look-layout-${layout}`).click()
    await page.goto('/')
    await expect(page.getByTestId('glance')).toHaveAttribute('data-layout', layout)
    await expect(page.getByTestId('fast-actions')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/phone-${layout}.png`, fullPage: true })
  }
})
