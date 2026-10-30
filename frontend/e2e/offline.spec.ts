/** Owner (2026-10-29): the internet drops in the market. A sale made offline is saved on the phone
 *  (stock list from the cache), shows as waiting, and is posted once when the connection returns. */

import { expect, test } from '@playwright/test'

test('sale without internet waits on the phone and is sent once when back online', async ({ page, context }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('Offline Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(`039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()

  await page.goto('/stock/opening')
  await page.getByRole('button', { name: 'Add device' }).click()
  await page.getByLabel('IMEI', { exact: true }).fill('490154203237518')
  await page.getByRole('button', { name: 'Nokia', exact: true }).click()
  await page.getByRole('button', { name: /^105/ }).first().click()
  await page.getByLabel('Cost price').fill('800')
  await page.getByLabel('Asking price').fill('1000')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await page.getByRole('button', { name: 'Save' }).click()
  await expect(page.getByText('Purchase saved')).toBeVisible()

  // the sale screen once with internet: its stock list is now on the phone
  await page.goto('/sale/new')
  await expect(page.getByRole('button', { name: /Nokia/ }).first()).toBeVisible()
  await page.waitForTimeout(1500) // the cache is written to the phone's storage a moment later
  await page.goto('/')
  await expect(page.getByText('Good', { exact: false }).first()).toBeVisible()

  // the internet goes: the strip says so; the sale is made from the cached list and waits
  await context.setOffline(true)
  await page.getByRole('link', { name: /^Sell/ }).click()
  await expect(page.getByRole('status')).toContainText('No internet')
  await page.getByRole('button', { name: /Nokia/ }).first().click()
  await page.getByRole('button', { name: 'Skip and sell (I know this person)' }).click()
  await page.getByRole('button', { name: 'Complete sale' }).click()
  await page.getByRole('button', { name: 'Confirm and make the bill' }).click()
  await expect(page.getByRole('status')).toContainText('Saved on this phone')
  await page.screenshot({ path: 'test-results/offline-queued.png' })
  await expect(page.getByRole('button', { name: /Nokia/ }).first()).toBeVisible() // back at step 1
  // the queue survives a reload (it lives in the phone's storage); still offline it shows "waiting"
  await expect.poll(async () => page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.outbox') ?? '{}').state?.queue?.length ?? 0)).toBe(1)

  // back online: sent by itself; the bill exists once
  await context.setOffline(false)
  await expect(page.getByRole('status')).toHaveCount(0, { timeout: 40_000 })
  await page.goto('/sales')
  await expect(page.getByText('INV-000001')).toBeVisible()
  await expect(page.getByText(/INV-0000/)).toHaveCount(1)
  await page.goto('/stock')
  await expect(page.getByText('Sold').first()).toBeVisible()
})
