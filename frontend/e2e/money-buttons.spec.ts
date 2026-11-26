/** Owner 2026-11-19 (ADR-112): the four money buttons on a person's page each say underneath what
 *  they are for, in the shopkeeper's words — Roman Urdu under the English name, Urdu in Urdu mode —
 *  and the form that opens repeats the line. */

import { expect, test } from '@playwright/test'

test.setTimeout(120_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('money buttons on a person page explain themselves', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Clear Words Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const person = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Bilal Customer', phone: '03016662001', kinds: ['customer'] } })).json()).id

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByTestId('home-overview')).toBeVisible({ timeout: 20_000 })

  await page.goto(`/parties/${person}?tab=lenden`)
  const got = page.getByTestId('party-got')
  const gave = page.getByTestId('party-gave')
  await expect(got).toContainText('Money received')
  await expect(got).toContainText('Bill ka udhaar wapas mila')
  await expect(gave).toContainText('Money paid')
  await expect(gave).toContainText('Bill ka udhaar wapas kiya')
  const lend = page.getByTestId('party-lending')
  await expect(lend.getByTestId('lending-give')).toContainText('Gave money, no bill')
  await expect(lend.getByTestId('lending-give')).toContainText('Is ko baghair bill ke paise diye')
  await expect(lend.getByTestId('lending-take')).toContainText('Took money, no bill')
  await expect(lend.getByTestId('lending-take')).toContainText('apna diya hua udhaar wapas mila')
  await expect(lend).toContainText('Yahan woh raqam likhein jo aap ne is bande ko baghair bill ke di')
  await expect(page.getByTestId('old-balance')).toContainText('Software se pehle ka purana len den yahan likhein')
  await page.screenshot({ path: 'test-results/money-buttons.png', fullPage: true })
  // ADR-113: they read as buttons — filled, with an icon and an arrow — and fit every width
  for (const [name, w, h] of [['se', 320, 568], ['phone', 412, 900], ['laptop', 1280, 800]] as const) {
    await page.setViewportSize({ width: w, height: h })
    await expect(got).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), `${name} fits`).toBeLessThanOrEqual(1)
    const a = await got.boundingBox()
    const b = await gave.boundingBox()
    // one per row on a phone, side by side on a laptop
    if (w < 1024) expect(b!.y).toBeGreaterThan(a!.y + a!.height - 1)
    else expect(Math.abs(b!.y - a!.y)).toBeLessThan(2)
    await got.scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/money-buttons-${name}.png` })
    await lend.getByTestId('lending-give').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `test-results/money-lending-${name}.png` })
  }
  await page.setViewportSize({ width: 412, height: 900 })
  // each is one real button: the name, the line and the arrow are all inside it
  await expect(got.locator('svg')).toHaveCount(2)
  await expect(page.getByRole('button', { name: /Money received/ })).toHaveCount(1)

  // the form that opens says the same thing; the entry is saved as before
  await got.click()
  const sheet = page.getByTestId('sheet-backdrop')
  await expect(sheet).toContainText('Bill ka udhaar wapas mila')
  await page.keyboard.press('Escape')
  await lend.getByTestId('lending-give').click()
  await expect(sheet).toContainText('Is ko baghair bill ke paise diye')
  await sheet.getByLabel(/Amount/).first().fill('5000')
  await sheet.getByRole('button', { name: /Save|Confirm/ }).last().click()
  await expect.poll(async () => Number((await (await request.get(`/api/v1/parties/${person}`, { headers: h })).json()).balance)).toBe(5000)

  // Urdu mode: the same lines in Urdu, no Roman
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
  await page.goto(`/parties/${person}?tab=lenden`)
  await expect(page.getByTestId('party-got')).toContainText('بل کا ادھار واپس ملا')
  await expect(page.getByTestId('party-lending').getByTestId('lending-take')).toContainText('بغیر بل پیسے لیے')
  await expect(page.getByTestId('party-lending')).not.toContainText('Yahan woh raqam')
  await page.screenshot({ path: 'test-results/money-buttons-ur.png', fullPage: true })
})
