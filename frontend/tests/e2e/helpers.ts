import { expect, type Page } from '@playwright/test'
import type { DemoTestHooks } from '../../src/services/demo'

export async function setHooks(page: Page, hooks: DemoTestHooks) {
  await page.addInitScript((value) => {
    window.__researchmatchTestHooks = value
  }, hooks)
}

/** Loads a sample profile and runs the sample search through to results. */
export async function startDemoSearch(page: Page, preset = /HCI sample/) {
  await page.goto('/profile')
  await page.getByRole('button', { name: 'Try a sample profile' }).click()
  await page.getByRole('button', { name: preset }).click()
  await expect(page.getByText('Demo · Sample data')).toBeVisible()
  await page.getByLabel('I have reviewed my background and preferences.').check()
  await page.getByRole('button', { name: 'Find research matches' }).click()
  await expect(page).toHaveURL(/\/matches$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Research matches' })).toBeVisible({ timeout: 10_000 })
}

export async function openFirstMatchAndPrepare(page: Page) {
  await page.getByRole('button', { name: 'Review match' }).first().click()
  const drawer = await page.getByRole('dialog').isVisible() ? page.getByRole('dialog') : page.getByRole('region', { name: 'Review match' })
  await drawer.getByRole('button', { name: 'Prepare outreach' }).click()
  await drawer.getByLabel('I reviewed the match and understand that availability may be unconfirmed.').check()
  await drawer.getByRole('button', { name: 'Continue to draft' }).click()
  await expect(page).toHaveURL(/\/outreach$/)
}
