/** Owner 2026-11-20 (ADR-115):
 *  1. the software provider's own address, /control — only the screens that run the software, no
 *     shop counter around them; the login brings a provider back to it; the old /admin goes there;
 *     a shop's login is told it is not for him.
 *  2. the landing page says what came since: accessories-only and laptop shops, every report in one
 *     list, old dealings, several pieces — and each kind of shop has its own address with its own
 *     heading, title and canonical address.
 *  Needs 03990000099 in SUPERUSER_PHONES. */

import { expect, test } from '@playwright/test'

const SUPER = { phone: '03990000099', password: 'super-secret-1' }
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
test.setTimeout(120_000)
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
})

test('control room: its own address and frame, back to it after login, not for a shop', async ({ page, request }) => {
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'OOP Admin', owner_name: 'Product Owner', phone: SUPER.phone, password: SUPER.password } })
  const owner = phone()
  await request.post('/api/v1/auth/signup', { data: { shop_name: 'Plain Shop', owner_name: 'Shop Owner', phone: owner, password: 'e2e-secret-1' } })

  // not logged in: to the login, and back to the control room after it
  await page.goto('/control/business')
  await expect(page).toHaveURL(/\/login$/)
  await page.getByLabel('Mobile number').fill(SUPER.phone)
  await page.getByLabel('Password').fill(SUPER.password)
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page).toHaveURL(/\/control\/business$/)
  const shell = page.getByTestId('control-shell')
  await expect(shell).toContainText('Mobile Shop · Control')
  // only the provider's screens: no counter search, no shop menu
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Stock', exact: true })).toHaveCount(0)
  await page.getByTestId('control-tab-shops').click()
  await expect(page).toHaveURL(/\/control$/)
  await expect(page.getByText('Only you (the product owner) see this page')).toBeVisible()
  await page.screenshot({ path: 'test-results/control.png' })
  // fits the narrowest phone
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 1280, height: 800 })
  // the old address still works
  await page.goto('/admin/business')
  await expect(page).toHaveURL(/\/control\/business$/)
  await page.goto('/admin')
  await expect(page).toHaveURL(/\/control$/)
  // into the shop app and out
  await page.getByTestId('control-to-app').click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/control')
  await page.getByTestId('control-logout').click()
  await expect(page).toHaveURL(/\/(login|welcome)$/)

  // a shop's own login: told so, nothing of the provider's shown
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(owner)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  await page.goto('/control')
  await expect(page.getByTestId('control-denied')).toContainText('Only for the software provider')
  await expect(page.getByTestId('control-tab-shops')).toHaveCount(0)
  await expect(page.getByText('Only you (the product owner) see this page')).toHaveCount(0)
})

test('landing page: what came since, and an address for each kind of shop', async ({ page }) => {
  await page.goto('/welcome')
  await expect(page).toHaveTitle('Mobile Shop Software Pakistan — Phones, Laptops, Accessories')
  const fresh = page.locator('#new')
  for (const t of ['Accessories-only shops', 'Laptops', 'Every report in one list', 'Old dealings, without IMEIs', 'Several pieces at once', 'Mobile numbers of any country']) await expect(fresh).toContainText(t)
  const faq = page.getByTestId('landing-faq')
  for (const q of ['I sell only accessories, no phones. Is it for me?', 'Can I keep laptops in it?', 'Which reports does it have?']) await expect(faq).toContainText(q)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://mobileshop.oopsolutions.com/welcome')

  // who it is for → that shop's own page
  await page.getByTestId('for-accessories').click()
  await expect(page).toHaveURL(/\/accessories-shop-software$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Software for mobile accessories shops' })).toBeVisible()
  await expect(page).toHaveTitle('Mobile Accessories Shop Software Pakistan — Stock, Sales, Khata')
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://mobileshop.oopsolutions.com/accessories-shop-software')
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', /accessories shops in Pakistan/)
  const topic = page.getByTestId('landing-topic')
  await expect(topic).toContainText('What does an accessories shop get?')
  await expect(topic).toContainText('sell by the piece')
  // the rest of the page is there too: prices and the request form
  await expect(page.getByTestId('plan-pro')).toBeVisible()
  await expect(page.getByLabel('Shop name', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/landing-accessories.png' })

  // straight to another one, in Urdu, on the narrowest phone
  await page.setViewportSize({ width: 320, height: 568 })
  await page.goto('/laptop-shop-software')
  await expect(page.getByRole('heading', { level: 1, name: 'Software for laptop shops' })).toBeVisible()
  await expect(page.getByTestId('landing-topic')).toContainText('1,143')
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.getByRole('button', { name: 'اردو' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'لیپ ٹاپ کی دکان کا سافٹ ویئر' })).toBeVisible()
  await page.getByRole('button', { name: 'English' }).click()
  // back to the whole page: its own title and address again
  await page.getByTestId('topic-all').click()
  await expect(page).toHaveURL(/\/welcome$/)
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://mobileshop.oopsolutions.com/welcome')
  await expect(page.getByRole('heading', { level: 1, name: 'Run your mobile shop from your phone' })).toBeVisible()
})
