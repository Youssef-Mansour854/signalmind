import { test, expect } from '@playwright/test'

const targetUrl = process.env.ENVIRONMENT_URL ?? 'https://signalmind-three.vercel.app/'

test('SignalMind homepage loads and is performant', async ({ page }) => {
  const response = await page.goto(targetUrl, { waitUntil: 'networkidle' })

  // Verify successful HTTP response
  expect(response?.status()).toBeLessThan(400)

  // Verify the page title or a key visible element renders
  await expect(page).toHaveTitle(/.+/)

  // Performance: ensure the page loads within 5 seconds
  const timing = JSON.parse(
    await page.evaluate(() =>
      JSON.stringify(performance.getEntriesByType('navigation')[0])
    )
  )
  expect(timing.loadEventEnd).toBeLessThan(5000)
})
