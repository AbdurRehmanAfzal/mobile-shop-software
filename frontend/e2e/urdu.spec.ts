/** Urdu mode across the main screens: screenshots for a visual check, and no English words leaking
 *  into the Urdu UI (owner: "urdu ko theek karo, urdu ke format ko bhi"). */

import { expect, test, type Page } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

/** Latin words allowed in Urdu mode: shop words people use as they are, and data. */
const ALLOWED = /^(IMEI|PTA|JV|SIM|CNIC|Rs\.?|PDF|Excel|CSV|Easypaisa|JazzCash|eGadget|WhatsApp|Wi-Fi|Nokia|Samsung|Apple|Infinix|Tecno|Vivo|Oppo|Redmi|Xiaomi|Realme|Itel|Huawei|Honor|OnePlus|Google|Motorola|QMobile|Lenovo|Sony|LG|GB|TB|MB|PIN|Save|as|URDU|Roman|English|Urdu|Light|Dark|INV|PUR|RET|REP|EXP|PAY|v\d.*|[A-Z]{5,10}|[A-Z]{2,4}-\d*)$/

async function signupUrdu(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
    window.open = () => null
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Urdu Shop')
  await page.getByLabel('Your name').fill('Ahmad')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.evaluate(() => localStorage.setItem('locale', 'ur'))
}

async function englishWords(page: Page): Promise<string[]> {
  const text = await page.locator('main').innerText()
  // shop and person names are data, not UI words
  return [...new Set(text.replace('Urdu Shop', '').replace('Ahmad', '').match(/[A-Za-z][A-Za-z.'-]+/g) ?? [])].filter((w) => !ALLOWED.test(w))
}

const SCREENS: [string, string][] = [
  ['home', '/'],
  ['sale', '/sale/new'],
  ['purchase', '/purchase/new'],
  ['khata', '/khata'],
  ['hisaab', '/hisaab'],
  ['stock-summary', '/stock/summary'],
  ['stock', '/stock'],
  ['repairs', '/repairs'],
  ['repair-new', '/repairs/new'],
  ['return', '/return/new'],
  ['reports', '/reports'],
  ['expenses', '/expenses'],
  ['more', '/more'],
  ['exchange', '/exchange/new'],
  ['loans', '/loans'],
  ['settings', '/more/settings'],
]

test('Urdu screens: no English leaking, screenshots', async ({ page }) => {
  test.setTimeout(180_000)
  await signupUrdu(page)
  const leaks: Record<string, string[]> = {}
  for (const [name, path] of SCREENS) {
    await page.goto(path)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: `test-results/urdu-${name}.png`, fullPage: true })
    const words = await englishWords(page)
    if (words.length) leaks[name] = words
  }
  expect(leaks).toEqual({})
})
