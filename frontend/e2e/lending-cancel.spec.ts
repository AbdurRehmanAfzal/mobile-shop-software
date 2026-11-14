/** Owner 2026-11-14: a len-den entered the wrong way (took instead of gave) is cancelled, and
 *  entered again the right way with the same amount. */

import { expect, test } from '@playwright/test'

test.setTimeout(120_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('cancel a wrong len-den and enter it the other way', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Lend Fix Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const ali = (await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Ali Lend', phone: '03218881111', kinds: ['customer'] } })).json()).id
  // entered as "took 5,000" — it was given
  const wrong = await request.post('/api/v1/payments', { headers: h, data: { party_id: ali, direction: 'in', amount: 5000, purpose: 'lending' } })
  expect(wrong.ok(), await wrong.text()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto(`/parties/${ali}`)
  await page.getByTestId('lending-cancel').first().click()
  const sheet = page.getByTestId('lending-cancel-sheet')
  await expect(sheet).toContainText('5,000')
  await sheet.getByLabel('Reason').fill('it was given, not taken')
  await page.screenshot({ path: 'test-results/lending-cancel.png', fullPage: true })
  await page.getByTestId('lending-cancel-flip').click()
  // the other side opens with the same amount
  await expect(page.getByLabel('Amount')).toHaveValue('5000')
  await page.getByRole('button', { name: 'Save — money given' }).dispatchEvent('click')
  await expect(page.getByText('Payment saved')).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).dispatchEvent('click')

  const p = await (await request.get(`/api/v1/parties/${ali}`, { headers: h })).json()
  expect(p.balance).toBe('5000.00') // Ali owes the shop 5,000
  const l = await (await request.get(`/api/v1/payments/lending/${ali}`, { headers: h })).json()
  expect(l.entries.map((e: { direction: string; status: string }) => `${e.direction}:${e.status}`).sort()).toEqual(['in:voided', 'out:posted'])
})
