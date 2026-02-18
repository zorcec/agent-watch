/**
 * Module: reviewQueue.ts
 *
 * Description:
 *   Batches file review requests and enforces a minimum interval between
 *   consecutive review runs. Deduplicates files within a batch window and
 *   skips files whose diff has not changed since the last review.
 *
 *   Flow:
 *   1. enqueueFile(filePath) adds a file to the pending Set.
 *   2. A flush is scheduled to fire after `minIntervalMs` has elapsed since
 *      the previous batch completed (immediate on first enqueue after idle).
 *   3. When the flush runs, it fetches the current diff of each pending file.
 *      Files with the same diff hash as the last reviewed run are skipped.
 *   4. The filtered list is passed to `onBatchReady` for review.
 *
 * Usage:
 *   import { configure, setOnBatchReady, enqueueFile, resetQueue } from './reviewQueue';
 *   configure({ minIntervalMs: 30_000 });
 *   setOnBatchReady(handleBatch);
 *   enqueueFile('src/auth.ts');
 */

import { getFileDiff } from '../git/gitService';

/** Minimum milliseconds between review batch dispatches (default: 30 s) */
let minIntervalMs = 30_000;

/** Files waiting for the next review batch */
const pendingFiles = new Set<string>();

/** Epoch-ms timestamp when the last batch was dispatched */
let lastReviewAt = 0;

/**
 * Hash of the diff content most recently dispatched per file.
 * Used to skip files whose diff has not changed between saves.
 */
const reviewedDiffHash = new Map<string, string>();

/** Active flush timer handle (undefined when idle) */
let flushTimer: ReturnType<typeof setTimeout> | undefined;

/** Callback invoked when a batch of files with new diffs is ready */
let onBatchReady: ((filePaths: string[]) => void) | undefined;

/** Callback invoked once per second with remaining seconds during the cooldown wait */
let onCountdown: ((secondsRemaining: number) => void) | undefined;

/** Callback invoked when a flush completes with no new diffs to review */
let onBatchEmpty: (() => void) | undefined;

/** Interval handle for the countdown ticker */
let countdownInterval: ReturnType<typeof setInterval> | undefined;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Configures the review queue.
 *
 * @param config.minIntervalMs - Minimum ms between batches (default: 30 000)
 */
export function configure(config: { minIntervalMs?: number }): void {
  if (config.minIntervalMs !== undefined) minIntervalMs = config.minIntervalMs;
}

/**
 * Sets the callback invoked when a batch of files with new diffs is ready.
 *
 * @param callback - Receives the array of relative file paths to review
 */
export function setOnBatchReady(callback: (filePaths: string[]) => void): void {
  onBatchReady = callback;
}

/**
 * Sets the callback invoked once per second with the remaining wait time in
 * seconds while the queue is counting down to the next review batch.
 * Called with 0 when the countdown elapses and the batch is dispatched.
 *
 * @param callback - Receives remaining seconds (0 = dispatch imminent)
 */
export function setOnCountdown(callback: (secondsRemaining: number) => void): void {
  onCountdown = callback;
}

/**
 * Sets the callback invoked when a flush fires but produces no new diffs to review.
 * Use this to reset the UI (e.g. status bar back to "Watching") when a cooldown
 * elapses but nothing has changed since the last review.
 *
 * @param callback - Called with no arguments when the batch is empty
 */
export function setOnBatchEmpty(callback: () => void): void {
  onBatchEmpty = callback;
}

/**
 * Enqueues a file for the next review batch.
 * Schedules a flush respecting the minimum interval.
 *
 * @param filePath - Workspace-relative file path
 */
export function enqueueFile(filePath: string): void {
  pendingFiles.add(filePath);
  scheduleFlush();
}

/**
 * Cancels any pending flush and discards queued files.
 * Does NOT clear diff hashes or configuration — the queue stays configured
 * and ready for the next enqueue.
 * Use this when the user issues a clearReview without disarming.
 */
export function cancelPending(): void {
  pendingFiles.clear();
  stopCountdown();
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
}

/**
 * Full reset: clears pending files, flush timers, diff hashes, and
 * configuration. Called on disarm or re-arm to start fresh.
 */
export function resetQueue(): void {
  pendingFiles.clear();
  reviewedDiffHash.clear();
  lastReviewAt = 0;
  minIntervalMs = 30_000;
  onBatchReady = undefined;
  onCountdown = undefined;
  onBatchEmpty = undefined;
  stopCountdown();
  if (flushTimer !== undefined) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Schedules a batch flush after the remaining cooldown has elapsed.
 * If a flush is already pending, does nothing (timer already set).
 */
function scheduleFlush(): void {
  if (flushTimer !== undefined) return;

  const elapsed = Date.now() - lastReviewAt;
  const delay = Math.max(0, minIntervalMs - elapsed);

  if (delay > 0 && onCountdown) {
    let remaining = Math.ceil(delay / 1000);
    onCountdown(remaining);
    countdownInterval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        onCountdown?.(remaining);
      } else {
        stopCountdown();
      }
    }, 1_000);
  }

  flushTimer = setTimeout(() => {
    flushTimer = undefined;
    stopCountdown();
    void runFlush();
  }, delay);
}

/**
 * Clears the countdown ticker if one is running.
 */
function stopCountdown(): void {
  if (countdownInterval !== undefined) {
    clearInterval(countdownInterval);
    countdownInterval = undefined;
  }
}

/**
 * Runs the batch: fetches current diffs, filters files whose diff has already
 * been reviewed, updates hashes for files that will be dispatched, then calls
 * `onBatchReady` with the filtered list.
 */
async function runFlush(): Promise<void> {
  if (pendingFiles.size === 0) return;

  const candidates = [...pendingFiles];
  pendingFiles.clear();
  lastReviewAt = Date.now();

  const toReview: string[] = [];

  for (const filePath of candidates) {
    try {
      const diff = await getFileDiff(filePath);

      if (!diff) continue; // file has no modifications

      const hash = hashDiff(diff);
      if (reviewedDiffHash.get(filePath) === hash) continue; // same diff as last review

      // Record the new hash so the same diff is not re-sent on next save
      reviewedDiffHash.set(filePath, hash);
      toReview.push(filePath);
    } catch {
      // If diff check fails, include the file to be safe
      toReview.push(filePath);
    }
  }

  if (toReview.length > 0) {
    onBatchReady?.(toReview);
  } else {
    onBatchEmpty?.();
  }
}

/**
 * Fast non-cryptographic hash of a diff string (djb2 variant).
 * Only used to detect whether the diff content changed between saves.
 *
 * @param s - Input string
 * @returns Base-36 string of the unsigned 32-bit hash
 */
function hashDiff(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 31) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(36);
}
