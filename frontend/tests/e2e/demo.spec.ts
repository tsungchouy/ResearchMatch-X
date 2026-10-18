import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { openFirstMatchAndPrepare, setHooks, startDemoSearch } from './helpers'

test.beforeEach(async ({ page }) => {
  await setHooks(page, { stepMs: 250 })
})

test('complete Demo flow without an API key', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('/profile')
  await expect(page.getByText('Live search is not configured. Try the sample workflow.')).toBeVisible()

  await page.getByRole('button', { name: 'Try a sample profile' }).click()
  await page.getByRole('button', { name: /HCI sample/ }).click()
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible()

  const find = page.getByRole('button', { name: 'Find research matches' })
  await expect(find).toBeDisabled()
  await expect(page.getByText('Check the box above to confirm your details.')).toBeVisible()
  await page.getByLabel('I have reviewed my background and preferences.').check()
  await find.click()

  // Progress uses real per-school statuses, then results.
  await expect(page.getByRole('heading', { level: 1, name: 'Finding relevant research.' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 1, name: 'Research matches' })).toBeVisible({ timeout: 10_000 })
  await expect(page.getByRole('heading', { name: '5 matches' })).toBeVisible()
  await expect(page.getByText('Sample data: these people, labs and sources are fictional, not live university pages.')).toBeVisible()
  await expect(page.getByText(/%/)).toHaveCount(0)

  // Local filters, empty filter state, clear filters.
  await page.getByLabel('Recruitment status').selectOption('closed_stated')
  await expect(page.locator('.match')).toHaveCount(1)
  await page.getByLabel('University').selectOption('uw')
  await expect(page.getByRole('heading', { name: 'No matches for these filters.' })).toBeVisible()
  await page.getByRole('button', { name: 'Clear filters' }).click()
  await expect(page.locator('.match')).toHaveCount(5)

  // Not relevant can be undone.
  await page.getByRole('button', { name: 'Not relevant' }).nth(1).click()
  await expect(page.getByText(/marked as not relevant/)).toBeVisible()
  await page.getByRole('button', { name: 'Undo' }).click()

  // Drawer: escape closes and returns focus; checkbox gates outreach.
  const review = page.getByRole('button', { name: 'Review match' }).first()
  await review.click()
  const drawer = page.getByRole('dialog')
  await expect(drawer.getByRole('heading', { name: 'Recruitment status' })).toBeVisible()
  await expect(drawer.getByText(/Sample source/).first()).toBeVisible()
  await expect(drawer.getByRole('button', { name: 'Prepare outreach' })).toBeDisabled()
  await page.keyboard.press('Escape')
  await expect(drawer).toBeHidden()
  await expect(review).toBeFocused()
  await openFirstMatchAndPrepare(page)

  // Outreach: nothing pre-selected, gate before generating.
  await expect(page.getByRole('heading', { level: 1, name: 'Prepare your outreach' })).toBeVisible()
  const generate = page.getByRole('button', { name: 'Generate draft' })
  await expect(generate).toBeDisabled()
  await page.getByLabel('Research assistant, campus accessibility study').check()
  await expect(generate).toBeDisabled()
  await page.getByLabel('Use only the details I selected above.').check()
  await generate.click()

  const body = page.getByLabel('Body')
  await expect(body).toBeVisible()
  await expect(page.getByText('Sample draft')).toBeVisible()
  await expect(body).toHaveValue(/Dear Professor Marrow/)
  await expect(body).toHaveValue(/Jordan Sample/)

  // Edit, then regenerate asks before replacing and keeps edits by default.
  await body.fill('My own words for Professor Marrow.')
  await expect(page.getByText(/Edited by you/)).toBeVisible()
  await page.getByRole('button', { name: 'Regenerate' }).click()
  await expect(page.getByRole('heading', { name: 'Replace your edits?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep my edits' }).click()
  await expect(body).toHaveValue('My own words for Professor Marrow.')

  // Changing availability marks the draft stale without touching it.
  await page.getByLabel('Availability').fill('from June 2027 to August 2027')
  await expect(page.getByText('Your details changed after this draft was written.')).toBeVisible()
  await expect(body).toHaveValue('My own words for Professor Marrow.')

  // The complete workflow and user edits survive a refresh.
  await page.reload()
  await expect(page).toHaveURL(/\/outreach$/)
  await expect(body).toHaveValue('My own words for Professor Marrow.')
  await expect(page.getByLabel('Availability')).toHaveValue('from June 2027 to August 2027')

  // Copy and download.
  await page.getByRole('button', { name: 'Copy email' }).click()
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible()
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toMatch(/^Subject: .+\n\nMy own words for Professor Marrow\.$/)

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download .txt' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('outreach-demo-hci-cmu-1.txt')
  const text = await readFile(await download.path(), 'utf-8')
  expect(text).toContain('My own words for Professor Marrow.')
  await expect(page.getByText('Review before sending. This app does not send emails.')).toBeVisible()
})

