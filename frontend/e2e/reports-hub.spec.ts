/** Owner 2026-11-19 (ADR-111): Reports lists every report and sheet of the software — the daily
 *  ones first, the rest by subject, a search box, downloads with the dates picked. The reports stay
 *  where they are; a salesman sees only what he may open. */

import { expect, test } from '@playwright/test'

test.setTimeout(150_000)
const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('reports: every report from one screen; daily first; search; a salesman sees fewer', async ({ page, request }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  const ph = phone()
  const s = await request.post('/api/v1/auth/signup', { data: { shop_name: 'Report Mobiles', owner_name: 'Owner', phone: ph, password: 'e2e-secret-1' } })
  const h = { Authorization: `Bearer ${(await s.json()).tokens.access_token}` }
  const staff = phone()
  await request.post('/api/v1/staff', { headers: h, data: { name: 'Ali Salesman', phone: staff, password: 'staff-secret-1', role: 'salesman' } })

  const login = async (p: string, pw: string) => {
    await page.goto('/login')
    await page.getByLabel('Mobile number').fill(p)
    await page.getByLabel('Password').fill(pw)
    await page.getByRole('button', { name: 'Login' }).click()
    await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible({ timeout: 20_000 })
  }
  await login(ph, 'e2e-secret-1')

  // the More page and the list itself
  await page.goto('/reports')
  const hub = page.getByTestId('reports-hub')
  await expect(hub).toBeVisible()
  const daily = hub.getByTestId('hub-daily')
  for (const id of ['day', 'tally', 'khata', 'sales', 'purchases', 'lending', 'cash', 'expenses', 'returns']) await expect(daily.getByTestId(`hub-r-${id}`)).toBeVisible()
  await expect(daily.getByTestId('hub-r-tally')).toContainText('Stock tally')
  await expect(hub.getByTestId('hub-sales')).toContainText('Profit and loss')
  await expect(hub.getByTestId('hub-stock')).toContainText('Item-wise stock sheet')
  await expect(hub.getByTestId('hub-people')).toContainText('Udhaar by age')
  await expect(hub.getByTestId('hub-money')).toContainText('General ledger')
  await expect(hub.getByTestId('hub-staff')).toContainText('Security feed')
  await expect(daily.getByTestId('hub-r-sales').getByRole('button', { name: 'Download' })).toBeVisible()
  await page.screenshot({ path: 'test-results/reports-hub.png', fullPage: true })

  // a daily report opens where it lives
  await daily.getByTestId('hub-r-tally').getByRole('link').click()
  await expect(page).toHaveURL(/\/stock\/summary$/)
  await page.goBack()
  // the dates picked go to the screens that take dates
  await hub.getByRole('button', { name: 'Yesterday' }).click()
  await daily.getByTestId('hub-r-day').getByRole('link').click()
  await expect(page).toHaveURL(/\/hisaab\?from=\d{4}-\d\d-\d\d&to=\d{4}-\d\d-\d\d$/)
  await page.goBack()

  // search by a word
  await hub.getByTestId('hub-search').fill('udhaar')
  await expect(hub.getByTestId('hub-r-khata')).toBeVisible()
  await expect(hub.getByTestId('hub-r-ageing')).toBeVisible()
  await expect(hub.getByTestId('hub-r-profit')).toHaveCount(0)
  await hub.getByTestId('hub-search').fill('zzzz')
  await expect(hub.getByText('No report with these words.')).toBeVisible()
  await hub.getByTestId('hub-search').fill('profit and loss')
  await hub.getByTestId('hub-r-profit').getByRole('link').click()
  await expect(page).toHaveURL(/\/reports\?tab=profit$/)
  await expect(page.getByTestId('to-audit')).toBeVisible() // the profit page as before
  await page.getByTestId('to-all-reports').click()
  await expect(page.getByTestId('reports-hub')).toBeVisible()

  // a salesman: the daily lists, nothing with profit or cost
  await page.evaluate(() => { localStorage.removeItem('mobileshop.auth') })
  await login(staff, 'staff-secret-1')
  await page.goto('/reports')
  await expect(hub.getByTestId('hub-r-day')).toBeVisible()
  await expect(hub.getByTestId('hub-r-khata')).toBeVisible()
  await expect(hub.getByTestId('hub-r-sales')).toBeVisible()
  for (const id of ['profit', 'cash', 'accounts', 'staff', 'security', 'audit']) await expect(hub.getByTestId(`hub-r-${id}`)).toHaveCount(0)
  await page.screenshot({ path: 'test-results/reports-hub-salesman.png', fullPage: true })
})
