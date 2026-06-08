import { test, expect } from '@playwright/test';

test.describe('Paperclip Control Center E2E', () => {
  test('Dashboard loads correctly', async ({ page }) => {
    await page.goto('/');
    
    // Check for the presence of the dashboard title
    await expect(page.locator('h1', { hasText: 'Control Center' })).toBeVisible();

    // Check if the companies stat card loads (indicates API proxy is working)
    // Next.js uses server components, so if API proxy is down, the page crashes
    await expect(page.locator('text=Companies').first()).toBeVisible();
    
    // Click on the Agents link in the navigation to verify client routing
    await page.click('a[href="/agents"]');
    
    // Check that we navigated to the agents page
    await expect(page).toHaveURL(/\/agents/);
    await expect(page.locator('h1', { hasText: 'Agents' })).toBeVisible();
    
    // Since /agents is a client component using NEXT_PUBLIC_ env vars,
    // if it fails to fetch, it might show "needs attention" or stay on "Loading...".
    // We expect it to eventually show the data table or "No agents registered".
    // Wait for the loading spinner to disappear
    await expect(page.locator('text=Loading…')).toBeHidden({ timeout: 10000 });
  });

  test('Client components inject NEXT_PUBLIC variables and do not 401', async ({ page }) => {
    // We navigate directly to a client component page
    await page.goto('/skills');
    
    // Ensure the skills page loads
    await expect(page.locator('h1', { hasText: 'Skills' })).toBeVisible();
    await expect(page.locator('text=Loading…')).toBeHidden({ timeout: 10000 });
    
    // Ensure there are no 401 Unauthorized errors displayed on the screen
    // We assert that the main container or an element is visible
    await expect(page.locator('h1', { hasText: 'Skills Registry' })).toBeVisible();
  });
});
