/** Owner 2026-11-13: a phone that comes in faulty is marked so in the add-stock form (More
 *  details); it goes into stock as Faulty with those faults. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('mark faulty while adding stock', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Fault Add Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  await request.post('/api/v1/parties', { headers: h, data: { name: 'Fault Traders', phone: '03216660001', kinds: ['supplier'] } })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto('/purchase/new')
  await page.getByRole('button', { name: /From a dealer/ }).click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Fault')
  await page.getByRole('button', { name: /Fault Traders/ }).first().click()
  await page.getByRole('button', { name: 'Next' }).click()
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill('356938035651117')
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('800')
  await page.getByLabel('Asking price').fill('1000')
  await page.getByTestId('device-more').click()
  await expect(page.getByTestId('add-faults')).toBeVisible()
  await page.getByTestId('add-fault-camera').click()
  await page.getByTestId('add-fault-lcd').click()
  await page.screenshot({ path: 'test-results/faulty-on-add.png', fullPage: true })
  await page.getByRole('button', { name: 'Add', exact: true }).last().click()
  await page.getByTestId('purchase-review-open').click()
  await expect(page.getByTestId('purchase-review')).toContainText('Camera, LCD')
  await page.getByTestId('review-ok').check()
  await page.getByTestId('purchase-save').click()

  await expect.poll(async () => {
    const list = await (await request.get('/api/v1/devices?q=356938035651117', { headers: h })).json()
    return list[0] ? [list[0].status, list[0].faults] : null
  }).toEqual(['faulty', ['camera', 'lcd']])
})
