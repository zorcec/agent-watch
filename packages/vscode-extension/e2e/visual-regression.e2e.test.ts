/**
 * E2E test: Visual Regression
 *
 * Screenshot-based tests for the React Flow webview. Takes screenshots of
 * various diagram states and compares them against baseline images.
 * These tests verify that diagrams render without visual defects.
 */

import { expect } from '@playwright/test';
import { test } from './fixtures/vscode-suite-fixtures';

test.describe('Visual Regression', () => {
  test('simple diagram renders without errors', async ({ vscPage }) => {
    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(5000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'simple.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    const editorArea = vscPage.page.locator('.editor-group-container');
    await expect(editorArea).toHaveScreenshot('simple-diagram.png', {
      maxDiffPixels: 1000,
      mask: [vscPage.page.locator('.react-flow__minimap')],
    });
  });

  test('empty diagram shows clean canvas', async ({ vscPage }) => {
    await vscPage.openFile('empty.diagram');
    await vscPage.page.waitForTimeout(4000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'empty.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    const editorArea = vscPage.page.locator('.editor-group-container');
    await expect(editorArea).toHaveScreenshot('empty-diagram.png', {
      maxDiffPixels: 300,
    });
  });

  test('complex diagram with multiple shapes renders', async ({ vscPage }) => {
    await vscPage.openFile('complex.diagram');
    await vscPage.page.waitForTimeout(5000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'complex.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    const editorArea = vscPage.page.locator('.editor-group-container');
    await expect(editorArea).toHaveScreenshot('complex-diagram.png', {
      maxDiffPixels: 800,
      mask: [vscPage.page.locator('.react-flow__minimap')],
    });
  });
});
