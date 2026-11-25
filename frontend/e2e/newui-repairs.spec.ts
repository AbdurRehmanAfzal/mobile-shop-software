/** ADR-134: repairs & lab hub in the new product, drawn from `09-repairs-and-lab-hub.html`. Intake posts
 *  the live repair (and the lab trip), the slip is a live preview; the board's actions are the live
 *  lab return, status and delivery. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

test('new product: repairs — take in for the shop and for a lab, back from the lab, ready, deliver, as file 09 draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Repair Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  await post('/parties', { name: 'Ali Jaranwala', phone: '03215550071', kinds: ['customer'] })
  await post('/parties', { name: 'Hassan LCD Lab', phone: '03215550072', kinds: ['technician'] })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto('/new/repairs')
  await expect(page.getByTestId('nrep')).toBeVisible()
  await expect(page.getByTestId('nrep-intake')).toBeVisible()

  // 1. a khata customer's phone for the shop's technician
  await page.getByTestId('nrep-customer-q').fill('Ali')
  await page.getByTestId('nrep-customer-hit').filter({ hasText: 'Ali Jaranwala' }).click()
  await expect(page.getByTestId('nrep-customer')).toContainText('Ali Jaranwala')
  await page.getByTestId('nrep-model').fill('Samsung Galaxy A54')
  await page.getByTestId('nrep-imei').fill('358934996917199')
  await page.getByTestId('nrep-faults').getByRole('button').first().click()
  await page.getByTestId('nrep-acc-sim').click()
  await page.getByTestId('nrep-estimate').fill('8500')
  await page.getByTestId('nrep-advance').fill('2000')
  await expect(page.getByTestId('nrep-slip-model')).toHaveText('Samsung Galaxy A54')
  await expect(page.getByTestId('nrep-slip-balance')).toContainText('6,500')
  await expect(page.getByTestId('nrep-profit')).toContainText('8,500')
  await page.screenshot({ path: 'test-results/newui-repairs.png', fullPage: true })
  await page.getByTestId('nrep-save').click()
  await expect(page.getByTestId('nrep-jobs')).toBeVisible()
  let jobs = await get('/repairs?open_only=true')
  expect(jobs).toHaveLength(1)
  const first = jobs[0]
  expect(first.estimate).toBe('8500.00')
  expect(first.advance).toBe('2000.00')
  expect(first.received_accessories).toEqual(['sim'])

  // 2. a walk-in's phone for an outside lab
  await page.getByTestId('nrep-tab-intake').click()
  await page.getByTestId('nrep-walkin').click()
  await page.getByTestId('nrep-walk-name').fill('Bilal Walk')
  await page.getByTestId('nrep-walkin-box').getByRole('textbox').nth(1).fill('3215550073')
  await page.getByTestId('nrep-model').fill('Vivo V30')
  await page.getByTestId('nrep-faults').getByRole('button').nth(1).click()
  await page.getByTestId('nrep-who-lab').click()
  await page.getByTestId('nrep-lab').selectOption({ label: 'Hassan LCD Lab — 03215550072' })
  await page.getByTestId('nrep-lab-price').fill('3000')
  await page.getByTestId('nrep-lab-do').fill('Change the screen')
  await page.getByTestId('nrep-estimate').fill('5000')
  await expect(page.getByTestId('nrep-profit')).toContainText('2,000')
  await page.getByTestId('nrep-save').click()
  await expect(page.getByTestId('nrep-jobs')).toBeVisible()
  jobs = await get('/repairs?open_only=true')
  const second = jobs.find((j: { device_desc: string }) => j.device_desc === 'Vivo V30')
  expect(second.at_lab.quoted_cost).toBe('3000.00')
  await expect(page.getByTestId(`nrep-card-${second.no}`)).toContainText('In outside lab')
  await expect(page.getByTestId('nrep-labs')).toContainText('Hassan LCD Lab')

  // filters
  await page.getByTestId('nrep-f-lab').click()
  await expect(page.getByTestId('nrep-cards')).not.toContainText('Samsung Galaxy A54')
  await page.getByTestId('nrep-f-all').click()

  // back from the lab, fixed
  await page.getByTestId(`nrep-card-${second.no}`).getByTestId('nrep-back').click()
  await page.getByTestId('nrep-outcome-fixed').click()
  await page.getByTestId('nrep-back-save').click()
  await expect(page.getByTestId(`nrep-card-${second.no}`)).not.toContainText('In outside lab')
  expect((await get(`/repairs/${second.id}`)).at_lab).toBeNull()

  // the first: ready, then deliver (charges = the estimate, paid = what is left)
  await page.getByTestId(`nrep-card-${first.no}`).getByTestId('nrep-ready').click()
  await expect(page.getByTestId(`nrep-card-${first.no}`)).toContainText('Ready for pickup')
  await page.getByTestId(`nrep-card-${first.no}`).getByTestId('nrep-deliver').click()
  await expect(page.getByTestId('nrep-deliver-labour')).toHaveValue('8500')
  await expect(page.getByTestId('nrep-deliver-paid')).toHaveValue('6500')
  await page.getByTestId('nrep-deliver-save').click()
  await expect(page.getByTestId(`nrep-card-${first.no}`)).toHaveCount(0)
  const done = await get(`/repairs/${first.id}`)
  expect(done.status).toBe('delivered')
  expect(done.balance_due).toBe('0.00')

  // Urdu: one language, right to left
  await page.getByTestId('nrep-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-repairs-ur.png', fullPage: true })
})
