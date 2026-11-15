/** Owner 2026-11-15 (ADR-079): WhatsApp group messages in one standard format; the person entering
 *  pastes one and the usual form opens filled (sale, purchase, payment). */

import { expect, test } from '@playwright/test'

test.setTimeout(240_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

function imei(base: string): string {
  const d = base.split('').map(Number)
  let sum = 0
  for (let i = 0; i < 14; i++) { let x = d[i]; if (i % 2 === 1) { x *= 2; if (x > 9) x -= 9 } sum += x }
  return base + String((10 - (sum % 10)) % 10)
}

test('enter from WhatsApp messages', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'WA Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const brands = await (await request.get('/api/v1/catalogue/brands', { headers: h })).json()
  const sam = brands.find((x: { name: string }) => x.name === 'Samsung')
  const models = await (await request.get(`/api/v1/catalogue/models?brand_id=${sam.id}`, { headers: h })).json()
  const model = models[0]
  const dealer = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Bilal Mobiles', phone: '03219997777', kinds: ['supplier'] } })).json()
  const cust = await (await request.post('/api/v1/parties', { headers: h, data: { name: 'Ali Khan', phone: '03001239876', kinds: ['customer'] } })).json()
  const inStock = imei(`35693803590${String(Date.now()).slice(-3)}`)
  const pr = await request.post('/api/v1/purchases', { headers: h, data: { kind: 'supplier', party_id: dealer.id, devices: [{ device: { imei1: inStock, brand_id: sam.id, model_id: model.id, condition: 'used', pta_status: 'pta_approved' }, cost: 30000, asking_price: 36000 }] } })
  expect(pr.ok(), await pr.text()).toBeTruthy()

  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // 1. a sale message → the sale opens with the phone, the customer, the price and the udhaar
  await page.goto('/whatsapp')
  await page.getByTestId('wa-text').fill(`*SALE*\nMobile: Samsung ${model.name}\nIMEI: ${inStock}\nCustomer: Ali Khan\nPhone: 0300-1239876\nPrice: 35,000\nPaid: 20000 cash\nBy: Ahmed`)
  await expect(page.getByTestId('wa-phones')).toContainText('In stock')
  await expect(page.getByTestId('wa-party')).toContainText('Ali Khan')
  await expect(page.getByTestId('wa-read')).toContainText('15,000') // on udhaar
  await page.screenshot({ path: 'test-results/wa-enter-sale.png', fullPage: true })
  await page.getByTestId('wa-open').click()
  await expect(page).toHaveURL(/\/sale\/new/)
  await expect(page.getByText(inStock).first()).toBeVisible()
  await expect(page.locator('input[value="35000"]').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/wa-sale-form.png', fullPage: true })

  // 2. a purchase message → the phone sheet opens with the IMEI, model and cost
  const fresh = imei(`35693803591${String(Date.now()).slice(-3)}`)
  await page.goto('/whatsapp')
  await page.getByTestId('wa-text').fill(`khareeda\nmodel - Samsung ${model.name} used non pta\nIMEI ${fresh}\nFrom: Bilal Mobiles\nPhone: 03219997777\nCost: 28k\nAsking: 33000\nPaid: 10000 jazzcash`)
  await expect(page.getByTestId('wa-phones')).toContainText('New phone')
  await expect(page.getByTestId('wa-party')).toContainText('Bilal Mobiles')
  await page.getByTestId('wa-open').click()
  await expect(page).toHaveURL(/\/purchase\/new/)
  await expect(page.locator(`input[value="${fresh}"]`).first()).toBeVisible()
  await expect(page.locator('input[value="28000"]').first()).toBeVisible()
  await page.screenshot({ path: 'test-results/wa-purchase-form.png', fullPage: true })

  // 3. a payment message → the payment form, the amount filled; saving it reaches the khata
  await page.goto('/whatsapp')
  await page.getByTestId('wa-text').fill('*PAYMENT RECEIVED*\nName: Ali Khan\nPhone: 03001239876\nAmount: 5,000\nMethod: cash')
  await expect(page.getByTestId('wa-party')).toContainText('Ali Khan')
  await page.getByTestId('wa-open').click()
  await expect(page.locator('input[value="5000"]').first()).toBeVisible()
  await page.getByRole('button', { name: /^Save|^Receive/ }).last().click()
  await expect(page.getByText('Payment saved')).toBeVisible()
  await page.getByRole('button', { name: 'Done' }).click()
  await expect(page.getByText('Saved. Paste the next message.')).toBeVisible()
  const pays = await (await request.get(`/api/v1/payments?party_id=${cust.id}`, { headers: h })).json()
  expect(JSON.stringify(pays)).toContain('5000')

  // 4. writing: the standard message
  await page.getByRole('button', { name: 'Write a message' }).click()
  await page.getByLabel('Customer').fill('Zain')
  await page.getByLabel('Sale price').fill('42000')
  await page.getByLabel('Paid now').fill('40000')
  await expect(page.getByTestId('wa-preview')).toContainText('*SALE*')
  await expect(page.getByTestId('wa-preview')).toContainText('Customer: Zain')
  await expect(page.getByTestId('wa-preview')).toContainText('Udhaar: 2,000')
  await page.screenshot({ path: 'test-results/wa-write.png', fullPage: true })
})
