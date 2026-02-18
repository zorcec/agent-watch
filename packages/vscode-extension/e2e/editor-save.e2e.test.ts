/**
 * AgentWatch Editor Save Detection E2E Tests
 *
 * Replicates the bug where modifying a file in VS Code's editor (Ctrl+S)
 * was not detected because createFileSystemWatcher.onDidChange does not
 * reliably fire for saves made within VS Code's own process.
 *
 * The fix adds onDidSaveTextDocument as a second source alongside the
 * filesystem watcher, so both editor saves and external writes are captured.
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
// Git setup: test-project must be a git repo with a committed baseline
// ---------------------------------------------------------------------------

test.beforeAll(() => {
	const gitDir = path.join(TEST_PROJECT, '.git');
	if (!fs.existsSync(gitDir)) {
		execSync('git init', { cwd: TEST_PROJECT, stdio: 'pipe' });
		execSync('git config user.email "test@agentwatch.local"', { cwd: TEST_PROJECT, stdio: 'pipe' });
		execSync('git config user.name "AgentWatch Test"', { cwd: TEST_PROJECT, stdio: 'pipe' });
	}
	try {
		execSync('git add -A', { cwd: TEST_PROJECT, stdio: 'pipe' });
		execSync('git commit -m "e2e baseline" --allow-empty', { cwd: TEST_PROJECT, stdio: 'pipe' });
	} catch {
		// Already committed
	}
});

test.afterAll(() => {
	fs.writeFileSync(SAMPLE_FILE, ORIGINAL_SAMPLE, 'utf-8');
	try {
		execSync('git checkout -- .', { cwd: TEST_PROJECT, stdio: 'pipe' });
	} catch { /* best-effort */ }
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Editor save detection', () => {
	/**
	 * This test replicates the original bug:
	 * - User arms AgentWatch
	 * - User opens a file in VS Code's editor and saves it with Ctrl+S
	 * - Previously: nothing happened (FileSystemWatcher missed the event)
	 * - After fix: countdown appears in status bar within a few seconds
	 */
	test('status bar shows countdown after saving a file in the VS Code editor', async ({ vscPage }) => {
		const page = vscPage.page;

		// Arm the extension
		await vscPage.executeCommand('AgentWatch: Arm / Start Watching');
		await page.waitForTimeout(3_000);

		const watchingText = await waitForStatusBarText(page, 'Watching', 10_000);
		expect(watchingText, 'Extension should show Watching after arm').toBeDefined();

		// Open sample.ts via Quick Open (Ctrl+P)
		await page.keyboard.press('Control+P');
		await page.waitForTimeout(800);
		const quickOpen = page.locator('.quick-input-widget input[type="text"]');
		await quickOpen.waitFor({ state: 'visible', timeout: 5_000 });
		await quickOpen.fill('sample.ts');
		await page.waitForTimeout(800);
		await page.keyboard.press('Enter');
		await page.waitForTimeout(1_500);

		// Move to end of file and add a comment line
		await page.keyboard.press('Control+End');
		await page.waitForTimeout(300);
		await page.keyboard.press('End');
		await page.keyboard.press('Enter');
		await page.keyboard.type(`// edited in editor at ${Date.now()}`);
		await page.waitForTimeout(300);

		// Save via Ctrl+S — this is the event that was missed before
		await page.keyboard.press('Control+S');
		await page.waitForTimeout(500);

		// The onDidSaveTextDocument event should fire and queue the file
		// With minWaitTimeMs: 2000 the countdown should appear within ~3 s
		const countdownText = await waitForStatusBarText(page, 'Review in', 8_000);
		expect(countdownText, 'Status bar should show countdown after editor save').toBeDefined();
		expect(countdownText).toMatch(/Review in \d+s/);
	});

	test('status bar shows countdown after auto-save (simulated via repeated editor writes)', async ({ vscPage }) => {
		const page = vscPage.page;

		// Arm the extension
		await vscPage.executeCommand('AgentWatch: Arm / Start Watching');
		await page.waitForTimeout(3_000);

		const watchingText = await waitForStatusBarText(page, 'Watching', 10_000);
		expect(watchingText).toBeDefined();

		// Open sample.ts
		await page.keyboard.press('Control+P');
		await page.waitForTimeout(800);
		const quickOpen = page.locator('.quick-input-widget input[type="text"]');
		await quickOpen.waitFor({ state: 'visible', timeout: 5_000 });
		await quickOpen.fill('sample.ts');
		await page.waitForTimeout(800);
		await page.keyboard.press('Enter');
		await page.waitForTimeout(1_500);

		// Edit and save multiple times (simulating iterative editing)
		for (let i = 0; i < 2; i++) {
			await page.keyboard.press('Control+End');
			await page.keyboard.press('End');
			await page.keyboard.press('Enter');
			await page.keyboard.type(`// iteration ${i} at ${Date.now()}`);
			await page.keyboard.press('Control+S');
			await page.waitForTimeout(400);
		}

		// Should see the countdown despite multiple rapid saves (debounce collapses them)
		const countdownText = await waitForStatusBarText(page, 'Review in', 8_000);
		expect(countdownText).toBeDefined();
		expect(countdownText).toMatch(/Review in \d+s/);
	});
});
