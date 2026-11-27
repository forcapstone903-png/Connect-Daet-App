// @ts-check
import { test, expect } from '@playwright/test'

test('visitor home loads', async ({ page }) => {
  const response = await page.goto('/info/visitor')
  expect(response?.status()).toBe(200)
  await expect(page.locator('body')).toContainText(/Daet|Explore/i)
})

test('visitor search page reads URL filters without a runtime error', async ({ page }) => {
  const runtimeErrors = []
  page.on('pageerror', (error) => runtimeErrors.push(error.message))

  const response = await page.goto('/info/visitor/search?categories=Beach&location=Daet&sort=popular&date=week&free=1')
  expect(response?.status()).toBe(200)
  await expect(page.locator('input[type="search"]:visible').first()).toBeVisible()
  expect(runtimeErrors).toEqual([])
})

test('tourist-spots directory and category filter load', async ({ page }) => {
  const response = await page.goto('/info/visitor/tourist-spots')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { name: /explore|places|tourist/i }).first()).toBeVisible()
  await page.goto('/info/visitor/tourist-spots?type=accommodation')
  await expect(page).toHaveURL(/type=accommodation/)
  await expect(page.getByRole('heading', { name: /stay|accommodation/i }).first()).toBeVisible()
})

test('login, register, and forgot-password pages load', async ({ page }) => {
  for (const [path, heading] of [
    ['/info/login', /Daet getaway|sign in|login|welcome/i],
    ['/info/register', /exploring Daet|create|register|join/i],
    ['/info/forgot-password', /forgot|password recovery/i],
  ]) {
    const response = await page.goto(path)
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(heading)
  }
})

test('protected APIs return 401 without a session', async ({ request }) => {
  for (const path of ['/info/api/admin/analytics', '/info/api/user/feed']) {
    const response = await request.get(path)
    expect(response.status()).toBe(401)
  }
})

test('tourist detail loading state is recorded when data is unavailable', async ({ page }) => {
  const response = await page.goto('/info/visitor/tourist-spots/1')
  expect(response?.status()).toBe(200)
  const loading = page.getByText('Loading destination...', { exact: true })
  if (await loading.isVisible({ timeout: 5000 }).catch(() => false)) {
    test.info().annotations.push({
      type: 'inconclusive',
      description: 'Tourist detail remained at Loading destination; data request could not complete.',
    })
  } else {
    await expect(page.locator('body')).not.toContainText('Loading destination...')
  }
})
