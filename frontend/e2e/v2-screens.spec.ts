/** Owner (2026-10-29): the last three screens brought onto the v2 look — settings, amanat (loans) and
 *  exchange — each walked once; screenshots for the visual check. */

import { expect, test, type Page } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function signup(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
    window.open = () => null
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('V2 Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

async function apiOf(page: Page) {
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const post = async (path: string, data: unknown) => {
    const r = await page.request.post(`http://localhost:8000/api/v1${path}`, { headers, data })
    expect(r.ok(), `${path}: ${await r.text()}`).toBeTruthy()
    return r.json()
  }
  const get = async (path: string) => (await page.request.get(`http://localhost:8000/api/v1${path}`, { headers })).json()
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${brand.id}&q=105`))[0]
  const device = (imei: string, cost: number, asking: number) => post('/devices/opening-stock', { imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: cost, asking_price: asking })
  return { post, get, device }
}

test('settings: cards, unsaved hint, footer preview, saved', async ({ page }) => {
  await signup(page)
  await page.goto('/more/settings')
  const save = page.locator('.fixed').getByRole('button', { name: 'Save' })
  await expect(save).toHaveCount(0)
  await page.getByLabel('City').fill('Lahore')
  await expect(page.getByText('Not saved yet')).toBeVisible()
  await page.getByLabel('Receipt footer', { exact: true }).fill('Shukriya, phir aaiye')
  await expect(page.getByText('On the receipt')).toBeVisible()
  await expect(page.getByText('Shukriya, phir aaiye').last()).toBeVisible()
  await page.getByRole('switch', { name: /Charge sales tax/ }).click()
  await expect(page.getByLabel('Tax rate %')).toBeVisible()
  await page.getByRole('switch', { name: /Charge sales tax/ }).click()
  await page.screenshot({ path: 'test-results/v2-settings.png', fullPage: true })
  await save.click()
  await expect(page.getByText('Saved').first()).toBeVisible()
  await expect(save).toHaveCount(0)
  await page.reload()
  await expect(page.getByLabel('City')).toHaveValue('Lahore')
})

test('amanat: give a phone to another shop from the loans page, they keep it, the rest on their khata', async ({ page }) => {
  await signup(page)
  const api = await apiOf(page)
  await api.post('/parties', { name: 'Bilal Mobiles', phone: '03001112233', kinds: ['shop'] })
  await api.device('490154203237518', 800, 1000)

  await page.goto('/loans')
  await expect(page.getByText('phones at other shops right now')).toBeVisible()
  await expect(page.getByText('No loans')).toBeVisible()
  await page.getByRole('button', { name: 'Give a phone on amanat' }).click()
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Bilal')
  await page.getByRole('button', { name: /Bilal Mobiles/ }).first().click()
  await expect(page.getByRole('button', { name: '7 days' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: '15 days' }).click()
  await page.getByRole('button', { name: 'Give on loan' }).click()
  await expect(page.getByText(/Given on amanat/)).toBeVisible()
  const card = page.locator('article').first()
  await expect(card).toContainText('Nokia 105')
  await expect(card).toContainText('Bilal Mobiles')
  await expect(card).toContainText('back by')
  await expect(card).toContainText('0 days out')
  await page.screenshot({ path: 'test-results/v2-loans.png', fullPage: true })

  // they kept it: 1,200 agreed, 200 paid, 1,000 on their khata
  await card.getByRole('button', { name: 'They kept it (sell)' }).click()
  await page.getByLabel('Agreed price').fill('1200')
  await page.getByLabel('Paid now').fill('200')
  await expect(page.getByText('1,000')).toBeVisible()
  await page.getByRole('button', { name: 'Confirm' }).click()
  await expect(page.getByText(/Sold to that shop/)).toBeVisible()
  await expect(page.getByText('No loans')).toBeVisible()
  await page.getByRole('button', { name: 'Sold to them' }).first().click()
  await expect(page.locator('article').first()).toContainText('Nokia 105')
  const parties = await api.get('/parties?q=Bilal')
  expect(parties[0].balance).toBe('1000.00')
})

test('exchange: old phone in, new phone out, the difference in words, done screen', async ({ page }) => {
  await signup(page)
  const api = await apiOf(page)
  await api.post('/parties', { name: 'Ahmed Khan', phone: '03219876543', kinds: ['customer'] })
  await api.device('490154203237518', 4000, 5000)

  await page.goto('/exchange/new')
  await expect(page.getByText(/Take the customer's old phone/)).toBeVisible()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Ahmed')
  await page.getByRole('button', { name: /Ahmed Khan/ }).first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add the old phone' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill('356938035643809')
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel(/Cost price|Trade-in value/).fill('1500')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('1,500').first()).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Pick the new phone from stock' }).click()
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await expect(page.getByLabel('Sale price')).toHaveValue('5000')
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Customer pays the difference')).toBeVisible()
  await expect(page.getByText('Rs. 3,500')).toBeVisible()
  await page.getByLabel('Paid now').fill('500')
  await expect(page.getByText('3,000').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/v2-exchange.png', fullPage: true })
  await page.getByRole('button', { name: 'Complete exchange' }).click()
  await expect(page.getByText('Exchange complete')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Another exchange' })).toBeVisible()
  const parties = await api.get('/parties?q=Ahmed')
  expect(parties[0].balance).toBe('3000.00')
  // the old phone is in stock, the new one sold
  const stock = await api.get('/devices?status=in_stock')
  expect(stock.some((d: { imei1: string }) => d.imei1 === '356938035643809')).toBeTruthy()
})
