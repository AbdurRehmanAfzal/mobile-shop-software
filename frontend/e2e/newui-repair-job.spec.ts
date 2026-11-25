/** ADR-134: a repair job's page in the new product, drawn from `08-repair-job-detail.html`. The steps
 *  are the live status, the work charge the live labour, Given back the live delivery, delete the live
 *  cancel with a reason; the slip is a preview in the chosen language. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

test('new product: a repair job — steps, work charge, deliver, delete, the slip in two languages, as file 08 draws it', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Job Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const ali = await post('/parties', { name: 'Bilal Customer', phone: '03215550081', kinds: ['customer'] })
  const codes = await get('/repairs/fault-codes')
  const a = await post('/repairs', { party_id: ali.id, device_desc: 'Pixel 6 Pro', imei: '357481895822089', fault_codes: [codes[0].code], received_accessories: ['sim', 'cover'], estimate: 5000, advance: 2000 })
  const b = await post('/repairs', { party_id: ali.id, device_desc: 'Galaxy S23 Ultra', fault_codes: [codes[1].code], estimate: 3000 })

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto(`/new/repairs/${a.id}`)
  await expect(page.getByTestId('njob')).toBeVisible()
  await expect(page.getByTestId('njob-card')).toContainText('Pixel 6 Pro')
  await expect(page.getByTestId('njob-card')).toContainText('Bilal Customer')
  await expect(page.getByTestId('njob-switch')).toContainText('Galaxy S23 Ultra')
  await expect(page.getByTestId('njob-left')).toContainText('3,000')
  await expect(page.getByTestId('njob-slip')).toContainText('REPAIR RECEIPT')
  await page.screenshot({ path: 'test-results/newui-repair-job.png', fullPage: true })

  // step 2: being fixed
  await page.getByTestId('njob-step-1').click()
  await expect(page.getByTestId('njob-status')).toContainText('In progress')
  expect((await get(`/repairs/${a.id}`)).status).toBe('in_progress')

  // the work charge
  await page.getByTestId('njob-labour-edit').click()
  await page.getByTestId('njob-labour-input').fill('5000')
  await page.getByTestId('njob-labour-save').click()
  await expect(page.getByTestId('njob-bill')).toContainText('5,000')
  expect((await get(`/repairs/${a.id}`)).labour).toBe('5000.00')

  // step 3: ready, then given back with what is left
  await page.getByTestId('njob-step-2').click()
  await expect(page.getByTestId('njob-status')).toContainText('Ready')
  await page.getByTestId('njob-step-3').click()
  await expect(page.getByTestId('nrep-deliver-paid')).toHaveValue('3000')
  await page.getByTestId('nrep-deliver-save').click()
  await expect(page.getByTestId('njob-status')).toContainText('Delivered')
  const done = await get(`/repairs/${a.id}`)
  expect(done.status).toBe('delivered')
  expect(done.balance_due).toBe('0.00')
  await expect(page.getByTestId('njob-history')).toContainText('Delivered')

  // the slip in Urdu
  await page.getByTestId('njob-doc-ur').click()
  await expect(page.getByTestId('njob-slip')).toHaveAttribute('dir', 'rtl')

  // delete the other job with a reason
  await page.getByTestId('njob-switch').getByRole('button', { name: /Galaxy S23 Ultra/ }).click()
  await expect(page).toHaveURL(new RegExp(`/new/repairs/${b.id}$`))
  await page.getByTestId('njob-delete').click()
  await expect(page.getByTestId('njob-delete-yes')).toBeDisabled()
  await page.getByTestId('njob-delete-why').fill('taken in by mistake')
  await page.getByTestId('njob-delete-yes').click()
  await expect(page.getByTestId('njob-status')).toContainText('Deleted')
  expect((await get(`/repairs/${b.id}`)).status).toBe('cancelled')

  // Urdu: one language, right to left
  await page.getByTestId('njob-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-repair-job-ur.png', fullPage: true })
})
