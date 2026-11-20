/** Owner 2026-11-20 (ADR-120): the FBR guide — what the shop brings, what it does, what we do, each
 *  step marked with who does it — open to anyone, in three languages, and one tap away from the FBR
 *  card in Shop settings. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('FBR guide: open to anyone, who does what, three languages, from the FBR card', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })

  await page.goto('/fbr-guide')
  const guide = page.getByTestId('fbr-guide')
  await expect(guide.getByRole('heading', { level: 1, name: 'FBR guide' })).toBeVisible()
  for (const t of ['The short answer', 'What happens to a bill', 'What we need from you', 'How you get the token', 'What we do, step by step', 'What you will see afterwards', 'If something goes wrong', 'What it does not do yet', 'Common questions']) await expect(guide).toContainText(t)
  // what the shop brings, with examples, and what is never asked for
  const need = guide.getByTestId('fg-s3')
  for (const t of ['Your NTN', 'Example: 1234567-8', 'Your STRN', '13 digits', "Your tax adviser's word", 'A token from IRIS']) await expect(need).toContainText(t)
  await expect(guide.getByTestId('fg-never')).toContainText('Your IRIS password. Do not give it to anyone')
  // every step says who does it; the buttons are named as the app shows them
  const steps = guide.getByTestId('fg-s5')
  await expect(steps.locator('li')).toHaveCount(8)
  await expect(steps.locator('li[data-who="you"]')).toHaveCount(3)
  await expect(steps.locator('li[data-who="we"]')).toHaveCount(2)
  await expect(steps.locator('li[data-who="both"]')).toHaveCount(3)
  await expect(steps).toContainText('"Test with FBR (sandbox)"')
  await expect(steps).toContainText('"Send bills to FBR"')
  // honest about what is not there, and not tax advice
  await expect(guide.getByTestId('fg-s8')).toContainText('It has not been run with a real FBR account so far.')
  await expect(guide.getByTestId('fg-s8')).toContainText('Sale returns are not sent to FBR as credit notes yet.')
  await expect(guide).toContainText('It is not tax advice.')
  await expect(guide.getByTestId('fg-to-settings')).toHaveCount(0) // not signed in
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  await page.screenshot({ path: 'test-results/fbr-guide.png', fullPage: true })
  // Urdu and Roman Urdu: their own words, and the app's own button names in that language
  await guide.getByRole('button', { name: 'اردو' }).click()
  await expect(guide.getByRole('heading', { level: 1, name: 'FBR گائیڈ' })).toBeVisible()
  await expect(guide.getByTestId('fg-s5')).toContainText('"بل FBR کو بھیجیں"')
  await guide.getByRole('button', { name: 'Roman' }).click()
  await expect(guide.getByTestId('fg-s3')).toContainText('Humein aap se kya chahiye')
  await expect(guide.getByTestId('fg-s5')).toContainText('"Bill FBR ko bhejein"')
  await guide.getByRole('button', { name: 'English' }).click()

  // from the FBR card in Shop settings, and back
  const ph = phone()
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'Tax Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })
  await page.goto('/more/settings')
  await page.getByTestId('fbr-guide-open').click()
  await expect(page).toHaveURL(/\/fbr-guide$/)
  await page.getByTestId('fg-to-settings').click()
  await expect(page).toHaveURL(/\/more\/settings$/)
  await expect(page.getByTestId('fbr-token')).toBeVisible()
})
