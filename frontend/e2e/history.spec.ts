/** Owner 2026-10-31: every history row opens its document; the phone's history and the person's
 *  journey download, print and share in every format. */

import { expect, test } from '@playwright/test'

const phone = () => `039${Math.floor(10_000_000 + Math.random() * 89_999_999)}`

test('history rows open their documents; history and journey export in every format', async ({ page }) => {
  await page.addInitScript(() => {
    if (!localStorage.getItem('locale')) localStorage.setItem('locale', 'en')
  })
  await page.goto('/signup')
  await page.getByLabel('Shop name', { exact: true }).fill('History Shop')
  await page.getByLabel('Your name').fill('Owner')
  await page.getByLabel('Mobile number').fill(phone())
  await page.getByLabel('Password').fill('e2e-secret-1')
  await page.getByRole('button', { name: /Create shop account/ }).click()
  await expect(page.getByPlaceholder("IMEI, phone or person's name")).toBeVisible()
  const auth = await page.evaluate(() => JSON.parse(localStorage.getItem('mobileshop.auth') ?? '{}').state)
  const headers = { Authorization: `Bearer ${auth.accessToken}`, 'X-Shop-Id': auth.activeShopId }
  const get = async (p: string) => (await page.request.get(`http://localhost:8000/api/v1${p}`, { headers })).json()
  const post = async (p: string, data: unknown) => { const r = await page.request.post(`http://localhost:8000/api/v1${p}`, { headers, data }); expect(r.ok(), await r.text()).toBeTruthy(); return r.json() }
  const brand = (await get('/catalogue/brands'))[0]
  const model = (await get(`/catalogue/models?brand_id=${brand.id}`))[0]
  const dealer = await post('/parties', { name: 'Dealer', phone: '03005556666', kinds: ['supplier'] })
  const cus = await post('/parties', { name: 'Ahmed', phone: '03001111111', kinds: ['customer'] })
  const pur = await post('/purchases', { kind: 'supplier', party_id: dealer.id, devices: [{ device: { imei1: '490154203237518', brand_id: brand.id, model_id: model.id, condition: 'box_pack', pta_status: 'pta_approved' }, cost: 800, asking_price: 1000 }], paid: 800 })
  const devId = pur.lines[0].device_id
  const inv = await post('/sales', { party_id: cus.id, devices: [{ device_id: devId, price: 1100 }], paid: 600 })
  await post('/payments', { party_id: cus.id, direction: 'in', amount: 500, allocations: [{ document_type: 'invoice', document_id: inv.id, amount: 500 }] })

  // the phone's history: the sale row opens the bill, the purchase row opens the purchase
  await page.goto(`/stock/${devId}`)
  const rows = page.getByTestId('timeline-link')
  await expect(rows.first()).toBeVisible()
  await rows.filter({ hasText: inv.no }).first().click()
  await expect(page).toHaveURL(new RegExp(`/sales/${inv.id}`))
  await page.goBack()
  await page.getByTestId('timeline-link').filter({ hasText: pur.no }).first().click()
  await expect(page).toHaveURL(new RegExp(`/purchases/${pur.id}`))
  await page.goBack()

  // download / print / share the history in every format
  const history = page.locator('section', { hasText: 'History' }).last()
  await history.getByRole('button', { name: 'Download', exact: true }).click()
  await expect(page.getByText('Download this report')).toBeVisible()
  const [csv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV/ }).click()])
  expect(csv.suggestedFilename()).toMatch(/history-.*\.csv$/)
  const [xlsx] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Excel/ }).click()])
  expect(xlsx.suggestedFilename()).toMatch(/\.xlsx$/)
  const [printed] = await Promise.all([page.waitForEvent('popup'), page.getByRole('button', { name: /Print on paper/ }).click()])
  await printed.waitForLoadState()
  expect(await printed.locator('body').innerText()).toContain('Phone history')
  await printed.close()
  await page.keyboard.press('Escape')
  await history.getByRole('button', { name: 'Share', exact: true }).click()
  await expect(page.getByText('Share this report')).toBeVisible()
  await page.keyboard.press('Escape')

  // the person's journey: a row opens the bill; the journey downloads
  await page.goto(`/parties/${cus.id}`)
  const journey = page.getByTestId('party-journey')
  await expect(journey).toContainText('Every dealing')
  await journey.locator('details').evaluate((d) => { (d as HTMLDetailsElement).open = true })
  await page.getByTestId('journey-link').filter({ hasText: inv.no }).first().click()
  await expect(page).toHaveURL(new RegExp(`/sales/${inv.id}`))
  await page.goBack()
  await page.getByTestId('party-journey').getByRole('button', { name: 'Download', exact: true }).click()
  const [jcsv] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /CSV/ }).click()])
  expect(jcsv.suggestedFilename()).toMatch(/journey-.*\.csv$/)
})
