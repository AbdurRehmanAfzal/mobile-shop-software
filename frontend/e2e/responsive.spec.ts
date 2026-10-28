/** Owner (2026-10-28): check the app on Android and iPhone sizes. Each main screen, in English and
 *  Urdu, must fit the phone's width (nothing sticking out sideways). iPhones run on WebKit, Safari's
 *  engine. Screenshots of Home land in test-results/ for a look. */

import { expect, request as apiRequest, test, devices, type Page } from '@playwright/test'

const API = 'http://localhost:8000/api/v1'
const LOGIN = { phone: `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`, password: 'e2e-secret-1' }

const PHONES = [
  { name: 'iphone-se', device: devices['iPhone SE'] },
  { name: 'iphone-15', device: devices['iPhone 15'] },
  { name: 'iphone-15-pro-max', device: devices['iPhone 15 Pro Max'] },
  { name: 'android-small', device: devices['Galaxy S9+'] },
  { name: 'pixel-7', device: devices['Pixel 7'] },
]
test.setTimeout(120_000) // WebKit on a busy PC is slow
const PAGES = ['/', '/sale/new', '/purchase/new', '/stock/summary', '/khata', '/hisaab', '/more', '/invoices', '/reports']

test.beforeAll(async () => {
  // a shop with big amounts on Home: 3 phones in stock, one sold for Rs. 289,999
  const api = await apiRequest.newContext()
  const signup = await api.post(`${API}/auth/signup`, { data: { shop_name: 'Al-Madina Mobile Zone & Repair Centre', owner_name: 'Owner', ...LOGIN } })
  expect(signup.ok()).toBeTruthy()
  const { tokens, me } = await signup.json()
  const headers = { Authorization: `Bearer ${tokens.access_token}`, 'X-Shop-Id': me.active_shop_id ?? me.shops[0].id }
  const get = async (p: string) => (await api.get(`${API}${p}`, { headers })).json()
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Samsung')
  const model = (await get(`/catalogue/models?brand_id=${brand.id}&q=S24`))[0]
  const [storage] = await get('/catalogue/storages')
  const [colour] = await get('/catalogue/colours')
  const ids: string[] = []
  for (const imei of ['490154203237518', '356938035643809', '353918050000002']) {
    const r = await api.post(`${API}/devices/opening-stock`, {
      headers,
      data: { imei1: imei, brand_id: brand.id, model_id: model.id, storage_id: storage.id, colour_id: colour.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 250000, asking_price: 289999 },
    })
    expect(r.ok(), await r.text()).toBeTruthy()
    ids.push((await r.json()).id)
  }
  const sale = await api.post(`${API}/sales`, { headers, data: { devices: [{ device_id: ids[0], price: 289999 }], paid: 289999 } })
  expect(sale.ok(), await sale.text()).toBeTruthy()
  await api.dispose()
})

async function login(page: Page, locale: 'en' | 'ur') {
  await page.addInitScript((l) => localStorage.setItem('locale', l), locale)
  await page.goto('/login')
  await page.locator('input[type="tel"], input[inputmode="tel"]').first().fill(LOGIN.phone)
  await page.locator('input[type="password"]').fill(LOGIN.password)
  await page.locator('button[type="submit"]').click()
  await expect(page).toHaveURL(/\/$/)
}

/** how far the page sticks out past the screen's right edge (0 = fits) */
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)

for (const { name, device } of PHONES) {
  for (const locale of ['en', 'ur'] as const) {
    test(`${name}: every main screen fits (${locale})`, async ({ playwright, baseURL }) => {
      const { defaultBrowserType, ...size } = device
      const browser = await playwright[defaultBrowserType].launch()
      const page = await (await browser.newContext({ ...size, baseURL })).newPage()
      try {
        await login(page, locale)
        await page.waitForLoadState('networkidle')
        await page.screenshot({ path: `test-results/home-${name}-${locale}.png`, fullPage: true })
        await page.getByRole('img', { name: /7/ }).scrollIntoViewIfNeeded()
        await page.screenshot({ path: `test-results/hero-${name}-${locale}.png` })
        const wide: string[] = []
        for (const path of PAGES) {
          await page.goto(path)
          await page.waitForLoadState('networkidle')
          const px = await overflow(page)
          if (px > 1) wide.push(`${path} +${px}px`)
        }
        expect(wide, 'screens wider than the phone').toEqual([])
      } finally {
        await browser.close()
      }
    })
  }
}
