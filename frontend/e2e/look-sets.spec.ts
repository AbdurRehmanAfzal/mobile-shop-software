/** Owner 2026-11-21 (ADR-129): four more colour sets in Appearance — Material, Mac, Lime, Fintech.
 *  Each is picked from the page, changes the app's colours at once, is kept on the device, has its
 *  dark colours, and keeps the main button's label readable. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)
const SETS = ['material', 'mac', 'lime', 'fintech'] as const

/** WCAG contrast of two "rgb(r, g, b)" colours */
const contrast = (a: string, b: string) => {
  const lum = (c: string) => {
    const [r, g, bl] = (c.match(/[\d.]+/g) ?? []).slice(0, 3).map((v) => { const x = Number(v) / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4 })
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl
  }
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

test('Material, Mac, Lime and Fintech colour sets, light and dark', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'Look Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })

  const seen = new Set<string>()
  for (const set of SETS) {
    await page.goto('/more/appearance')
    await page.getByTestId('look-theme-light').click()
    await page.getByTestId(`look-palette-${set}`).click()
    await expect(page.locator('html')).toHaveAttribute('data-palette', set)
    await expect(page.getByTestId(`look-palette-${set}`)).toHaveAttribute('aria-pressed', 'true')
    for (const theme of ['light', 'dark'] as const) {
      await page.getByTestId(`look-theme-${theme}`).click()
      const c = await page.evaluate(() => {
        const cs = getComputedStyle(document.documentElement)
        return ['--ground', '--surface', '--ink', '--muted', '--emerald', '--emerald-deep', '--emerald-tint', '--hero', '--hero-text'].map((k) => `rgb(${cs.getPropertyValue(k).trim().split(/\s+/).join(', ')})`)
      })
      const [ground, surface, ink, muted, accent, deep, tint, hero, heroText] = c
      // each set and each mode has colours of its own
      expect(seen.has(c.join('|')), `${set} ${theme}`).toBe(false)
      seen.add(c.join('|'))
      // text can be read: body text, the quiet text, the main button's white label, words on the tint, the hero
      expect(contrast(ink, surface), `${set} ${theme} ink`).toBeGreaterThan(7)
      expect(contrast(ink, ground), `${set} ${theme} ink on ground`).toBeGreaterThan(7)
      expect(contrast(muted, surface), `${set} ${theme} muted`).toBeGreaterThan(4.5)
      expect(contrast('rgb(255, 255, 255)', accent), `${set} ${theme} button label`).toBeGreaterThan(3)
      expect(contrast(deep, tint), `${set} ${theme} tint text`).toBeGreaterThan(4.5)
      expect(contrast(heroText, hero), `${set} ${theme} hero`).toBeGreaterThan(7)
      await page.goto('/')
      await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
      await page.screenshot({ path: `test-results/look-${set}-${theme}.png` })
      if (theme === 'light') {
        await page.goto('/sale/new')
        await page.screenshot({ path: `test-results/look-${set}-sale.png` })
      }
      await page.goto('/more/appearance')
    }
    // kept on this device
    await page.reload()
    await expect(page.locator('html')).toHaveAttribute('data-palette', set)
  }
  await page.getByTestId('look-theme-light').click()
  await page.screenshot({ path: 'test-results/look-sets-page.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  // "Reset" goes back to Modern
  await page.getByTestId('look-reset').click()
  await expect(page.locator('html')).toHaveAttribute('data-palette', 'modern')
})
