/** Owner's return case: a walk-in bought a phone for cash, brings it back; the shop cuts some money and
 *  hands back the rest. The phone is back in stock and the day's hisaab shows the return. */

import { expect, test, type Page } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function token(page: Page): Promise<string> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state.accessToken as string)
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
})

test('walk-in return: hand back 900, shop cuts 100', async ({ page, request }) => {
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Return Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  const auth = { Authorization: `Bearer ${await token(page)}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: auth })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}&q=105`, { headers: auth })).json()
  const dev = await request.post('/api/v1/devices/opening-stock', {
    headers: auth,
    data: { imei1: '490154203237518', brand_id: nokia.id, model_id: models[0].id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 800, asking_price: 1000 },
  })
  expect(dev.status()).toBe(201)
  const person = await request.post('/api/v1/parties', { headers: auth, data: { name: 'Bilal Walkin', phone: '03218889999', kinds: ['customer'] } })
  expect(person.status()).toBe(201)

  // cash sale to a walk-in
  await page.goto('/sale/new')
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  // return from the home tile
  await page.goto('/')
  await page.locator('main').getByRole('link', { name: 'Return' }).click()
  await page.getByPlaceholder("Find the sold phone by IMEI, buyer's name or phone").fill('7518')
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await expect(page.getByText('Customer had paid')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Take it back' })).toBeDisabled()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Bilal')
  await page.getByRole('button', { name: /Bilal Walkin/ }).first().click()
  // owner's bug: clearing the box with backspace brought the full amount back
  const give = page.getByLabel('Give back to customer (Rs)')
  await expect(give).toHaveValue('1000')
  await give.click()
  for (let i = 0; i < 4; i++) await give.press('End').then(() => give.press('Backspace'))
  await expect(give).toHaveValue('')
  await give.pressSequentially('900')
  await expect(give).toHaveValue('900')
  await expect(page.locator('.bg-ret').getByText('100', { exact: true })).toBeVisible()
  await page.screenshot({ path: 'test-results/return-step2.png', fullPage: true })
  await page.getByRole('button', { name: 'Take it back' }).click()
  await expect(page.getByText('Return done')).toBeVisible()
  await expect(page.getByText('The phone is back in stock')).toBeVisible()

  const d = await (await request.get(`/api/v1/devices/${(await dev.json()).id}`, { headers: auth })).json()
  expect(d.status).toBe('in_stock')

  await page.goto('/hisaab')
  await expect(page.getByText('Given back on returns')).toBeVisible()
  await expect(page.getByText('Cut on returns')).toBeVisible()
  // the returned phone stays in the list, crossed out, and is not counted as sold
  await expect(page.getByText('Returned').first()).toBeVisible()
  await expect(page.locator('.line-through').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/return-hisaab.png', fullPage: true })
})
