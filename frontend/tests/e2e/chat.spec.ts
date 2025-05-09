import { test, expect } from '@playwright/test';

// Setup for each test
test.beforeEach(async ({ page }) => {
  // Visit the app before each test
  await page.goto('/');
});

test('displays the welcome message', async ({ page }) => {
  // Check if the welcome message is displayed
  await expect(page.getByText('Welcome to Chain of Experts! How can I help you today?')).toBeVisible();
});

test('allows sending a message and verifies successful response', async ({ page }) => {
  // Find the input field
  const inputField = page.locator('.message-input-container input');
  await inputField.waitFor({ state: 'visible' });
  
  // Type a message in the input field
  await inputField.fill('Hello, can you help me with a question?');
  
  // Find and click the send button
  const sendButton = page.locator('.send-button');
  await sendButton.waitFor({ state: 'visible' });
  await sendButton.click();
  
  // Check if the user message is displayed - use exact: true to avoid ambiguity
  await expect(page.getByText('Hello, can you help me with a question?', { exact: true })).toBeVisible();
  
  // Wait for a new message to appear after sending
  await page.waitForFunction(() => {
    // Get all messages
    const messages = document.querySelectorAll('.message');
    // We need at least 2 messages (welcome + response)
    return messages.length >= 2;
  }, { timeout: 5000 });
  
  // Get all messages after sending
  const messages = await page.locator('.message').all();
  console.log(`Found ${messages.length} messages`);
  
  // Get the last message (the response)
  const lastMessage = messages[messages.length - 1];
  const messageType = await lastMessage.getAttribute('class');
  
  console.log('Message type:', messageType);
  
  // This test should verify we got a valid response
  // The application is displaying the response as an assistant message
  expect(messageType).toContain('assistant-message');
  
  // Wait for the response to be processed and displayed
  await page.waitForTimeout(1000);
  
  // Check that there's no error message
  const errorText = await page.locator('.error-message').count();
  expect(errorText).toBe(0);
});

test('verifies backend response for error handling test', async ({ page }) => {
  // Find the input field
  const inputField = page.locator('.message-input-container input');
  await inputField.waitFor({ state: 'visible' });
  
  // Type a message that will trigger backend processing
  await inputField.fill('Test backend error handling');
  
  // Find and click the send button
  const sendButton = page.locator('.send-button');
  await sendButton.waitFor({ state: 'visible' });
  await sendButton.click();
  
  // Wait for a new message to appear after sending
  // This could be either an assistant message (success) or a system message (error)
  await page.waitForFunction(() => {
    // Get all messages
    const messages = document.querySelectorAll('.message');
    // We need at least 2 messages (welcome + response)
    return messages.length >= 2;
  }, { timeout: 5000 });
  
  // Get all messages after sending
  const messages = await page.locator('.message').all();
  console.log(`Found ${messages.length} messages`);
  
  // Get the last message (the response)
  const lastMessage = messages[messages.length - 1];
  const messageType = await lastMessage.getAttribute('class');
  
  console.log('Message type:', messageType);
  
  // Now that the backend is working, we expect a successful response
  // not an error message
  expect(messageType).toContain('assistant-message');
  
  // Wait for the response to be processed and displayed
  await page.waitForTimeout(1000);
  
  // Check that there's no error message
  const errorText = await page.locator('.error-message').count();
  expect(errorText).toBe(0);
});

// Test for UI functionality that doesn't depend on backend
test('toggles the sidebar when clicking the back button', async ({ page }) => {
  // Wait for the sidebar to be visible
  await page.locator('.sidebar').waitFor({ state: 'visible' });
  
  // Find and click the sidebar toggle button
  const toggleButton = page.locator('.toggle-sidebar-btn');
  await toggleButton.waitFor({ state: 'visible' });
  await toggleButton.click();
  
  // Check if the sidebar is hidden
  await expect(page.locator('.sidebar')).not.toBeVisible();
  
  // Click the toggle button again
  await toggleButton.click();
  
  // Check if the sidebar is visible again
  await expect(page.locator('.sidebar')).toBeVisible();
});