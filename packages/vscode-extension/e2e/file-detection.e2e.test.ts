/**
 * AgentWatch File Detection E2E Tests
 *
 * Verifies that AgentWatch detects file changes made by external processes
 * (i.e., writes directly to disk, as an AI agent would do) and shows the
 * countdown in the status bar.
 *
 * Setup:
 *   - The test-project is initialised as a git repo in beforeAll so that
 *     AgentWatch can take a baseline snapshot on arm.
 *   - sample.ts is committed, then modified during the test so git diff
 *     produces a non-empty result for the review queue.
 *   - agent-watch-instructions.md sets minWaitTimeMs: 2000 so the countdown
 *     completes quickly without needing to wait 30 seconds.
 */

import { test, expect } from './fixtures/vscode-desktop-fixtures';
import { waitForStatusBarText } from './helpers/vscode-page-helpers';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

const TEST_PROJECT = path.resolve(__dirname, 'test-project');
const SAMPLE_FILE = path.join(TEST_PROJECT, 'sample.ts');
const ORIGINAL_SAMPLE = fs.readFileSync(SAMPLE_FILE, 'utf-8');

// ---------------------------------------------------------------------------
// Git setup: ensure the test-project is a git repo with a committed baseline
// ---------------------------------------------------------------------------

test.beforeAll(() => {
	const gitDir = path.join(TEST_PROJECT, '.git');
	if (!fs.existsSync(gitDir)) {
		execSync('git init', { cwd: TEST_PROJECT, stdio: 'pipe' });
		execSync('git config user.email "test@agentwatch.local"', { cwd: TEST_PROJECT, stdio: 'pipe' });
		execSync('git config user.name "AgentWatch Test"', { cwd: TEST_PROJECT, stdio: 'pipe' });
	}
	// Commit current state as baseline
	try {
		execSync('git add -A', { cwd: TEST_PROJECT, stdio: 'pipe' });
		execSync('git commit -m "e2e baseline" --allow-empty', { cwd: TEST_PROJECT, stdio: 'pipe' });
	} catch {
		// Already committed, ignore
	}
});

test.afterAll(() => {
	// Restore sample.ts so subsequent runs start clean
	fs.writeFileSync(SAMPLE_FILE, ORIGINAL_SAMPLE, 'utf-8');
	try {
		execSync('git checkout -- .', { cwd: TEST_PROJECT, stdio: 'pipe' });
	} catch {
		// Best-effort
	}
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('File change detection', () => {
	test('status bar shows "Watching" after arming', async ({ vscPage }) => {
		const page = vscPage.page;

		// Arm via command palette
		await page.keyboard.press('Control+Shift+P');
		await page.waitForTimeout(1_000);
		const quickInput = page.locator('.quick-input-widget input[type="text"]');
		await quickInput.waitFor({ state: 'visible', timeout: 5_000 });
		await quickInput.fill('AgentWatch: Arm / Start Watching');
		await page.waitForTimeout(1_000);
		await page.keyboard.press('Enter');
		await page.waitForTimeout(3_000);

		const statusText = await waitForStatusBarText(page, 'Watching', 10_000);
		expect(statusText).toBeDefined();
		expect(statusText).toContain('Watching');
	});

	test('status bar shows countdown after external file write', async ({ vscPage }) => {
		const page = vscPage.page;

		// Arm the extension
		await vscPage.executeCommand('AgentWatch: Arm / Start Watching');
		await page.waitForTimeout(3_000);

		const watchingText = await waitForStatusBarText(page, 'Watching', 10_000);
		expect(watchingText).toBeDefined();

		// Write to sample.ts from the test runner — simulates an AI agent
		// editing a file directly on disk, bypassing VS Code's editor
		const modified = ORIGINAL_SAMPLE + `\n// change at ${Date.now()}\n`;
		fs.writeFileSync(SAMPLE_FILE, modified, 'utf-8');

		// The filesystem watcher should pick up the change within 300 ms (debounce)
		// then the queue starts the 2000 ms countdown
		// -> "Review in Xs" should appear in the status bar within ~4 s total
		const countdownText = await waitForStatusBarText(page, 'Review in', 8_000);
		expect(countdownText).toBeDefined();
		expect(countdownText).toMatch(/Review in \d+s/);
	});

	test('status bar transitions away from countdown after it elapses', async ({ vscPage }) => {
		const page = vscPage.page;

		// Commit current state so there's a clean baseline for git diff
		try {
			execSync('git add -A', { cwd: TEST_PROJECT, stdio: 'pipe' });
			execSync('git commit -m "pre-test state" --allow-empty', { cwd: TEST_PROJECT, stdio: 'pipe' });
		} catch { /* ignore */ }

		// Arm so baseline = freshly committed HEAD
		await vscPage.executeCommand('AgentWatch: Arm / Start Watching');
		await page.waitForTimeout(3_000);

		const watchingText = await waitForStatusBarText(page, 'Watching', 10_000);
		expect(watchingText).toBeDefined();

		// Write a real change so git diff is non-empty
		const changedContent = `// added by e2e test at ${Date.now()}\n` + ORIGINAL_SAMPLE;
		fs.writeFileSync(SAMPLE_FILE, changedContent, 'utf-8');

		// Wait for countdown to appear
		const countdownText = await waitForStatusBarText(page, 'Review in', 8_000);
		expect(countdownText).toBeDefined();

		// Wait for countdown to finish (minWaitTimeMs: 2000 + buffer)
		// Extension may fail LLM review without Copilot, but status must leave countdown
		const postCountdown =
			await waitForStatusBarText(page, 'Reviewing', 8_000) ||
			await waitForStatusBarText(page, 'Watching', 4_000) ||
			await waitForStatusBarText(page, 'issue', 4_000);
		expect(postCountdown).toBeDefined();
	});
});
