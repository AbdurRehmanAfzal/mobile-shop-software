/** ADR-132 / ADR-133 (docs/43 mock-up 01): in the new design, on a laptop the purchase shows "from whom" and the bill side by
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

  // a laptop in the design the shops know: still one step at a time
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.evaluate(() => sessionStorage.clear())
  await page.goto('/purchase/new')
  await expect(page.getByTestId('buy-wait')).toHaveCount(0)
  await expect(page.getByTestId('buy-bill')).toHaveCount(0)

  // a laptop in the new design: both, side by side; the bill waits for the seller
  await page.goto('/more/appearance')
  await page.getByTestId('look-layout-counter').click() // ADR-133: the mock-ups' version is the "New design"
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

  // the device's details are asked on the same screen, beside the bill — no sheet over the page
  await page.getByRole('button', { name: 'Add device' }).click()
  const builder = page.getByTestId('buy-builder')
  await expect(builder).toBeVisible()
  await expect(page.getByTestId('sheet-backdrop')).toHaveCount(0)
  const b = await builder.boundingBox()
  expect(b!.x + b!.width).toBeLessThanOrEqual(bill!.x)
  await builder.getByLabel('IMEI', { exact: true }).fill('490154203237518')
  await builder.getByRole('button', { name: 'Nokia', exact: true }).click()
  await builder.getByRole('button', { name: /^105/ }).first().click()
  // memory and colour are pills, not dropdowns; a second tap takes the choice back
  await expect(builder.locator('select')).toHaveCount(0)
  const colour = builder.getByTestId('colour-pills').getByRole('radio').first()
  await colour.click()
  await expect(colour).toHaveAttribute('aria-checked', 'true')
  await colour.click()
  await expect(colour).toHaveAttribute('aria-checked', 'false')
  await colour.click()
  await builder.getByLabel('Cost price').fill('800')
  await builder.getByLabel('Asking price').fill('1000')
  await page.screenshot({ path: 'test-results/buy-builder-laptop.png', fullPage: true })
  await builder.getByRole('button', { name: 'Add', exact: true }).last().click()
  // it lands on the bill and the form closes
  await expect(builder).toHaveCount(0)
  await expect(page.getByTestId('buy-bill')).toContainText('490154203237518')
  await expect(page.getByTestId('buy-foot')).toContainText('Rs. 800')
  // editing a line opens the same form on the screen; Close leaves the bill as it is
  await page.getByTestId('device-edit').click()
  await expect(builder).toBeVisible()
  await page.getByTestId('buy-builder-close').click()
  await expect(builder).toHaveCount(0)
  await expect(page.getByTestId('buy-bill')).toContainText('490154203237518')
})
