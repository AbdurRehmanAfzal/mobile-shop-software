/** Owner (2026-10-29): a phone sold on installments (qist): advance now, the rest monthly with a
 *  guarantor; the schedule, taking an installment, a WhatsApp reminder and Home's attention rows. */

import { expect, test, type Page } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function signup(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Qist Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

test('installments: sold on qist from the sale, then the schedule, a collection and a reminder', async ({ page }) => {
  test.setTimeout(120_000)
  await signup(page)
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const api = async (path: string, data: unknown) => {
    const r = await page.request.post(`http://localhost:8000/api/v1${path}`, { headers, data })
    expect(r.ok(), `${path}: ${await r.text()}`).toBeTruthy()
    return r.json()
  }
  const get = async (path: string) => (await page.request.get(`http://localhost:8000/api/v1${path}`, { headers })).json()
  await api('/parties', { name: 'Ahmed Khan', phone: '03219876543', kinds: ['customer'] })
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${brand.id}&q=105`))[0]
  await api('/devices/opening-stock', { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: 50000, asking_price: 60000 })

  // the sale: 60,000; 15,000 advance in cash; 5 months of 9,000; a guarantor
  await page.goto('/sale/new')
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await expect(page.getByLabel('Sold for (Rs)')).toHaveValue('60000')
  await page.getByLabel('Sell on installments (qist)').check()
  await expect(page.getByRole('button', { name: 'Complete sale' })).toBeDisabled()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Ahmed')
  await page.getByRole('button', { name: /Ahmed Khan/ }).first().click()
  await page.getByLabel('Advance paid now (Rs)').fill('15000')
  await page.getByRole('button', { name: '6', exact: true }).click()
  await expect(page.getByLabel('Monthly (Rs)')).toHaveValue('7500')
  await page.getByRole('button', { name: '3', exact: true }).click()
  await expect(page.getByLabel('Monthly (Rs)')).toHaveValue('15000')
  await expect(page.getByText(/Rs\. 45,000 over 3 months/)).toBeVisible()
  // 3 × 25,000 is more than 45,000 -> a plain warning, the button stays off
  await page.getByLabel('Monthly (Rs)').fill('25000')
  await expect(page.getByText(/together they must cover what is left/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Complete sale' })).toBeDisabled()
  await page.getByLabel('Monthly (Rs)').fill('15000')
  await expect(page.getByText(/together they must cover what is left/)).toHaveCount(0)
  await page.getByLabel("Guarantor's name").fill('Bilal Ahmed')
  await page.getByLabel("Guarantor's mobile").fill('03001112222')
  await page.screenshot({ path: 'test-results/sale-installments.png', fullPage: true })
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await expect(page.getByText('Sale complete')).toBeVisible()

  // Home: nothing is due yet (the first installment is next month), the plan is running
  await page.goto('/installments')
  await expect(page.getByRole('button', { name: 'Running' })).toHaveAttribute('aria-pressed', 'true')
  const row = page.getByRole('button', { name: /Ahmed Khan/ })
  await expect(row).toContainText('0/3')
  await expect(row).toContainText('Left 45,000')
  await expect(row).toContainText('Next')
  await page.getByRole('button', { name: 'Due today' }).click()
  await expect(page.getByText('Nothing here')).toBeVisible()
  await page.getByRole('button', { name: 'Running' }).click()
  await row.click()

  // the detail: schedule of three, the people, take the first installment partly
  await expect(page).toHaveURL(/\/installments\/[0-9a-f-]+$/)
  await expect(page.getByText('Advance Rs. 15,000 · 3 × Rs. 15,000 · day 10 of each month')).toBeVisible()
  await expect(page.getByText('Bilal Ahmed')).toBeVisible()
  const sched = page.locator('.card.divide-y > div')
  await expect(sched).toHaveCount(3)
  await expect(sched.nth(0)).toContainText('Due')
  await page.screenshot({ path: 'test-results/installment-detail.png', fullPage: true })
  await page.getByRole('button', { name: 'Take installment' }).click()
  await expect(page.getByLabel('Amount (Rs)')).toHaveValue('15000')
  await page.getByLabel('Amount (Rs)').fill('12000')
  await page.getByRole('button', { name: 'Receive' }).click()
  await expect(page.getByText(/Received\. Payment PAY-/)).toBeVisible()
  await expect(sched.nth(0)).toContainText('Part')
  await expect(sched.nth(0)).toContainText('Rs. 12,000 received')
  await expect(page.getByText('33,000').first()).toBeVisible()

  // the reminder opens WhatsApp with the message
  const [wa] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Remind on WhatsApp' }).click()])
  expect(wa.url()).toMatch(/^https:\/\/(api\.)?whatsapp\.com\/|^https:\/\/wa\.me\/923219876543\?text=/)
  await wa.close()
  await expect(page.getByText('Opened in WhatsApp; tap send there.')).toBeVisible()

  // the rest, in one go: the plan closes
  await page.getByRole('button', { name: 'Take installment' }).click()
  await page.getByLabel('Amount (Rs)').fill('33000')
  await page.getByRole('button', { name: 'Receive' }).click()
  await expect(page.getByText('Finished').first()).toBeVisible()
  await expect(page.getByRole('button', { name: 'Take installment' })).toHaveCount(0)
  await page.goto('/installments?view=closed')
  await expect(page.getByRole('button', { name: /Ahmed Khan/ })).toContainText('3/3')

  // the khata agrees: the customer owes nothing
  const parties = await get('/parties?q=Ahmed')
  expect(parties[0].balance).toBe('0.00')
})
