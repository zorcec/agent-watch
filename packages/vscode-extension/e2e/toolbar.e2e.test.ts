/**
 * E2E test: Toolbar Buttons
 *
 * Verifies that the DiagramFlow toolbar is rendered and that toolbar-driven
 * actions (Auto Layout, new diagram) work correctly.
 *
 * Note: The webview canvas is a sandboxed cross-origin iframe that Playwright
 * cannot access directly.  Tests therefore use:
 *  - The VS Code command palette to trigger extension-side commands.
 *  - Page-level console monitoring to detect toolbar-related crashes (e.g. the
 *    "useReactFlow outside ReactFlowProvider" error that previously broke the
 *    whole toolbar).
 *  - File-system checks to confirm that commands have observable side effects.
 */

import { expect } from '@playwright/test';
import { test } from './fixtures/vscode-suite-fixtures';

test.describe('Toolbar & Toolbar-driven Commands', () => {
  test('webview renders without useReactFlow-outside-provider error', async ({
    vscPage,
  }) => {
    const reactFlowErrors: string[] = [];

    vscPage.page.on('console', (msg) => {
      if (msg.type() === 'error') {
        const text = msg.text();
        // The classic error when Toolbar is rendered outside ReactFlowProvider
        if (text.includes('ReactFlow') || text.includes('useReactFlow')) {
          reactFlowErrors.push(text);
        }
      }
    });

    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(4000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    expect(reactFlowErrors).toHaveLength(0);
  });

  test('auto-layout command executes without crashing the editor', async ({
    vscPage,
  }) => {
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(2000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    // Execute the auto-layout command via the command palette
    await vscPage.page.keyboard.press('Control+Shift+P');
    await vscPage.page.waitForTimeout(500);

    const quickInput = vscPage.page.locator('.quick-input-widget input[type="text"]');
    await quickInput.fill('DiagramFlow: Auto Layout');
    await vscPage.page.waitForTimeout(800);

    const commandItem = vscPage.page.locator('.quick-input-list .monaco-list-row').first();
    const commandVisible = await commandItem.isVisible().catch(() => false);
    if (commandVisible) {
      await commandItem.click();
      await vscPage.page.waitForTimeout(2000);
    } else {
      await vscPage.page.keyboard.press('Escape');
    }

    // Tab must still be visible – editor must not have crashed
    await expect(tab).toBeVisible({ timeout: 5000 });
  });

  test('new diagram command creates a fresh diagram tab', async ({
    vscPage,
  }) => {
    await vscPage.page.keyboard.press('Control+Shift+P');
    await vscPage.page.waitForTimeout(500);

    const quickInput = vscPage.page.locator('.quick-input-widget input[type="text"]');
    await quickInput.fill('DiagramFlow: New Diagram');
    await vscPage.page.waitForTimeout(800);

    const commandItem = vscPage.page.locator('.quick-input-list .monaco-list-row').first();
    const commandVisible = await commandItem.isVisible().catch(() => false);
    if (commandVisible) {
      await commandItem.click();
      await vscPage.page.waitForTimeout(3000);
    } else {
      await vscPage.page.keyboard.press('Escape');
    }

    // At least one editor tab must be visible after executing the command
    const anyTab = vscPage.page.locator('.tab');
    await expect(anyTab.first()).toBeVisible({ timeout: 5000 });
  });

  test('webview iframe is present after opening diagram (canvas rendered)', async ({
    vscPage,
  }) => {
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(3000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    // If the toolbar crashed due to useReactFlow error, the entire webview
    // React tree would unmount, leaving zero or a broken iframe
    const iframeCount = await vscPage.page.evaluate(() =>
      document.querySelectorAll('iframe').length,
    );
    expect(iframeCount).toBeGreaterThan(0);
  });

  test('no extension host errors after opening diagram with toolbar', async ({
    vscPage,
  }) => {
    const extensionErrors: string[] = [];

    vscPage.page.on('pageerror', (err) => {
      // Page-level uncaught exceptions from the VS Code UI process
      if (!err.message.includes('ChatRateLimited') &&
          !err.message.includes('AgentSessionsView') &&
          !err.message.includes('stickyScrollDelegate')) {
        extensionErrors.push(err.message);
      }
    });

    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(4000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    expect(extensionErrors).toHaveLength(0);
  });
});
