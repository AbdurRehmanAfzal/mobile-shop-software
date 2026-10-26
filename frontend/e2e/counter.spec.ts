/** "Dukaan counter" screens: stock worth by brand/model, any day's hisaab, khata filters, Urdu home
 *  and the laptop side menu with F-keys. Screenshots go to test-results/ for a visual check. */

import { expect, test, type Page } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function signup(page: Page, locale: 'en' | 'ur' = 'en') {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Counter Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  if (locale === 'ur') {
    await page.evaluate(() => localStorage.setItem('locale', 'ur'))
    await page.reload()
  }
}

async function oldStock(page: Page, imei: string, cost: string) {
  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill(imei)
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill(cost)
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()
}

test('stock worth, day hisaab and khata', async ({ page }) => {
  await signup(page)
  await oldStock(page, '490154203237518', '800')
  await oldStock(page, '356938035643809', '1200')

  await page.getByRole('link', { name: 'Stock' }).first().click()
  await expect(page).toHaveURL(/\/stock\/summary$/)
  await expect(page.getByText('Rs. 2,000')).toBeVisible()
  await page.getByRole('button', { name: /Nokia/ }).click()
  await expect(page.getByRole('link', { name: /105/ })).toBeVisible()
  await page.screenshot({ path: 'test-results/counter-stock.png', fullPage: true })

  await page.goto('/hisaab')
  await expect(page.getByText('Nothing sold on this day')).toBeVisible()
  await page.getByRole('button', { name: 'Yesterday' }).click()
  await expect(page).toHaveURL(/date=/)
  await page.screenshot({ path: 'test-results/counter-hisaab.png', fullPage: true })

  await page.goto('/khata')
  await page.getByRole('button', { name: /I will get/ }).click()
  await expect(page).toHaveURL(/f=get/)
  await expect(page.getByText('Nobody here')).toBeVisible()
  await page.screenshot({ path: 'test-results/counter-khata.png', fullPage: true })
})

test('urdu home shows only urdu', async ({ page }) => {
  await signup(page, 'ur')
  const main = page.locator('main')
  await expect(main.getByText('بیچیں')).toBeVisible()
  await expect(main.getByText('اسٹاک ڈالیں')).toBeVisible()
  await expect(main.getByText('Add stock')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/counter-home-ur.png', fullPage: true })
})

test.describe('laptop', () => {
  test.use({ viewport: { width: 1366, height: 820 }, isMobile: false, hasTouch: false })
  test('side menu and F-keys', async ({ page }) => {
    await signup(page)
    await expect(page.locator('aside').getByText('F2')).toBeVisible()
    await page.keyboard.press('F4')
    await expect(page).toHaveURL(/\/khata$/)
    await page.keyboard.press('F6')
    await expect(page).toHaveURL(/\/stock\/summary$/)
    await page.goto('/')
    await page.screenshot({ path: 'test-results/counter-laptop.png' })
  })
})

test('more menu and a person page use the job colours', async ({ page }) => {
  await signup(page)
  await page.goto('/more')
  await expect(page.getByText('Money received / paid')).toBeVisible()
  await page.screenshot({ path: 'test-results/counter-more.png', fullPage: true })
  await page.goto('/khata')
  await page.getByRole('button', { name: 'New person' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Imran Ali')
  await page.getByLabel('Mobile number').fill('03017778888')
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page).toHaveURL(/\/parties\//)
  await expect(page.getByText('03017778888')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Money received' })).toBeVisible()
  await page.screenshot({ path: 'test-results/counter-person.png', fullPage: true })
})

test('profit, best sellers, estimate; skip the ID check while adding stock', async ({ page }) => {
  await signup(page)
  // a customer's phone bought with "Skip, I know this person" chosen on the same screen
  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /Buy a customer's phone/ }).click()
  await page.getByRole('button', { name: 'New person' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Seller Known')
  await page.getByLabel('Mobile number').fill('03015556666')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill('490154203237518')
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('800')
  await page.getByLabel('Asking price').fill('1000')
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await page.getByRole('button', { name: 'Skip, I know this person' }).click()
  await page.getByRole('button', { name: 'Put in stock' }).click()
  await expect(page.getByText('Skipped, known person')).toBeVisible()

  // sell it, then read the reports
  await page.goto('/sale/new')
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  await page.goto('/')
  await page.getByRole('link', { name: 'Profit & reports' }).click()
  await expect(page.getByText('Real profit (after expenses)').first()).toBeVisible()
  await expect(page.getByText('Buying price of what was sold')).toBeVisible()
  await page.screenshot({ path: 'test-results/report-profit.png', fullPage: true })
  await page.getByRole('button', { name: 'Best sellers' }).click()
  await expect(page.getByText(/Nokia 105/).first()).toBeVisible()
  await page.getByRole('button', { name: 'Estimate' }).click()
  await expect(page.getByText('Next 7 days (estimate)')).toBeVisible()
  await expect(page.getByText('Buy more')).toBeVisible()
  await page.screenshot({ path: 'test-results/report-estimate.png', fullPage: true })

  await page.goto('/hisaab')
  await expect(page.getByText(/Customer · Owner/)).toBeVisible()
})

test('a phone with a pending ID check can be skipped and sold', async ({ page }) => {
  await signup(page)
  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /Buy a customer's phone/ }).click()
  await page.getByRole('button', { name: 'New person' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Seller Pending')
  await page.getByLabel('Mobile number').fill('03016667777')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill('356938035643809')
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('800')
  await page.getByLabel('Asking price').fill('1000')
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await page.getByRole('button', { name: 'Put in stock' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()

  await page.goto('/sale/new')
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await expect(page.getByText("This phone's ID card check is pending")).toBeVisible()
  await expect(page.getByRole('button', { name: 'Complete sale' })).toBeDisabled()
  await page.getByRole('button', { name: 'Skip and sell (I know this person)' }).click()
  await page.screenshot({ path: 'test-results/sale-skip.png', fullPage: true })
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()
})
