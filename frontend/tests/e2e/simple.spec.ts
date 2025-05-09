import { test, expect } from '@playwright/test';

test('page loads and displays welcome message', async ({ page }) => {
  // Visit the app
  await page.goto('/');
  
  // Take a screenshot to see what's actually rendered
  await page.screenshot({ path: 'screenshot.png' });
  
  // Wait for any content to be visible
  await page.waitForSelector('body', { state: 'visible' });
  
  // Log the page content for debugging
  const content = await page.content();
  console.log('Page content:', content);
  
  // Check if the page contains the welcome message text (using a more general approach)
  const pageText = await page.textContent('body');
  expect(pageText).toContain('Welcome to Chain of Experts');
});