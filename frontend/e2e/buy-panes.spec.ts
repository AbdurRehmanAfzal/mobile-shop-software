/** ADR-132 (docs/43 mock-up 01): on a laptop the purchase shows "from whom" and the bill side by
 *  side — the bill opens once the seller is chosen and the total stays in view; a phone keeps its
 *  steps. */

import { expect, test } from '@playwright/test'

test('purchase: from whom beside the bill on a laptop, steps on a phone', async ({ page, request }) => {
  await page.addInitScript(() => { if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en') })
  const ph = `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Panes Shop', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  expect((await request.post('/api/v1/parties', { headers: h, data: { name: 'Pane Traders', phone: '03219990011', kinds: ['supplier'] } })).ok()).toBeTruthy()
  await page.goto('/login')
  await page.getByLabel('Mobile number').fill(ph)
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: 'Login' }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })

  // a phone: one step at a time, as before
  await page.goto('/purchase/new')
  await page.getByTestId('buy-from').getByText('From a dealer').first().click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Pane')
  await page.getByText('Pane Traders').first().click()
  await expect(page.getByTestId('buy-bill')).toHaveCount(0)
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByTestId('buy-bill')).toBeVisible()
  await expect(page.getByTestId('buy-from')).toHaveCount(0)

  // a laptop: both, side by side; the bill waits for the seller
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => sessionStorage.clear())
  await page.goto('/purchase/new')
  await expect(page.getByTestId('buy-wait')).toBeVisible()
  await expect(page.getByTestId('buy-bill')).toHaveCount(0)
  await page.getByTestId('buy-from').getByText('From a dealer').first().click()
  await page.getByPlaceholder('Name, phone or CNIC').fill('Pane')
  await page.getByText('Pane Traders').first().click()
  await expect(page.getByTestId('buy-bill')).toBeVisible()
  await expect(page.getByTestId('buy-wait')).toHaveCount(0)
  const from = await page.getByTestId('buy-from').boundingBox()
  const bill = await page.getByTestId('buy-bill').boundingBox()
  expect(from!.x + from!.width).toBeLessThanOrEqual(bill!.x)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)
  await page.screenshot({ path: 'test-results/buy-panes-laptop.png', fullPage: true })
})
