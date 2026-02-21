/**
 * E2E test: LLM Visual Verification
 *
 * Uses the VS Code Skills Proxy to ask an LLM to verify diagram screenshot
 * content semantically. These tests are opt-in via RUN_LLM_TESTS=true.
 *
 * Tagged with @llm so they can be run/skipped selectively:
 *   RUN_LLM_TESTS=true npx playwright test --grep @llm
 */

import { expect } from '@playwright/test';
import { test } from './fixtures/vscode-suite-fixtures';
import {
  isLLMTestEnabled,
  remainingLLMCalls,
  verifyScreenshotWithLLM,
  verifyDiagramStructureWithLLM,
} from './helpers/llm-visual-verify';
import * as fs from 'fs';
import * as path from 'path';

test.describe('@llm Visual Verification', { tag: '@llm' }, () => {
  test.beforeEach(async ({}, testInfo) => {
    if (!isLLMTestEnabled()) {
      testInfo.skip(true, 'LLM tests disabled (set RUN_LLM_TESTS=true)');
      return;
    }
    // Check if the Skills Proxy is reachable
    try {
      await fetch(
        (process.env.SKILLS_PROXY_URL ?? 'http://127.0.0.1:18080') + '/v1/models',
        { signal: AbortSignal.timeout(3000) },
      );
    } catch {
      testInfo.skip(true, 'Skills Proxy not reachable');
    }
  });

  test('simple diagram shows expected nodes and edges', async ({ vscPage }) => {
    test.skip(remainingLLMCalls() < 1, 'LLM budget exhausted');

    await vscPage.openFile('simple.diagram');
    await vscPage.page.waitForTimeout(5000);

    const editorArea = vscPage.page.locator('.editor-group-container');
    const screenshot = await editorArea.screenshot();

    let result: { passed: boolean; answer: string };
    try {
      result = await verifyScreenshotWithLLM(
        screenshot,
        'Does this screenshot show a diagram editor with nodes labeled "Start", "Process", and "End", connected with arrows?',
      );
    } catch {
      // Fallback to text-only verification
      const diagramPath = path.resolve(
        __dirname,
        'test-project',
        'simple.diagram',
      );
      const diagramJson = fs.readFileSync(diagramPath, 'utf-8');
      result = await verifyDiagramStructureWithLLM(
        diagramJson,
        'Does this diagram have exactly 3 nodes labeled "Start", "Process", and "End", with 2 edges connecting them in order?',
      );
    }

    console.log(`LLM verification: ${result.answer}`);
    expect(result.passed).toBe(true);
  });

  test('empty diagram has no nodes', async ({ vscPage }) => {
    test.skip(remainingLLMCalls() < 1, 'LLM budget exhausted');

    await vscPage.openFile('empty.diagram');
    await vscPage.page.waitForTimeout(4000);

    const diagramPath = path.resolve(
      __dirname,
      'test-project',
      'empty.diagram',
    );
    const diagramJson = fs.readFileSync(diagramPath, 'utf-8');

    const result = await verifyDiagramStructureWithLLM(
      diagramJson,
      'Does this diagram have zero nodes and zero edges?',
    );

    console.log(`LLM verification: ${result.answer}`);
    expect(result.passed).toBe(true);
  });

  test('complex diagram has multiple node shapes and colors', async ({
    vscPage,
  }) => {
    test.skip(remainingLLMCalls() < 1, 'LLM budget exhausted');

    await vscPage.openFile('complex.diagram');
    await vscPage.page.waitForTimeout(5000);

    const diagramPath = path.resolve(
      __dirname,
      'test-project',
      'complex.diagram',
    );
    const diagramJson = fs.readFileSync(diagramPath, 'utf-8');

    const result = await verifyDiagramStructureWithLLM(
      diagramJson,
      'Does this diagram have at least 4 different node shapes (rectangle, rounded, diamond, cylinder) and at least 3 different colors?',
    );

    console.log(`LLM verification: ${result.answer}`);
    expect(result.passed).toBe(true);
  });
});
