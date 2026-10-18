import { expect, test } from '@playwright/test'
import { openFirstMatchAndPrepare, setHooks, startDemoSearch } from './helpers'

test.use({ colorScheme: 'dark', viewport: { width: 1440, height: 1000 } })

test('light workspace remains light in dark OS settings and reflows to 320px', async ({ page }, testInfo) => {
  await setHooks(page, { stepMs: 100 })
  await startDemoSearch(page)
  await expect(page.getByRole('region', { name: 'Review match' })).toBeVisible()
  const appearance = await page.evaluate(() => ({
    scheme: getComputedStyle(document.documentElement).colorScheme,
    background: getComputedStyle(document.body).backgroundColor,
  }))
  expect(appearance).toEqual({ scheme: 'light', background: 'rgb(245, 248, 254)' })
  await page.screenshot({ path: testInfo.outputPath('matches-desktop.png'), fullPage: true })

  await page.getByRole('link', { name: 'Profile', exact: true }).click()
  await page.screenshot({ path: testInfo.outputPath('profile-desktop.png'), fullPage: true })
  await page.getByRole('link', { name: 'Matches', exact: true }).click()
  await openFirstMatchAndPrepare(page)
  await page.getByLabel('Use my education and interests only').check()
  await page.getByLabel('Use only the details I selected above.').check()
  await page.getByRole('button', { name: 'Generate draft' }).click()
  await expect(page.getByLabel('Body')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('outreach-desktop.png'), fullPage: true })

  await page.getByRole('link', { name: 'Matches', exact: true }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  const review = page.getByRole('button', { name: 'Review match' }).first()
  await review.click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.screenshot({ path: testInfo.outputPath('review-mobile.png') })
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(review).toBeFocused()
  await page.setViewportSize({ width: 320, height: 800 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0)
})
