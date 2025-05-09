import { test, expect } from '@playwright/test';

// Mock data for testing
const mockChainResult = {
  summary: "This is a test summary of the chain results",
  intermediateResults: [
    {
      expertName: "data-retrieval",
      expertType: "Retrieval",
      expertIndex: 0,
      input: { query: "test query" },
      output: { documents: ["doc1", "doc2"] },
      timestamp: new Date().toISOString(),
      durationMs: 150
    },
    {
      expertName: "llm-summarization",
      expertType: "Summarization",
      expertIndex: 1,
      input: { documents: ["doc1", "doc2"] },
      output: { summary: "This is a test summary" },
      timestamp: new Date().toISOString(),
      durationMs: 250
    }
  ],
  tokenUsage: {
    total: 1500,
    prompt: 1000,
    completion: 500,
    provider: "OpenAI",
    model: "gpt-4"
  },
  traceId: "test-trace-id-123",
  durationMs: 400,
  success: true
};

// Setup for each test
test.beforeEach(async ({ page }) => {
  // Visit the app before each test
  await page.goto('/');
  
  // Inject the mock data into the page
  await page.evaluate((mockData) => {
    // Store the mock data in localStorage for the test
    localStorage.setItem('mockChainResult', JSON.stringify(mockData));
    
    // Create a function to simulate sending a message that will use our mock data
    // @ts-expect-error - Adding custom function to window for testing
    window.testWithMockData = (mockData) => {
      // Get all the existing messages
      const messagesContainer = document.querySelector('.messages-container');
      if (!messagesContainer) return;

      const message = {
        id: Date.now().toString(),
        content: 'Chain of Experts Result',
        role: 'assistant',
        timestamp: new Date().toISOString(),
        resultData: mockData
      };

      // Add the message to the messages container
      const messageDiv = document.createElement('div');
      messageDiv.className = 'message assistant-message';
      messageDiv.innerHTML = `<div class="message-content">Chain of Experts Result</div><div class="message-timestamp">${new Date().toLocaleTimeString()}</div>`;
      messagesContainer.appendChild(messageDiv);

      // Dispatch a custom event to add the message to the chat
      window.dispatchEvent(new CustomEvent('add-message', { detail: message }));
    };
  }, mockChainResult);
  
  // Trigger the test function to add the mock message
  await page.evaluate((mockData) => {
    // @ts-expect-error - Calling custom function added to window
    window.testWithMockData(mockData);
  }, mockChainResult);
  
  // Wait for App.tsx to process the event and render ChainResultsViewer
  try {
    await page.waitForSelector('.chain-results-viewer', { state: 'visible', timeout: 10000 });
    console.log('ChainResultsViewer found and visible after event dispatch.');
  } catch (e) {
    console.error('ChainResultsViewer did not become visible after event dispatch.', e);
    // You might want to take a screenshot here for debugging
    // await page.screenshot({ path: `debug_screenshot_beforeEach_error.png` });
    throw e; // re-throw to fail beforeEach if necessary
  }
});

test('displays the ChainResultsViewer component with tabs', async ({ page }) => {
  // Check if the ChainResultsViewer component is rendered
  const chainResultsViewer = page.locator('.chain-results-viewer');
  await expect(chainResultsViewer).toBeVisible({ timeout: 10000 });
  
  // Check if the tabs are displayed
  const summaryTab = page.locator('.tab-button', { hasText: 'Summary' });
  await expect(summaryTab).toBeVisible({ timeout: 10000 });
  const detailsTab = page.locator('.tab-button', { hasText: 'Expert Details' });
  await expect(detailsTab).toBeVisible({ timeout: 10000 });
  const rawTab = page.locator('.tab-button', { hasText: 'Raw JSON' });
  await expect(rawTab).toBeVisible({ timeout: 10000 });
  
  // Check if the Summary tab is active by default
  await expect(summaryTab).toHaveClass(/active/, { timeout: 10000 });
});

