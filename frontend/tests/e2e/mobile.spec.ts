import { expect, test } from '@playwright/test'
import { openFirstMatchAndPrepare, setHooks, startDemoSearch } from './helpers'

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true })

async function expectNoHorizontalScroll(page: import('@playwright/test').Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
}

test('mobile upload input validates files and offers paste instead', async ({ page }) => {
  // Uploading is only enabled when Live is configured, so use the stub-backed stack.
  await page.goto('http://localhost:5174/profile')
  const input = page.getByTestId('resume-file-input')
  await input.setInputFiles({ name: 'resume.docx', mimeType: 'application/msword', buffer: Buffer.from('not a pdf') })
  await expect(page.getByText('Choose a PDF file. Other file types can’t be read.')).toBeVisible()
  await page.getByRole('button', { name: 'Paste text instead' }).click()
  await expect(page.getByRole('tab', { name: 'Paste text' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByPlaceholder('Paste your resume or a short summary of your background.')).toBeVisible()

  await page.getByRole('tab', { name: 'Upload PDF' }).click()
  const longName = 'a-very-long-resume-file-name-that-should-wrap-instead-of-overflowing-the-screen.pdf'
  await input.setInputFiles({ name: longName, mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 sample') })
  await expect(page.getByText(longName)).toBeVisible()
  await expectNoHorizontalScroll(page)
  await page.getByRole('button', { name: `Remove ${longName}` }).click()
  await expect(page.getByRole('button', { name: 'Choose PDF' })).toBeVisible()
})

test('mobile drawer is full screen with a reachable close button, and the email is editable', async ({ page }) => {
  await setHooks(page, { stepMs: 200 })
  await startDemoSearch(page, /Robotics sample/)
  await expectNoHorizontalScroll(page)

  await expect(page.locator('#filters-panel')).toBeHidden()
  await page.getByRole('button', { name: /^Filters/ }).click()
  await expect(page.getByLabel('Recruitment status')).toBeVisible()

  await page.getByRole('button', { name: 'Review match' }).first().click()
  const drawer = page.getByRole('dialog')
  const box = await drawer.boundingBox()
  expect(box?.width).toBe(390)
  const close = drawer.getByRole('button', { name: 'Close review' })
  const closeBox = await close.boundingBox()
  expect(closeBox!.y).toBeGreaterThanOrEqual(0)
  expect(closeBox!.height).toBeGreaterThanOrEqual(44)
  await drawer.locator('.drawer__content').evaluate((el) => el.scrollTo(0, el.scrollHeight))
  await expect(close).toBeInViewport()
  await close.click()
  await expect(drawer).toBeHidden()

  await openFirstMatchAndPrepare(page)
  await page.getByLabel('Robotics team, perception lead').check()
  await expect(page.getByLabel('Signature name')).toHaveValue('Casey Sample')
  await page.getByLabel('Signature name').fill('')
  await page.getByLabel('Use only the details I selected above.').check()
  await page.getByRole('button', { name: 'Generate draft' }).click()
  const body = page.getByLabel('Body')
  await expect(body).toHaveValue(/\[Your name\]/)
  await body.fill(`${await body.inputValue()}\nExtra line from my phone.`)
  await expect(page.getByText(/Edited by you/)).toBeVisible()
  await expectNoHorizontalScroll(page)
})
