/** Owner (2026-10-30): the assistant screen. The Claude API is not called here: the status and chat
 *  routes are answered by the test, so the screen's flow is what is checked. The real wiring is
 *  covered by the backend tests with a fake client. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('assistant: off without a key; with a key the quick question gets an answer and the thread grows', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('AI Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  // the real server has no key locally: the screen says so and the box is disabled
  await page.goto('/more')
  await page.getByRole('button', { name: 'Assistant', exact: true }).click()
  await expect(page).toHaveURL(/\/assistant$/)
  await expect(page.getByText(/not switched on/)).toBeVisible()
  await expect(page.getByPlaceholder(/Ask about your shop/)).toBeDisabled()

  // with a key (routes answered here): quick question → answer with the tools it looked at
  await page.route('**/api/v1/ai/status', (r) => r.fulfill({ json: { configured: true, model: 'claude-opus-5-5', used_today: 2, limit: 200 } }))
  await page.route('**/api/v1/ai/chat', async (r) => {
    const body = r.request().postDataJSON() as { question: string; lang: string; history: unknown[] }
    expect(body.lang).toBe('en')
    await r.fulfill({ json: { answer: `You asked: ${body.question}\nRs. 45,000 today, 3 phones.`, tools: ['hisaab'], used_today: 3, limit: 200 } })
  })
  await page.reload()
  await expect(page.getByText('2 of 200 used today')).toBeVisible()
  await page.getByRole('button', { name: 'How much did we sell today?' }).click()
  const thread = page.getByTestId('ai-thread')
  await expect(thread).toContainText('You asked: How much did we sell today?')
  await expect(thread).toContainText('Rs. 45,000 today, 3 phones.')
  await expect(thread).toContainText("Looked at: the day's hisaab")
  await page.getByPlaceholder(/Ask about your shop/).fill('Who owes the most?')
  await page.getByRole('button', { name: 'Ask' }).click()
  await expect(thread).toContainText('You asked: Who owes the most?')
  await page.screenshot({ path: 'test-results/assistant.png', fullPage: true })

  // Home shows the assistant card when the module is on and the key is set
  await page.goto('/')
  await expect(page.getByRole('link', { name: /Ask the assistant/ })).toBeVisible()
})
