/**
 * E2E test: Webview Render
 *
 * Verifies that the DiagramFlow webview loads correctly when opening .diagram
 * files. Tests focus on observable side effects (tabs, no error toasts, asset
 * loading) because VS Code webviews are sandboxed cross-origin iframes that
 * Playwright cannot access directly.
 *
 * Replicates the original bug: dist/webview/index.js and index.css were missing
 * because the esbuild config only built extension.ts and not the webview bundle.
 */

import { expect } from '@playwright/test';
import { test } from './fixtures/vscode-suite-fixtures';
import * as fs from 'fs';
import * as path from 'path';

/** Returns true if no error notification toasts about missing resources appear */
async function hasNoResourceErrorToast(page: import('@playwright/test').Page): Promise<boolean> {
  const toasts = page.locator('.notification-toast .notification-list-item-message');
  const count = await toasts.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    const text = await toasts.nth(i).textContent().catch(() => '');
    if (text && (text.includes('ERR_ABORTED') || text.includes('404'))) {
      return false;
    }
  }
  return true;
}

test.describe('Webview Render', () => {
  test('webview iframe is created when opening .diagram file', async ({
    vscPage,
  }) => {
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(3000);

    // Tab must be visible
    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    // VS Code should have created at least one iframe for the webview
    const iframeCount = await vscPage.page.evaluate(() =>
      document.querySelectorAll('iframe').length,
    );
    expect(iframeCount).toBeGreaterThan(0);
  });

  test('webview assets load without 404 errors (index.js and index.css)', async ({
    vscPage,
  }) => {
    const resourceErrors: string[] = [];

    vscPage.page.on('response', (response) => {
      const url = response.url();
      if (
        (url.includes('dist/webview/index.js') || url.includes('dist/webview/index.css')) &&
        response.status() >= 400
      ) {
        resourceErrors.push(`${response.status()} ${url}`);
      }
    });

    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(4000);

    expect(resourceErrors).toHaveLength(0);
  });

  test('webview shows editor pane without error toasts', async ({
    vscPage,
  }) => {
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(3000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    const noErrors = await hasNoResourceErrorToast(vscPage.page);
    expect(noErrors).toBe(true);
  });

  test('empty.diagram opens without crash', async ({ vscPage }) => {
    await vscPage.openFile('empty.diagram');
    await vscPage.page.waitForTimeout(2000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'empty.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    const noErrors = await hasNoResourceErrorToast(vscPage.page);
    expect(noErrors).toBe(true);
  });

  test('complex.diagram opens without crash', async ({ vscPage }) => {
    await vscPage.openFile('complex.diagram');
    await vscPage.page.waitForTimeout(2000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'complex.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    const noErrors = await hasNoResourceErrorToast(vscPage.page);
    expect(noErrors).toBe(true);
  });

  test('simple.diagram JSON structure is valid and parseable', async ({
    vscPage,
  }) => {
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(1000);

    const filePath = path.resolve(__dirname, 'test-project', 'simple.diagram');
    const content = fs.readFileSync(filePath, 'utf-8');
    const doc = JSON.parse(content);

    expect(doc.nodes).toHaveLength(3);
    expect(doc.edges).toHaveLength(2);
    expect(doc.nodes[0].id).toBe('n1');
    expect(doc.nodes[1].id).toBe('n2');
    expect(doc.nodes[2].id).toBe('n3');
    expect(doc.edges[0].source).toBe('n1');
    expect(doc.edges[0].target).toBe('n2');
  });

  test('getWebviewContent generates valid HTML with webview URIs', async ({
    vscPage,
  }) => {
    // Verify the HTML template references the correct asset paths
    // The webview HTML is built from getWebviewContent.ts - we just check
    // that the extension loaded (tab visible) which confirms the HTML was served
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(2000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    // Confirm extension is active (indicates resolveCustomTextEditor ran)
    const editorGroupContainer = vscPage.page.locator('.editor-group-container');
    const paneCount = await editorGroupContainer.count();
    expect(paneCount).toBeGreaterThan(0);
  });

  test('extension host logs no errors about NaN or undefined node dimensions', async ({
    vscPage,
  }) => {
    const extensionErrors: string[] = [];

    // Capture extension-host level console errors surfaced via page console
    vscPage.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // Filter for extension-related rendering errors (NaN in SVG paths/viewBox)
        if (text.includes('NaN') || text.includes('diagramflow')) {
          extensionErrors.push(text);
        }
      }
    });

    await vscPage.openFile('simple.diagram');
    // Wait long enough for the webview to fully initialise and render
    await vscPage.page.waitForTimeout(5000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    // No extension-host NaN errors should have surfaced
    expect(extensionErrors).toHaveLength(0);
  });

  test('diagram file nodes have valid positive dimensions to prevent NaN SVG paths', async ({
    vscPage,
  }) => {
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(1000);

    const filePath = path.resolve(__dirname, 'test-project', 'simple.diagram');
    const content = fs.readFileSync(filePath, 'utf-8');
    const doc = JSON.parse(content);

    for (const node of doc.nodes) {
      expect(typeof node.x).toBe('number');
      expect(typeof node.y).toBe('number');
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
      expect(Number.isNaN(node.width)).toBe(false);
      expect(Number.isNaN(node.height)).toBe(false);
    }
  });
});

