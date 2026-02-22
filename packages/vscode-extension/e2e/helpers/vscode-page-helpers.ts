/**
 * Module: e2e/helpers/vscode-page-helpers.ts
 *
 * Helper functions for interacting with VS Code Web UI using Playwright.
 * Provides utilities to click buttons, inspect decorations, read output, etc.
 */

import { Page } from '@playwright/test';

/**
 * Safely execute a page operation, handling page closure gracefully
 */
async function safePageOp<T>(
	page: Page,
	operation: () => Promise<T>,
	defaultValue: T
): Promise<T> {
	if (page.isClosed()) {
		return defaultValue;
	}
	try {
		return await operation();
	} catch (error: any) {
		if (page.isClosed() || error?.message?.includes('closed') || error?.message?.includes('Target closed')) {
			return defaultValue;
		}
		throw error;
	}
}

/**
 * Waits for VS Code workbench to be fully loaded and dismisses trust dialog
 */
export async function waitForWorkbench(page: Page): Promise<void> {
	await safePageOp(page, async () => {
		await page.waitForSelector('.monaco-workbench', { timeout: 30000 });
		await page.waitForTimeout(1000);
		await dismissTrustDialog(page);
	}, undefined);
}

/**
 * Dismisses the "Do you trust the authors?" dialog
 */
async function dismissTrustDialog(page: Page): Promise<void> {
	await safePageOp(page, async () => {
		await page.waitForTimeout(1000);
		const trustButton = page.locator('button:has-text("Yes, I trust"), button:has-text("Trust"), .monaco-button.monaco-text-button:has-text("Yes")').first();
		const isVisible = await trustButton.isVisible({ timeout: 2000 }).catch(() => false);
		if (isVisible) {
			console.log('Dismissing trust dialog...');
			await trustButton.click();
			await page.waitForTimeout(1000);
		}
	}, undefined);
}

/**
 * Opens a file in the editor using Quick Open (Ctrl+P)
 */
export async function openFile(page: Page, filename: string): Promise<void> {
	await safePageOp(page, async () => {
		await dismissTrustDialog(page);
		await page.keyboard.press('Control+P');
		await page.waitForTimeout(500);

		const quickInput = page.locator('.quick-input-widget input[type="text"]');
		await quickInput.fill(filename);
		await page.waitForTimeout(500);

		await page.keyboard.press('Enter');
		await page.waitForTimeout(1000);
	}, undefined);
}

/**
 * Gets notification messages currently visible
 */
export async function getNotifications(page: Page): Promise<string[]> {
	return safePageOp(page, async () => {
		const notifications = page.locator('.notification-toast .notification-list-item-message');
		const count = await notifications.count();
		const messages: string[] = [];
		for (let i = 0; i < count; i++) {
			const text = await notifications.nth(i).textContent();
			if (text) {
				messages.push(text);
			}
		}
		return messages;
	}, []);
}

/**
 * Waits for a notification containing specific text
 */
export async function waitForNotification(page: Page, text: string, timeout = 10000): Promise<boolean> {
	return safePageOp(page, async () => {
		const start = Date.now();
		while (Date.now() - start < timeout) {
			const notifications = await getNotifications(page);
			if (notifications.some(n => n.toLowerCase().includes(text.toLowerCase()))) {
				return true;
			}
			await page.waitForTimeout(500);
		}
		return false;
	}, false);
}

/**
 * Checks if a file is currently open in the editor
 */
export async function isFileOpen(page: Page, filename: string): Promise<boolean> {
	return safePageOp(page, async () => {
		const tab = page.locator(`.tab:has-text("${filename}")`);
		return tab.isVisible({ timeout: 2000 }).catch(() => false);
	}, false);
}

/**
 * Polls the status bar until an item containing `text` is visible, or timeout elapses.
 * Returns the full text of the matching status bar item, or undefined on timeout.
 */
export async function waitForStatusBarText(
	page: Page,
	text: string,
	timeout = 15_000,
): Promise<string | undefined> {
	return safePageOp(page, async () => {
		const deadline = Date.now() + timeout;
		while (Date.now() < deadline) {
			const items = page.locator('.statusbar-item');
			const count = await items.count();
			for (let i = 0; i < count; i++) {
				const item = items.nth(i);
				const label = await item.textContent().catch(() => '');
				if (label && label.includes(text)) {
					return label.trim();
				}
			}
			await page.waitForTimeout(250);
		}
		return undefined;
	}, undefined);
}

/**
 * Gets the content of the currently active editor
 */
export async function getEditorContent(page: Page): Promise<string> {
	return safePageOp(page, async () => {
		const lines = page.locator('.view-lines .view-line');
		const count = await lines.count();
		const content: string[] = [];
		for (let i = 0; i < count; i++) {
			const text = await lines.nth(i).textContent();
			content.push(text || '');
		}
		return content.join('\n');
	}, '');
}

/**
 * Executes a VS Code command via the command palette.
 *
 * Critical: Ctrl+Shift+P opens the quick-input with a ">" mode prefix.
 * Calling fill(command) without that ">" switches the palette back to
 * file-search mode (placeholder "Search files by name"), which makes
 * command filtering fail.  We therefore use Ctrl+P + fill('> '+command)
 * to explicitly stay in command mode.
 */
export async function executeCommand(page: Page, command: string): Promise<void> {
	await safePageOp(page, async () => {
		// Dismiss any existing dialogs / quick-inputs first
		await dismissTrustDialog(page);
		await page.keyboard.press('Escape');
		await page.waitForTimeout(300);

		// Open the file quick-open; we'll switch to command mode via ">"
		await page.keyboard.press('Control+P');
		await page.waitForTimeout(600);

		const quickInput = page.locator('.quick-input-widget input[type="text"]');
		await quickInput.waitFor({ state: 'visible', timeout: 5000 });

		// Prefix ">" puts the palette into command mode, then the command name filters it
		await quickInput.fill(`> ${command}`);
		await page.waitForTimeout(1000);

		// Try to click the first matching item in the filtered list
		const shortTitle = command.split(':').pop()?.trim() ?? command;
		const matchingItem = page.locator(`.quick-input-list .monaco-list-row`).filter({
			hasText: shortTitle,
		}).first();

		const itemVisible = await matchingItem.isVisible({ timeout: 2000 }).catch(() => false);
		if (itemVisible) {
			await matchingItem.click();
		} else {
			await page.keyboard.press('Enter');
		}

		await page.waitForTimeout(1500);
	}, undefined);
}
