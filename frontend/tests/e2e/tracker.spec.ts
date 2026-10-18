import { expect, test, type Page } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { openFirstMatchAndPrepare, setHooks, startDemoSearch } from './helpers'

async function writeDraft(page: Page) {
  await setHooks(page, { stepMs: 200 })
  await startDemoSearch(page)
  await openFirstMatchAndPrepare(page)
  await page.getByLabel('Use my education and interests only').check()
  await page.getByLabel('Use only the details I selected above.').check()
  await page.getByRole('button', { name: 'Generate draft' }).click()
  await expect(page.getByLabel('Body')).toBeVisible()
}

test('save a draft, track its status, and keep it after reload', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await writeDraft(page)

  await page.getByRole('button', { name: 'Save to tracker' }).click()
  await expect(page.getByRole('button', { name: 'Saved to tracker' })).toHaveAttribute('aria-disabled', 'true')
  await expect(page.getByRole('link', { name: /Outreach tracker/ })).toContainText('1')

  await page.getByLabel('Body').fill('Updated text for the tracker.')
  await page.getByRole('button', { name: 'Update tracker copy' }).click()
  await expect(page.getByRole('button', { name: 'Saved to tracker' })).toBeVisible()
  await page.getByRole('link', { name: 'Open tracker' }).click()

  await expect(page).toHaveURL(/\/tracker$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Outreach tracker' })).toBeFocused()
  const item = page.locator('.tracker-item').first()
  await expect(item.getByRole('heading', { name: /Prof\. Elena Marrow/ })).toBeVisible()
  await expect(item.getByText('Sample', { exact: true })).toBeVisible()
  await expect(item.getByLabel('Status')).toHaveValue('not_sent')

  await item.getByLabel('Status').selectOption('sent')
  await expect(item.getByLabel('Sent on')).toHaveValue(/^\d{4}-\d{2}-\d{2}$/)
  await item.getByLabel('Follow up by').fill('2020-01-01')
  await expect(item.getByText('Follow-up due')).toBeVisible()
  await item.getByLabel('Notes').fill('Sent from my school email.')

  await item.getByText('Saved email').click()
  await expect(item.getByText('Updated text for the tracker.')).toBeVisible()
  await item.getByRole('button', { name: 'Copy email' }).click()
  await expect(item.getByRole('button', { name: 'Copied' })).toBeVisible()
  expect(await page.evaluate(() => navigator.clipboard.readText())).toMatch(/\n\nUpdated text for the tracker\.$/)

  await page.reload()
  const reloaded = page.locator('.tracker-item').first()
  await expect(reloaded.getByLabel('Status')).toHaveValue('sent')
  await expect(reloaded.getByLabel('Notes')).toHaveValue('Sent from my school email.')
  await expect(page.getByText('1 record · 1 follow-up due')).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download CSV' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toMatch(/^researchmatch-outreach-\d{4}-\d{2}-\d{2}\.csv$/)
  const csv = await readFile(await download.path(), 'utf-8')
  expect(csv).toContain('Prof. Elena Marrow')
  expect(csv).toContain('Sent from my school email.')

  await page.getByLabel('Show').selectOption('replied')
  await expect(page.getByRole('heading', { name: 'No records with this status.' })).toBeVisible()
  await page.getByRole('button', { name: 'Show all' }).click()

  await page.locator('.tracker-item').first().getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('heading', { name: 'Remove this record?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep it' }).click()
  await expect(page.locator('.tracker-item')).toHaveCount(1)
  await page.locator('.tracker-item').first().getByRole('button', { name: 'Remove' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Remove' }).click()
  await expect(page.getByRole('heading', { name: 'Nothing tracked yet.' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Outreach tracker/ })).toHaveText('Outreach tracker')
})

test('starting over keeps the tracker', async ({ page }) => {
  await writeDraft(page)
  await page.getByRole('button', { name: 'Save to tracker' }).click()
  await page.getByRole('banner').getByRole('button', { name: 'Start over' }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByText(/stay in this browser/)).toBeVisible()
  await dialog.getByRole('button', { name: 'Start over' }).click()
  await expect(page.getByText('Live', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: /Outreach tracker/ }).click()
  await expect(page.locator('.tracker-item')).toHaveCount(1)
})

test.describe('small screens', () => {
  test.use({ viewport: { width: 360, height: 800 } })

  test('tracker reads stored records and fits without horizontal scroll', async ({ page }) => {
    await page.addInitScript(() => {
      const record = {
        id: 'trk-live-cand-uw-a',
        candidateId: 'cand-uw-a',
        mode: 'live',
        name: 'Prof. Bartholomew Featherstonehaugh-Montgomery',
        schoolId: 'uw',
        lab: 'Ubiquitous Computing and Accessible Interaction Lab',
        sourceUrl: 'https://www.washington.edu/example',
        subject: 'Undergraduate research',
        body: 'Dear Professor,\n\nA saved email.',
        status: 'replied',
        sentOn: '2026-09-20',
        followUpOn: null,
        notes: '',
        createdAt: '2026-09-20T12:00:00.000Z',
        updatedAt: '2026-09-21T12:00:00.000Z',
      }
      localStorage.setItem('researchmatch.tracker.v1', JSON.stringify([record, { broken: true }]))
    })
    await page.goto('/tracker')
    await expect(page.locator('.tracker-item')).toHaveCount(1)
    await expect(page.getByLabel('Status')).toHaveValue('replied')
    const link = page.getByRole('link', { name: /Source page/ })
    await expect(link).toHaveAttribute('href', 'https://www.washington.edu/example')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(0)
  })
})
