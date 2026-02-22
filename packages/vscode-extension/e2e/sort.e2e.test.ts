/**
 * E2E test: Sort Nodes
 *
 * Verifies that the sort functionality works end-to-end:
 * - The sort command updates node positions in the diagram file
 * - meta.layoutDirection is persisted after sort
 * - The toolbar direction button (btn-layout-direction) no longer exists
 *
 * Strategy: Trigger the `diagramflow.sortNodes` command via the command palette,
 * then read the diagram file from disk to verify changes were persisted.
 *
 * Uses backupAndRestore (same pattern as reposition.e2e.test.ts) rather than
 * writing the file before opening, which avoids triggering VS Code's external-
 * file-change detection and keeps the editor in a stable state.
 */

import { expect } from '@playwright/test';
import { test } from './fixtures/vscode-suite-fixtures';
import * as fs from 'fs';
import * as path from 'path';

const SORT_TEST_FILE = path.resolve(__dirname, 'test-project', 'sort-test.diagram');

function readDiagram(): any {
  return JSON.parse(fs.readFileSync(SORT_TEST_FILE, 'utf-8'));
}

/** Save current content and return a function that restores it. */
function backupAndRestore(): () => void {
  const original = fs.readFileSync(SORT_TEST_FILE, 'utf-8');
  return () => fs.writeFileSync(SORT_TEST_FILE, original, 'utf-8');
}

test.describe.serial('Sort Nodes', () => {
  test('sort command persists layoutDirection and updates modified timestamp', async ({
    vscPage,
  }) => {
    const restore = backupAndRestore();

    try {
      await vscPage.openFile('sort-test.diagram');
      await vscPage.page.waitForTimeout(2000);

      const tab = vscPage.page.locator('.tab').filter({ hasText: 'sort-test.diagram' });
      await expect(tab).toBeVisible({ timeout: 10000 });

      const beforeDoc = readDiagram();

      await vscPage.executeCommand('DiagramFlow: Sort Nodes');
      await vscPage.page.waitForTimeout(2500);

      const afterDoc = readDiagram();

      // meta.modified should be updated to a newer timestamp
      expect(afterDoc.meta.modified).not.toBe(beforeDoc.meta.modified);

      // meta.layoutDirection must be persisted after sort
      expect(afterDoc.meta.layoutDirection).toBeDefined();
      expect(['TB', 'LR', 'BT', 'RL']).toContain(afterDoc.meta.layoutDirection);

      // All nodes must be preserved
      expect(afterDoc.nodes).toHaveLength(beforeDoc.nodes.length);
    } finally {
      restore();
    }
  });

  test('sort TB orders top-level nodes by y then x', async ({
    vscPage,
  }) => {
    const restore = backupAndRestore();

    try {
      await vscPage.openFile('sort-test.diagram');
      await vscPage.page.waitForTimeout(2000);

      await vscPage.executeCommand('DiagramFlow: Sort Nodes');
      await vscPage.page.waitForTimeout(2500);

      const afterDoc = readDiagram();

      // Sort direction must be set (defaults to TB when not previously set)
      expect(['TB', 'LR', 'BT', 'RL']).toContain(afterDoc.meta.layoutDirection);

      // sort-test.diagram nodes in their ORIGINAL positions:
      //   n3: y=100, x=300  |  n1: y=100, x=400  |  n2: y=200, x=100
      // After TB sort (y asc → x asc within same y):
      //   sorted order: n3, n1, n2
      //   n3 and n1 (top row, y=100) must appear before n2 (bottom row, y=200)
      const topLevel = afterDoc.nodes.filter((n: { group?: string }) => !n.group);
      expect(topLevel).toHaveLength(3);

      const nodeIds = topLevel.map((n: { id: string }) => n.id);
      const n2Index = nodeIds.indexOf('n2');
      const n3Index = nodeIds.indexOf('n3');
      const n1Index = nodeIds.indexOf('n1');

      // n3 and n1 (top row) must come before n2 (bottom row)
      expect(n3Index).toBeLessThan(n2Index);
      expect(n1Index).toBeLessThan(n2Index);
    } finally {
      restore();
    }
  });

  test('standalone direction button (btn-layout-direction) is removed from toolbar', async ({
    vscPage,
  }) => {
    await vscPage.openFile('sort-test.diagram');
    await vscPage.page.waitForTimeout(2000);

    const tab = vscPage.page.locator('.tab').filter({ hasText: 'sort-test.diagram' });
    await expect(tab).toBeVisible({ timeout: 10000 });

    // Webview iframe must be present (extension is active)
    const iframeCount = await vscPage.page.evaluate(() =>
      document.querySelectorAll('iframe').length,
    );
    expect(iframeCount).toBeGreaterThan(0);

    // The btn-layout-direction button was removed from the Arrange section.
    // Verify the compiled webview bundle does NOT contain the id reference.
    const webviewJs = fs.readFileSync(
      path.resolve(__dirname, '..', 'dist', 'webview', 'index.js'),
      'utf-8',
    );
    expect(webviewJs).not.toContain('btn-layout-direction');
  });

  test('sort does not crash the editor and tab remains open', async ({
    vscPage,
  }) => {
    const restore = backupAndRestore();

    try {
      await vscPage.openFile('sort-test.diagram');
      await vscPage.page.waitForTimeout(2000);

      const tab = vscPage.page.locator('.tab').filter({ hasText: 'sort-test.diagram' });
      await expect(tab).toBeVisible({ timeout: 10000 });

      await vscPage.executeCommand('DiagramFlow: Sort Nodes');
      await vscPage.page.waitForTimeout(2000);

      // Editor must still be intact after sort — no crash
      await expect(tab).toBeVisible({ timeout: 5000 });
    } finally {
      restore();
    }
  });
});
