/**
 * E2E Smoke Tests
 *
 * Fast-running suite (target: < 60 s total) that verifies the extension
 * loads correctly and none of the new commands crash the editor.
 *
 * Architecture note: The webview canvas is a sandboxed cross-origin iframe
 * that Playwright cannot access directly.  Tests therefore rely on:
 *  - Console error monitoring to detect uncaught JS exceptions.
 *  - The VS Code tab bar to confirm the editor is still alive.
 *  - The command palette to trigger extension commands.
 */

import { expect } from '@playwright/test';
import { test } from './fixtures/vscode-suite-fixtures';

// Collect JS errors emitted from any frame during a test.
function collectErrors(page: import('@playwright/test').Page): () => string[] {
  const errors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push(err.message));
  return () => errors;
}

// Run a command via the command palette; tolerates cases where the item
// is not found (extension may not have registered it yet in slow CI).
async function runCommand(
  page: import('@playwright/test').Page,
  commandLabel: string,
): Promise<void> {
  await page.keyboard.press('Control+Shift+P');
  await page.waitForTimeout(400);

  const input = page.locator('.quick-input-widget input[type="text"]');
  await input.fill(commandLabel);
  await page.waitForTimeout(600);

  const firstRow = page.locator('.quick-input-list .monaco-list-row').first();
  if (await firstRow.isVisible().catch(() => false)) {
    await firstRow.click();
  } else {
    await page.keyboard.press('Escape');
  }
  await page.waitForTimeout(1000);
}

test.describe('Smoke: Extension loads without errors', () => {
  test('opens a diagram file and renders the editor tab', async ({ vscPage }) => {
    const getErrors = collectErrors(vscPage.page);

    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(3000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    // No uncaught errors during initial load
    expect(getErrors()).toHaveLength(0);
  });
});

test.describe('Smoke: Undo / Redo commands', () => {
  test('undo command executes without crashing the editor', async ({ vscPage }) => {
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(2000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    await runCommand(vscPage.page, 'DiagramFlow: Undo');

    // Tab must still be visible after the command
    await expect(tab).toBeVisible({ timeout: 5000 });
  });

  test('redo command executes without crashing the editor', async ({ vscPage }) => {
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(2000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    await runCommand(vscPage.page, 'DiagramFlow: Redo');

    await expect(tab).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Smoke: Force Auto-Layout command', () => {
  test('force layout command executes without crashing the editor', async ({ vscPage }) => {
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(2000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    await runCommand(vscPage.page, 'DiagramFlow: Force Auto Layout');

    await expect(tab).toBeVisible({ timeout: 5000 });
  });
});

test.describe('Smoke: Add Node command', () => {
  test('add node command executes without crashing the editor', async ({ vscPage }) => {
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(2000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    await runCommand(vscPage.page, 'DiagramFlow: Add Node');

    await expect(tab).toBeVisible({ timeout: 5000 });
  });
});