test('displays the summary content correctly', async ({ page }) => {
  // Check if the summary content is displayed
  const summaryContent = page.locator('.summary-content');
  await expect(summaryContent).toBeVisible({ timeout: 10000 });
  
  // Check if the summary text is displayed
  await expect(page.locator('.summary-content')).toContainText('This is a test summary', { timeout: 10000 });
  
  // Check if metadata is displayed within the summary panel, specifically the one from SummarySection
  const summaryMetadataLocator = page.locator('#panel-summary .summary-tab > .result-metadata');
  await expect(summaryMetadataLocator).toBeVisible({ timeout: 10000 });
  await expect(summaryMetadataLocator).toContainText('Processing Time', { timeout: 10000 });
  await expect(summaryMetadataLocator).toContainText('Trace ID', { timeout: 10000 });
  await expect(summaryMetadataLocator).toContainText('Token Usage', { timeout: 10000 });
});

test('displays the chain flow diagram', async ({ page }) => {
  // Check if the chain flow diagram is displayed
  const chainFlowDiagram = page.locator('.chain-flow-diagram-container');
  await expect(chainFlowDiagram).toBeVisible({ timeout: 10000 });
  
  // Check if expert nodes are displayed within the ChainResultsViewer
  const chainResultsViewerElement = page.locator('.chain-results-viewer');
  const expertNodes = chainResultsViewerElement.locator('.expert-node');
  await expect(expertNodes).toHaveCount(2, { timeout: 10000 });
  
  // Check if the expert names are displayed
  await expect(expertNodes.nth(0)).toContainText('data-retrieval', { timeout: 10000 });
  await expect(expertNodes.nth(1)).toContainText('llm-summarization', { timeout: 10000 });
  
  // Check if the arrow connector is displayed within the ChainResultsViewer
  const arrow = chainResultsViewerElement.locator('.arrow');
  await expect(arrow).toBeVisible({ timeout: 10000 });
});

test('switches to Expert Details tab and displays expert contributions', async ({ page }) => {
  // Click on the Expert Details tab
  await page.locator('.tab-button', { hasText: 'Expert Details' }).click({ timeout: 10000 });
  
  // Check if the Expert Details tab is active
  await expect(page.locator('.tab-button', { hasText: 'Expert Details' })).toHaveClass(/active/, { timeout: 10000 });
  
  // Check if expert contributions are displayed
  const expertContributions = page.locator('.expert-contributions');
  await expect(expertContributions).toBeVisible({ timeout: 10000 });
  
  // Check if expert cards are displayed
  const expertCards = page.locator('.expert-contribution-card');
  await expect(expertCards).toHaveCount(2, { timeout: 10000 });
  
  // Check if the expert names are displayed
  await expect(expertCards.nth(0)).toContainText('data-retrieval', { timeout: 10000 });
  await expect(expertCards.nth(1)).toContainText('llm-summarization', { timeout: 10000 });
  
  // Check if token usage is displayed
  const tokenUsage = page.locator('.token-usage-details');
  await expect(tokenUsage).toBeVisible({ timeout: 10000 });
  await expect(tokenUsage).toContainText('Token Usage', { timeout: 10000 });
  await expect(tokenUsage).toContainText('Total', { timeout: 10000 });
  await expect(tokenUsage).toContainText('1500', { timeout: 10000 });
});

