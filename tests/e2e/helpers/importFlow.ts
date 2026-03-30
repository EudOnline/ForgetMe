import { expect, type Page } from '@playwright/test'

export async function importFixturesThroughPreflight(page: Page, fixtureFileNames: string | string[]) {
  const fixtureNames = Array.isArray(fixtureFileNames) ? fixtureFileNames : [fixtureFileNames]

  await page.getByRole('button', { name: 'Choose Files' }).click()

  for (const fixtureName of fixtureNames) {
    await expect(page.getByText(fixtureName)).toBeVisible({ timeout: 15_000 })
  }

  await expect(page.getByRole('button', { name: 'Import Supported Files' })).toBeVisible({ timeout: 15_000 })
  await page.getByRole('button', { name: 'Import Supported Files' }).click()
  await expect(page.getByRole('button', { name: 'View Batch Detail' })).toBeVisible({ timeout: 15_000 })
}
