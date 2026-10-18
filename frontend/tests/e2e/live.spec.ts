import { expect, test } from '@playwright/test'

const RESUME =
  'Computer Science junior at Stub University. Research assistant in a campus HCI lab running interview studies. ' +
  'Course project: an accessible note-taking app for screen-reader users. Skills: Python, user research.'

test.describe('Live mode without configuration', () => {
  test('shows an honest message and never shows sample data', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByText('Live search is not configured. Try the sample workflow.')).toBeVisible()
    await expect(page.getByText('Live', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Review extracted profile' })).toBeDisabled()
    await expect(page.getByText('Reading a resume needs live search.')).toBeVisible()
    await expect(page.getByText('Sample', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('heading', { name: 'Your profile' })).toHaveCount(0)
  })
})

/**
 * These run against the real backend and the real OpenAI SDK, but the SDK points at a
 * local stub (see backend/tests/stub_openai_server.py). They verify wiring, not model quality.
 */
test.describe('Live mode against the local OpenAI stub', () => {
  test.use({ baseURL: 'http://localhost:5174' })

  test('paste text → extract → confirm → search → review → draft', async ({ page }) => {
    await page.goto('/profile')
    await expect(page.getByText('Live search is not configured.')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Paste text' }).click()
    await page.getByPlaceholder('Paste your resume or a short summary of your background.').fill(RESUME)
    await page.getByRole('button', { name: 'Review extracted profile' }).click()

    await expect(page.getByRole('heading', { name: 'Your profile' })).toBeFocused()
    await expect(page.getByLabel('School')).toHaveValue('Stub University')
    await expect(page.getByLabel('Name')).toHaveValue('')

    await page.getByLabel('Research interests').fill('Human-computer interaction')
    await page.getByLabel('Research interests').press('Enter')
    await page.getByLabel('I have reviewed my background and preferences.').check()
    await page.getByRole('button', { name: 'Find research matches' }).click()

    // The resume had no name, so confirming is blocked until one is entered.
    await expect(page.getByText('Add your name.')).toBeVisible()
    await expect(page.getByLabel('Name')).toBeFocused()
    await page.getByLabel('Name').fill('Riley Stub')
    await page.getByLabel('I have reviewed my background and preferences.').check()
    await page.getByRole('button', { name: 'Find research matches' }).click()

    await expect(page.getByRole('heading', { level: 1, name: 'Research matches' })).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('heading', { name: '1 match' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Stub Professor Avery Lin' })).toBeVisible()
    await expect(page.getByText('Sample', { exact: true })).toHaveCount(0)

    const link = page.getByRole('link', { name: /Stub Professor Avery Lin — faculty page/ }).first()
    await expect(link).toHaveAttribute('href', 'https://www.cs.cmu.edu/~stub-lin')
    await expect(link).toHaveAttribute('target', '_blank')
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    await expect(page.getByText(/example\.com/)).toHaveCount(0)
    await expect(page.locator('.badge').first()).toHaveText('Recruiting stated')

    await page.getByRole('button', { name: 'Review match' }).click()
    const drawer = page.getByRole('dialog')
    await drawer.getByLabel('I reviewed the match and understand that availability may be unconfirmed.').check()
    await drawer.getByRole('button', { name: 'Prepare outreach' }).click()

    await page.getByLabel('Research assistant, campus HCI lab').check()
    await page.getByLabel('Use only the details I selected above.').check()
    await page.getByRole('button', { name: 'Generate draft' }).click()
    await expect(page.getByLabel('Body')).toHaveValue(/Stub draft for automated tests/)
    await expect(page.getByText('Sample draft')).toHaveCount(0)
  })

  test('a school that fails is reported as a partial result', async ({ page }) => {
    await page.goto('/profile')
    await page.getByRole('tab', { name: 'Paste text' }).click()
    await page.getByPlaceholder('Paste your resume or a short summary of your background.').fill(RESUME)
    await page.getByRole('button', { name: 'Review extracted profile' }).click()
    await page.getByLabel('Name').fill('Riley Stub')
    await page.getByLabel('Research interests').fill('Machine learning')
    await page.getByLabel('Research interests').press('Enter')
    await page.getByLabel(/Stanford University/).check()
    await page.getByLabel('I have reviewed my background and preferences.').check()
    await page.getByRole('button', { name: 'Find research matches' }).click()

    await expect(page.getByText('Results from 1 of 2 universities. Stanford could not be searched.')).toBeVisible({
      timeout: 20_000,
    })
    await expect(page.getByRole('button', { name: 'Retry failed school' })).toBeVisible()
    await expect(page.locator('.match')).toHaveCount(1)
  })
})