test('expands expert details when clicking on an expert card', async ({ page }) => {
  const chainResultsViewerElement = page.locator('.chain-results-viewer');

  // Click on the Expert Details tab
  await chainResultsViewerElement.locator('.tab-button', { hasText: 'Expert Details' }).click({ timeout: 10000 });
  
  // Ensure the expert contributions section is visible after tab switch
  await expect(chainResultsViewerElement.locator('.expert-contributions')).toBeVisible({ timeout: 10000 });

  // Click on the first expert card's header within the viewer
  const firstExpertHeader = chainResultsViewerElement.locator('.expert-header').first();
  
  // Make sure the header is visible before clicking
  await expect(firstExpertHeader).toBeVisible({ timeout: 10000 });
  await firstExpertHeader.click({ timeout: 10000 });
  
  // Wait a moment for the expansion animation to complete
  await page.waitForTimeout(1000);
  
  // Check if the expert details are expanded within the viewer
  // We target the details section associated with the first expert card.
  const firstExpertCard = chainResultsViewerElement.locator('.expert-contribution-card').first();
  const expertDetails = firstExpertCard.locator('.expert-details');
  
  // Check if the expert details element has the 'collapsed' class removed
  const hasCollapsedClass = await expertDetails.evaluate(el => el.classList.contains('collapsed'));
  expect(hasCollapsedClass).toBe(false);
  
  // Check for the presence of io-panels
  const ioPanels = firstExpertCard.locator('.io-panel');
  
  // First check the count
  await expect(ioPanels).toHaveCount(2, { timeout: 10000 });
  
  // Then check individual panels
  const inputPanel = firstExpertCard.locator('.io-panel >> nth=0');
  await expect(inputPanel).toBeVisible({ timeout: 10000 });
  
  // Check if input and output content is displayed
  await expect(ioPanels.nth(0)).toContainText('Input', { timeout: 10000 });
  await expect(ioPanels.nth(0)).toContainText('test query', { timeout: 10000 });
  await expect(ioPanels.nth(1)).toContainText('Output', { timeout: 10000 });
  await expect(ioPanels.nth(1)).toContainText('doc1', { timeout: 10000 });
  
  // Click on the expert card again to collapse it
  await firstExpertHeader.click({ timeout: 10000 }); // Clicking the same header again
  
  // Wait for the collapse animation
  await page.waitForTimeout(1000);
  
  // Check if the expert details element has the 'collapsed' class added back
  const hasCollapsedClassAfter = await expertDetails.evaluate(el => el.classList.contains('collapsed'));
  expect(hasCollapsedClassAfter).toBe(true);
  
  // Verify the io-panels are no longer visible
  await expect(inputPanel).not.toBeVisible({ timeout: 10000 });
});

test('switches to Raw JSON tab and displays raw data', async ({ page }) => {
  // Click on the Raw JSON tab
  await page.locator('.tab-button', { hasText: 'Raw JSON' }).click({ timeout: 10000 });
  
  // Check if the Raw JSON tab is active
  await expect(page.locator('.tab-button', { hasText: 'Raw JSON' })).toHaveClass(/active/, { timeout: 10000 });
  
  // Check if raw JSON is displayed
  const rawJson = page.locator('.raw-json');
  await expect(rawJson).toBeVisible({ timeout: 10000 });
  
  // Check if the copy button is displayed
  const copyButton = page.locator('.copy-button');
  await expect(copyButton).toBeVisible({ timeout: 10000 });
  await expect(copyButton).toContainText('Copy JSON to Clipboard', { timeout: 10000 });
});

test('clicking on expert in flow diagram switches to details tab', async ({ page }) => {
  const chainResultsViewerElement = page.locator('.chain-results-viewer');

  // Click on an expert node in the flow diagram (within the results viewer)
  const firstExpertNodeInViewer = chainResultsViewerElement.locator('.expert-node').first();
  await firstExpertNodeInViewer.click({ timeout: 10000 });
  
  // Check if the Expert Details tab is active (within the results viewer)
  const detailsTabInViewer = chainResultsViewerElement.locator('.tab-button', { hasText: 'Expert Details' });
  await expect(detailsTabInViewer).toHaveClass(/active/, { timeout: 10000 });
  
  // Check if expert contributions are displayed (within the results viewer)
  const expertContributionsInViewer = chainResultsViewerElement.locator('.expert-contributions');
  await expect(expertContributionsInViewer).toBeVisible({ timeout: 10000 });
});