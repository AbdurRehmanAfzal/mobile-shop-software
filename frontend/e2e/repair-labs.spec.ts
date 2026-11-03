/** Repair labs and the repair sticker (docs/34): a customer's phone goes to an outside lab, comes
 *  back fixed with the lab's charge (part on its khata), the lab's record, the sticker with the
 *  fields the shop picks, and the repairs audit. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('repair labs: send, back with a charge, lab record, sticker, audit', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Lab Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const cus = await post('/parties', { name: 'Ahmed Khan', phone: '03219876543', kinds: ['customer'] })
  await post('/parties', { name: 'Zain Mobile Lab', phone: '03004440002', kinds: ['technician'] })
  const job = await post('/repairs', { party_id: cus.id, device_desc: 'iPhone 11 black', imei: '490154203237518', fault_codes: ['screen'], estimate: 9000, advance: 2000 })

  // the job: send it to the lab
  await page.goto(`/repairs/${job.id}`)
  await page.getByRole('button', { name: 'Send to a lab' }).first().click()
  await page.getByRole('button', { name: /Zain Mobile Lab/ }).first().dispatchEvent('click')
  await page.getByLabel('What should the lab do').fill('change screen')
  await page.getByLabel("Lab's quote").fill('4500')
  await page.getByRole('button', { name: 'Send', exact: true }).dispatchEvent('click')
  const at = page.getByTestId('at-lab')
  await expect(at).toContainText('Zain Mobile Lab')
  await expect(at).toContainText('change screen')
  await page.screenshot({ path: 'test-results/repair-at-lab.png', fullPage: true })

  // back fixed: charge 4,000, paid 1,000 → 3,000 on the lab's khata
  await at.getByRole('button', { name: 'Back from lab' }).click()
  await page.getByLabel("Lab's charge").fill('4000')
  await page.getByLabel('Paid to the lab now').fill('1000')
  await expect(page.getByText(/Rs\. 3,000 goes to the lab's khata/)).toBeVisible()
  await page.getByRole('button', { name: 'Save', exact: true }).dispatchEvent('click')
  await expect(page.getByTestId('at-lab')).toHaveCount(0)
  await expect(page.getByTestId('lab-trips')).toContainText('Zain Mobile Lab')
  await expect(page.getByTestId('lab-trips')).toContainText('Fixed')

  // the sticker: pick the fields
  await page.getByRole('button', { name: 'Print sticker' }).click()
  const st = page.getByTestId('repair-sticker')
  await expect(st.getByRole('button', { name: 'Customer', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await st.getByRole('button', { name: 'IMEI', exact: true }).click()
  await expect(st.getByRole('button', { name: 'IMEI', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: 'test-results/repair-sticker-sheet.png' })
  const sticker = await page.request.get(`http://localhost:8000/api/v1/labels/repairs?ids=${job.id}&fields=no,customer,device,imei,fault,barcode&lang=en`, { headers })
  const html = await sticker.text()
  expect(html).toContain(job.no)
  expect(html).toContain('IMEI 490154203237518')
  await page.getByRole('button', { name: 'Close' }).last().click()

  // the labs list and the lab's record
  await page.goto('/repairs')
  await page.getByTestId('open-labs').click()
  await expect(page.getByTestId('labs')).toContainText('Zain Mobile Lab')
  await page.getByTestId('labs').getByText('Zain Mobile Lab').click()
  await expect(page.getByTestId('lab-owe')).toContainText('3,000')
  await expect(page.getByTestId('lab-history')).toContainText('iPhone 11 black')
  await page.screenshot({ path: 'test-results/repair-lab-record.png', fullPage: true })

  // the repairs audit
  await page.goto('/audit/repairs?preset=today')
  await expect(page.getByTestId('repairs-counts')).toContainText('Taken in')
  await expect(page.getByTestId('repairs-money')).toContainText('4,000')
  await expect(page.getByTestId('repairs-labs')).toContainText('Zain Mobile Lab')
  await page.screenshot({ path: 'test-results/repair-audit.png', fullPage: true })
})