test('clipboard failure is reported honestly', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    })
  })
  await startDemoSearch(page)
  await openFirstMatchAndPrepare(page)
  await page.getByLabel('Use my education and interests only').check()
  await page.getByLabel('Use only the details I selected above.').check()
  await page.getByRole('button', { name: 'Generate draft' }).click()
  await page.getByRole('button', { name: 'Copy email' }).click()
  await expect(page.getByText(/Couldn’t copy automatically/)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Copied' })).toHaveCount(0)
  await expect(page.getByLabel('Body')).toBeFocused()
})

test('partial search failure shows a banner and retries only the failed school', async ({ page }) => {
  await setHooks(page, { stepMs: 250, failSchools: ['stanford'] })
  await startDemoSearch(page)
  await expect(page.getByText('Results from 2 of 3 universities. Stanford could not be searched.')).toBeVisible()
  await expect(page.locator('.match', { hasText: 'Stanford University' })).toHaveCount(0)

  await page.evaluate(() => {
    window.__researchmatchTestHooks = { stepMs: 250, failSchools: [] }
  })
  await page.getByRole('button', { name: 'Retry failed school' }).click()
  await expect(page.getByText(/Retrying Stanford University/)).toBeVisible()
  await expect(page.getByText(/could not be searched/)).toBeHidden({ timeout: 10_000 })
  await expect(page.locator('.match', { hasText: 'Stanford University' }).first()).toBeVisible()
})

test('draft generation failure keeps the form intact', async ({ page }) => {
  await setHooks(page, { stepMs: 250, failDraft: true })
  await startDemoSearch(page)
  await openFirstMatchAndPrepare(page)
  await page.getByLabel('What would you like to ask?').fill('Could I join next summer?')
  await page.getByLabel('Use my education and interests only').check()
  await page.getByLabel('Use only the details I selected above.').check()
  await page.getByRole('button', { name: 'Generate draft' }).click()
  await expect(page.getByText('The draft couldn’t be written.')).toBeVisible()
  await expect(page.getByLabel('What would you like to ask?')).toHaveValue('Could I join next summer?')
})

test('cancelling a search stops it and offers next steps', async ({ page }) => {
  await setHooks(page, { stepMs: 1500 })
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Try a sample profile' }).click()
  await page.getByRole('button', { name: /Robotics sample/ }).click()
  await page.getByLabel('I have reviewed my background and preferences.').check()
  await page.getByRole('button', { name: 'Find research matches' }).click()
  await page.getByRole('button', { name: 'Cancel search' }).click()
  await expect(page.getByRole('heading', { name: 'Search cancelled.' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Search again' })).toBeVisible()
})

test('profile edits after a search ask before clearing results', async ({ page }) => {
  await startDemoSearch(page)
  await page.getByRole('link', { name: 'Edit profile' }).click()
  await page.getByLabel('Major').fill('Cognitive Science')
  await expect(page.getByLabel('I have reviewed my background and preferences.')).not.toBeChecked()
  await expect(page.getByText(/You have unsaved changes/)).toBeVisible()
  await page.getByRole('button', { name: 'Discard changes' }).click()
  await expect(page.getByLabel('Major')).toHaveValue('Human-Computer Interaction')

  await page.getByLabel('Major').fill('Cognitive Science')
  await page.getByLabel('I have reviewed my background and preferences.').check()
  await page.getByRole('button', { name: 'Find research matches' }).click()
  await expect(page.getByRole('heading', { name: 'Replace your current results?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep current results' }).click()
  await expect(page).toHaveURL(/\/profile$/)
})

test('validation focuses the first invalid field and keeps input', async ({ page }) => {
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Try a sample profile' }).click()
  await page.getByRole('button', { name: /Machine learning sample/ }).click()
  await page.getByRole('button', { name: 'Remove Machine learning' }).click()
  await page.getByRole('button', { name: 'Remove Model evaluation' }).click()
  await page.getByLabel('I have reviewed my background and preferences.').check()
  await page.getByRole('button', { name: 'Find research matches' }).click()
  await expect(page.getByText('Add at least one research interest.')).toBeVisible()
  await expect(page.getByLabel('Research interests')).toBeFocused()
  await expect(page.getByLabel('Major')).toHaveValue('Computer Science')
})

test('locked routes redirect with an explanation, and refresh restores local work', async ({ page }) => {
  await page.goto('/outreach')
  await expect(page).toHaveURL(/\/profile$/)
  await expect(page.getByText('Confirm your profile and choose a match before preparing outreach.')).toBeVisible()

  await page.goto('/profile')
  await page.getByRole('button', { name: 'Try a sample profile' }).click()
  await page.getByRole('button', { name: /HCI sample/ }).click()
  await page.reload()
  await expect(page.getByText('Confirm your profile and choose a match before preparing outreach.')).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Your profile' })).toBeVisible()
  await expect(page.getByText('Demo · Sample data', { exact: true })).toBeVisible()
})
