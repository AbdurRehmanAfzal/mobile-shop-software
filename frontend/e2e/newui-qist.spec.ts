/** ADR-134: qist (installments) in the new product — no file draws it, so it is drawn like file 12.
 *  Take is the live collection (a payment on the bill), remind the live reminder, cancel the live
 *  cancel with a reason; the lists are the live views. */

import { expect, test } from '@playwright/test'

test.setTimeout(180_000)

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('new product: qist — the lists, take an installment in cash and online, remind, cancel a plan', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Qist Naya', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const get = async (p: string) => (await request.get(`/api/v1${p}`, { headers: h })).json()
  const post = async (p: string, data: unknown) => { const r = await request.post(`/api/v1${p}`, { headers: h, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const dealer = await post('/parties', { name: 'Hall Road Traders', phone: '03215550111', kinds: ['supplier'] })
  const ahmed = await post('/parties', { name: 'Ahmed Khan', phone: '03215550112', kinds: ['customer'] })
  const sara = await post('/parties', { name: 'Sara Bibi', phone: '03215550113', kinds: ['customer'] })
  const nokia = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${nokia.id}`))[0]
  const stamp = String(Date.now()).slice(-4)
  const dev = (n: number) => ({ device: { imei1: imei(`35693${stamp}0${n}111`.slice(0, 14)), brand_id: nokia.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 40000, asking_price: 60000 })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, paid: 0, devices: [dev(1), dev(2)] })
  await post('/sales', { party_id: ahmed.id, devices: [{ device_id: pur.lines[0].device_id, price: 60000 }], paid: 15000, installments: { months: 5, due_day: 10, guarantor_name: 'Bilal Sb', guarantor_phone: '03001112233' } })
  await post('/sales', { party_id: sara.id, devices: [{ device_id: pur.lines[1].device_id, price: 50000 }], paid: 10000, installments: { months: 4, due_day: 5 } })
  const plans = await get('/installments?view=active')
  const a = plans.find((p: { party_name: string }) => p.party_name === 'Ahmed Khan')
  const b = plans.find((p: { party_name: string }) => p.party_name === 'Sara Bibi')

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph.slice(1))
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 30_000 })

  await page.goto(`/new/installments/${a.id}`)
  await expect(page.getByTestId('nq')).toBeVisible()
  await expect(page.getByTestId('nq-k-active')).toContainText('2 plans')
  await expect(page.getByTestId('nq-cards').getByTestId('nq-card')).toHaveCount(2)
  await expect(page.getByTestId('nq-title')).toHaveText('Ahmed Khan')
  await expect(page.getByTestId('nq-money')).toContainText('45,000')
  await expect(page.getByTestId('nq-planline')).toContainText('5 × Rs. 9,000')
  await expect(page.getByTestId('nq-guarantor')).toContainText('Bilal Sb')
  await expect(page.getByTestId('nq-schedule')).toContainText('Due')
  await page.screenshot({ path: 'test-results/newui-qist.png', fullPage: true })

  // take this month's installment in cash
  await page.getByTestId('nq-take').click()
  await expect(page.getByTestId('nq-amount')).toHaveValue('9000')
  await page.getByTestId('nq-take-save').click()
  await expect(page.getByTestId('nq-toast')).toContainText('Received')
  await expect.poll(async () => (await get(`/installments/${a.id}`)).paid_count).toBe(1)
  expect((await get(`/installments/${a.id}`)).remaining).toBe('36000.00')

  // the other: part of it online through a bank
  await page.getByTestId('nq-card').filter({ hasText: 'Sara Bibi' }).click()
  await expect(page.getByTestId('nq-title')).toHaveText('Sara Bibi')
  await page.getByTestId('nq-take').click()
  await page.getByTestId('nq-amount').fill('2000')
  await page.getByTestId('nq-pay-online').click()
  await expect(page.getByTestId('nq-take-save')).toBeDisabled() // a bank is needed
  await page.getByTestId('nq-pay-bank').selectOption('Meezan Bank')
  await page.getByTestId('nq-take-save').click()
  await expect(page.getByTestId('nq-toast')).toContainText('Received')
  await expect.poll(async () => (await get(`/installments/${b.id}`)).remaining).toBe('38000.00')
  await expect(page.getByTestId('nq-schedule')).toContainText('Rs. 2,000 received')

  // remind on WhatsApp (no WhatsApp set up here: it opens a link to send by hand)
  const popup = page.waitForEvent('popup').catch(() => null)
  await page.getByTestId('nq-remind').click()
  await expect(page.getByTestId('nq-toast')).toContainText(/Reminder sent|Opened in WhatsApp/)
  await (await popup)?.close()
  expect((await get(`/installments/${b.id}`)).last_reminded_at).toBeTruthy()

  // cancel this plan with a reason: what is left stays as udhaar
  await page.getByTestId('nq-cancel').click()
  await expect(page.getByTestId('nq-cancel-yes')).toBeDisabled()
  await page.getByTestId('nq-cancel-why').fill('made by mistake')
  await page.getByTestId('nq-cancel-yes').click()
  await expect(page.getByTestId('nq-k-active')).toContainText('1 plans')
  expect(['void', 'cancelled']).toContain((await get(`/installments/${b.id}`)).status)

  // search
  await page.getByTestId('nq-q').fill('Bilal')
  await expect(page.getByTestId('nq-card')).toHaveCount(1)
  await expect(page.getByTestId('nq-card')).toContainText('Ahmed Khan')
  await page.getByTestId('nq-q').fill('')

  // Urdu: one language, right to left
  await page.getByTestId('nq-lang').click()
  await expect(page.locator('html')).toHaveAttribute('dir', 'rtl')
  await page.screenshot({ path: 'test-results/newui-qist-ur.png', fullPage: true })
})
