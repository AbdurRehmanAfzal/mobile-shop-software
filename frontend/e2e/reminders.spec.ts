/** Owner (2026-10-29): udhaar reminders on WhatsApp and the night report to the owner. Without the
 *  Cloud API (as here) each one opens WhatsApp with the message ready. */

import { expect, test, type Page } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

async function signup(page: Page) {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Remind Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
}

/** an udhaar sale through the API, with the browser's own login */
async function udhaarSale(page: Page, name: string, customerPhone: string, imei: string, price: number) {
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const api = async (path: string, data: unknown) => {
    const r = await page.request.post(`http://localhost:8000/api/v1${path}`, { headers, data })
    expect(r.ok(), `${path}: ${await r.text()}`).toBeTruthy()
    return r.json()
  }
  const get = async (path: string) => (await page.request.get(`http://localhost:8000/api/v1${path}`, { headers })).json()
  const party = await api('/parties', { name, phone: customerPhone, kinds: ['customer'] })
  const brand = (await get('/catalogue/brands')).find((b: { name: string }) => b.name === 'Nokia')
  const model = (await get(`/catalogue/models?brand_id=${brand.id}&q=105`))[0]
  const dev = await api('/devices/opening-stock', { imei1: imei, brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved', cost_price: price - 200, asking_price: price })
  await api('/sales', { party_id: party.id, devices: [{ device_id: dev.id, price }], paid: 0 })
}

test('reminders: everyone who owes, one tap opens WhatsApp; night report settings and send now', async ({ page }) => {
  await signup(page)
  await udhaarSale(page, 'Ahmed Khan', '03219876543', '490154203237518', 5000)
  await udhaarSale(page, 'Bilal', '03219876544', '356938035643809', 12000)

  await page.goto('/khata')
  await page.getByRole('button', { name: 'Udhaar reminders' }).click()
  await expect(page).toHaveURL(/\/khata\/reminders$/)
  await expect(page.getByText(/opens with the reminder ready/)).toBeVisible()
  // biggest balance first, both just entered today
  const rows = page.locator('.card > div')
  await expect(rows).toHaveCount(2)
  await expect(rows.nth(0)).toContainText('Bilal')
  await expect(rows.nth(0)).toContainText('12,000')
  await expect(rows.nth(0)).toContainText('0 days since the last entry')
  await expect(page.getByRole('button', { name: 'Send to all (2)' })).toBeVisible()
  await page.getByRole('button', { name: 'Older than 7 days' }).click()
  await expect(page.getByText('Nobody owes you right now')).toBeVisible()
  await page.getByRole('button', { name: 'Everyone who owes' }).click()
  await page.screenshot({ path: 'test-results/reminders.png', fullPage: true })

  // one person: WhatsApp opens with the text, the message is marked sent
  const [wa] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: 'Remind Ahmed Khan' }).click()])
  expect(wa.url()).toMatch(/^https:\/\/(api\.)?whatsapp\.com\/|^https:\/\/wa\.me\/923219876543\?text=/)
  await wa.close()
  await expect(rows.nth(1)).toContainText('last reminder')

  // everyone: a list of links to open one by one
  await page.getByRole('button', { name: 'Send to all (2)' }).click()
  await expect(page.getByText('Tap each name below to send its reminder on WhatsApp.')).toBeVisible()
  await expect(page.getByRole('link', { name: '03219876544' })).toHaveAttribute('href', /wa\.me\/923219876544/)

  // the night report: owner number, switch on, time, send now -> WhatsApp opens with the hisaab
  await page.goto('/more/notifications')
  await expect(page.getByText(/Automatic sending needs the WhatsApp Business API/)).toBeVisible()
  await page.getByLabel('Owner WhatsApp number').fill('3001234567')
  await page.getByLabel(/Send the day's hisaab every night · WhatsApp/).check()
  await page.getByLabel(/Send the day's hisaab every night · Email/).check()
  await expect(page.getByText(/Email needs an SMTP account/)).toBeVisible()
  await page.locator('input[type="time"]').first().fill('22:00')
  await page.getByLabel(/Remind customers automatically/).check()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Settings saved')).toBeVisible()
  const sendNow = page.getByRole('button', { name: "Send today's hisaab now" })
  await expect(sendNow).toBeEnabled({ timeout: 5000 })
  const [rep] = await Promise.all([page.waitForEvent('popup'), sendNow.click()])
  // wa.me forwards to api.whatsapp.com, which writes spaces as +
  const text = decodeURIComponent(rep.url().replace(/\+/g, ' '))
  expect(text).toMatch(/Sold: 2 phones, Rs\. 17,000/)
  expect(text).toMatch(/To get: Rs\. 17,000/)
  await rep.close()
  await expect(page.getByText('Opened in WhatsApp; tap send there.')).toBeVisible()
  await page.reload()
  await expect(page.locator('input[type="time"]').first()).toHaveValue('22:00')
  await expect(page.getByText(/Sold: 2 phones/).first()).toBeVisible()
})
