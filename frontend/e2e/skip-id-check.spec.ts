/** Shopkeepers 2026-11-21 (ADR-128): the ID card check never stops the counter without a way on.
 *  1. an exchange whose new phone has its check pending: "Skip and exchange" right there, and the
 *     old phone's check can be skipped in the same step;
 *  2. the dashboard's "ID card check pending" opens the list: skip one, then skip all the rest;
 *  3. the check's own page and the phone's page have the skip too. */

import { expect, test, type APIRequestContext } from '@playwright/test'

test.setTimeout(240_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
const OLD = '352099001761481'
const IMEIS = ['490154203237518', '356938035643809', '353456789012348', '356789104552375', '358240051111110']

async function setup(request: APIRequestContext) {
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Skip Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const nokia = brands.find((b: { name: string }) => b.name === 'Nokia')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${nokia.id}`, { headers: h })).json()
  const ids: string[] = []
  for (const imei of IMEIS) {
    const r = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: imei, brand_id: nokia.id, model_id: models[0].id, condition: 'used', pta_status: 'pta_approved', cost_price: 40000, asking_price: 55000 } })
    expect(r.ok(), await r.text()).toBeTruthy()
    ids.push((await r.json()).id)
  }
  await request.post('/api/v1/parties', { headers: h, data: { name: 'Ali Khan', phone: '03211111111', kinds: ['customer'] } })
  return { ph, h, ids }
}

test('skip the ID check in an exchange, from the dashboard list (one and all), and on the phone', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const { ph, h, ids } = await setup(request)
  const status = async (id: string) => (await (await request.get(`/api/v1/devices/${id}`, { headers: h })).json()) as { status: string; verification_status: string }
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })

  // 1. the exchange that used to stop at "cannot be sold until verification is complete"
  await page.goto('/exchange/new')
  await page.getByPlaceholder('Name, phone or CNIC').fill('Ali')
  await page.getByRole('button', { name: /Ali Khan/ }).first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add the old phone' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill(OLD)
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('20000')
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Pick the new phone from stock' }).click()
  await page.getByText(IMEIS[0]).first().click()
  await page.getByLabel('Sale price').fill('55000')
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByTestId('exchange-paid').fill('35000')
  const pending = page.getByTestId('exchange-pending')
  await expect(pending).toContainText("The new phone's ID card check is pending")
  await expect(pending.getByRole('button', { name: 'Check now' })).toBeVisible()
  const complete = page.getByRole('button', { name: 'Complete exchange' })
  await expect(complete).toBeDisabled() // a choice first: no refusal after the tap
  await page.getByTestId('exchange-skip').click()
  await expect(complete).toBeEnabled()
  // the old phone coming in: skip its check too
  await page.getByTestId('exchange-old-check').getByRole('button', { name: 'Skip, I know this person' }).click()
  await page.screenshot({ path: 'test-results/exchange-skip.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })
  await complete.click()
  await expect(page.getByTestId('exchange-result-balance')).toBeVisible({ timeout: 20_000 })
  expect((await status(ids[0])).status).toBe('sold')
  await expect.poll(async () => (await (await request.get(`/api/v1/devices/imei/${OLD}`, { headers: h })).json()).device?.verification_status).toBe('clear')

  // 2. the dashboard: four phones left, opened as a list
  await page.goto('/')
  const att = page.getByRole('link', { name: /phones: ID card check pending/ })
  await expect(att).toContainText('4')
  await att.click()
  await expect(page).toHaveURL(/\/stock\/id-pending$/)
  const rows = page.getByTestId('idp-row')
  await expect(rows).toHaveCount(4)
  // one by one
  await rows.filter({ hasText: IMEIS[1] }).getByTestId('idp-skip').click()
  await expect(rows).toHaveCount(3)
  expect((await status(ids[1])).verification_status).toBe('clear')
  await page.screenshot({ path: 'test-results/id-pending.png', fullPage: true })
  await page.setViewportSize({ width: 320, height: 568 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.setViewportSize({ width: 412, height: 900 })

  // 3. the check's own page: skip in one tap, then it can be sold
  await rows.filter({ hasText: IMEIS[2] }).getByTestId('idp-check').click()
  await expect(page).toHaveURL(new RegExp(`/stock/${ids[2]}/verify$`))
  await page.getByTestId('verify-skip').click()
  await expect(page.getByRole('button', { name: 'Sell this phone now' })).toBeVisible()
  expect((await status(ids[2])).verification_status).toBe('clear')
  // the phone's own page
  await page.goto(`/stock/${ids[3]}`)
  await page.getByTestId('device-skip-id').first().click()
  await expect.poll(async () => (await status(ids[3])).verification_status).toBe('clear')

  // a flagged phone is listed but never skipped from the list
  await request.put(`/api/v1/devices/${ids[4]}/verification`, { headers: h, data: { egadget_result: 'flagged' } })
  const extra = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: '359876543210982', brand_id: (await (await request.get(`/api/v1/devices/${ids[4]}`, { headers: h })).json()).brand_id, model_id: (await (await request.get(`/api/v1/devices/${ids[4]}`, { headers: h })).json()).model_id, condition: 'used', pta_status: 'pta_approved', cost_price: 40000, asking_price: 55000 } })
  expect(extra.ok(), await extra.text()).toBeTruthy()
  const extra2 = await request.post('/api/v1/devices/opening-stock', { headers: h, data: { imei1: '351234567890124', brand_id: (await extra.json()).brand_id, model_id: (await extra.json()).model_id, condition: 'used', pta_status: 'pta_approved', cost_price: 40000, asking_price: 55000 } })
  expect(extra2.ok(), await extra2.text()).toBeTruthy()
  await page.goto('/stock/id-pending')
  await expect(rows).toHaveCount(3)
  await expect(rows.filter({ hasText: IMEIS[4] }).getByTestId('idp-skip')).toHaveCount(0)
  await expect(rows.filter({ hasText: IMEIS[4] })).toContainText('Only the owner can clear it')
  // all at once: asked first, then the two pending ones go and the flagged one stays
  await page.getByTestId('idp-skip-all').click()
  await expect(page.getByText('Skip the ID card check of 2 phones?')).toBeVisible()
  await page.getByTestId('idp-skip-all-yes').click()
  await expect(page.getByTestId('idp-done')).toContainText('skipped for 2 phones')
  await expect(rows).toHaveCount(1)
  expect((await status(ids[4])).verification_status).toBe('flagged')
  await page.goto('/')
  await expect(page.getByRole('link', { name: /phones: ID card check pending/ })).toContainText('1')
})
