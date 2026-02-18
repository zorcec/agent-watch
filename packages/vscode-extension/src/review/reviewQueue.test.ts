/**
 * AgentWatch ReviewQueue - Unit Tests
 *
 * Verifies batching, deduplication, minimum interval enforcement,
 * diff-change detection, and queue reset behaviour.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../git/gitService', () => ({
  getFileDiff: vi.fn(async () => 'mock diff content'),
}));

import { configure, setOnBatchReady, setOnCountdown, setOnBatchEmpty, enqueueFile, cancelPending, resetQueue } from './reviewQueue';
import { getFileDiff } from '../git/gitService';

describe('reviewQueue', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0); // start clock at epoch so lastReviewAt=0 gives elapsed=0
    resetQueue();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // -------------------------------------------------------------------------
  // Basic scheduling
  // -------------------------------------------------------------------------

  describe('basic scheduling', () => {
    it('should dispatch a file after the configured interval', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 5_000 });
      setOnBatchReady(onBatch);

      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(5_000);

      expect(onBatch).toHaveBeenCalledOnce();
      expect(onBatch).toHaveBeenCalledWith(['src/auth.ts']);
    });

    it('should not dispatch before the interval elapses', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 5_000 });
      setOnBatchReady(onBatch);

      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(4_999);

      expect(onBatch).not.toHaveBeenCalled();
    });

    it('should batch multiple different files into a single callback', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 1_000 });
      setOnBatchReady(onBatch);
      (getFileDiff as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('diff-a')
        .mockResolvedValueOnce('diff-b');

      enqueueFile('src/a.ts');
      enqueueFile('src/b.ts');
      await vi.advanceTimersByTimeAsync(1_000);

      expect(onBatch).toHaveBeenCalledOnce();
      const files = onBatch.mock.calls[0][0] as string[];
      expect(files).toContain('src/a.ts');
      expect(files).toContain('src/b.ts');
      expect(files).toHaveLength(2);
    });

    it('should not create a second timer when the same file is enqueued twice', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 1_000 });
      setOnBatchReady(onBatch);

      enqueueFile('src/auth.ts');
      enqueueFile('src/auth.ts'); // second enqueue should not reset / duplicate timer

      await vi.advanceTimersByTimeAsync(1_000);

      expect(onBatch).toHaveBeenCalledOnce();
      expect(onBatch).toHaveBeenCalledWith(['src/auth.ts']);
    });

    it('should not call onBatchReady if no files are pending', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(onBatch);

      // Enqueue then immediately reset — no files should reach the callback
      enqueueFile('src/auth.ts');
      resetQueue();

      setOnBatchReady(onBatch);
      configure({ minIntervalMs: 0 });
      await vi.advanceTimersByTimeAsync(0);

      expect(onBatch).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // Diff change detection
  // -------------------------------------------------------------------------

  describe('diff change detection', () => {
    it('should skip a file if its diff has not changed since the last review', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(onBatch);
      (getFileDiff as ReturnType<typeof vi.fn>).mockResolvedValue('identical diff');

      // First batch — new hash, must be dispatched
      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(0);
      expect(onBatch).toHaveBeenCalledTimes(1);

      // Second batch — same diff, must be skipped
      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(0);
      expect(onBatch).toHaveBeenCalledTimes(1);
    });

    it('should include a file when its diff changes between reviews', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(onBatch);
      (getFileDiff as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('diff v1')
        .mockResolvedValueOnce('diff v2'); // second save has new content

      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(0);
      expect(onBatch).toHaveBeenCalledTimes(1);

      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(0);
      expect(onBatch).toHaveBeenCalledTimes(2);
    });

    it('should skip a file with an empty diff (no modifications)', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(onBatch);
      (getFileDiff as ReturnType<typeof vi.fn>).mockResolvedValue('');

      enqueueFile('src/clean.ts');
      await vi.advanceTimersByTimeAsync(0);

      expect(onBatch).not.toHaveBeenCalled();
    });

    it('should include a file when getFileDiff throws an error', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(onBatch);
      (getFileDiff as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('git error'));

      enqueueFile('src/error.ts');
      await vi.advanceTimersByTimeAsync(0);

      expect(onBatch).toHaveBeenCalledWith(['src/error.ts']);
    });

    it('should handle multiple files where only some diffs changed', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(onBatch);

      // First batch: both files reviewed
      (getFileDiff as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('diff-a')
        .mockResolvedValueOnce('diff-b');
      enqueueFile('src/a.ts');
      enqueueFile('src/b.ts');
      await vi.advanceTimersByTimeAsync(0);
      expect(onBatch).toHaveBeenCalledTimes(1);

      // Second batch: a.ts unchanged, b.ts has new diff
      (getFileDiff as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('diff-a') // unchanged
        .mockResolvedValueOnce('diff-b-new');
      enqueueFile('src/a.ts');
      enqueueFile('src/b.ts');
      await vi.advanceTimersByTimeAsync(0);

      expect(onBatch).toHaveBeenCalledTimes(2);
      expect(onBatch.mock.calls[1][0]).toEqual(['src/b.ts']);
    });
  });

  // -------------------------------------------------------------------------
  // Minimum interval enforcement
  // -------------------------------------------------------------------------

  describe('minimum interval enforcement', () => {
    it('should wait for the full interval before dispatching a second batch', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 5_000 });
      setOnBatchReady(onBatch);
      (getFileDiff as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce('diff-a')
        .mockResolvedValueOnce('diff-b');

      // First batch dispatched after 5 s from cold start
      enqueueFile('src/a.ts');
      await vi.advanceTimersByTimeAsync(5_000);
      expect(onBatch).toHaveBeenCalledTimes(1);

      // Immediately enqueue another file — cooldown restarts
      enqueueFile('src/b.ts');
      await vi.advanceTimersByTimeAsync(4_999);
      expect(onBatch).toHaveBeenCalledTimes(1); // still waiting

      await vi.advanceTimersByTimeAsync(1);
      expect(onBatch).toHaveBeenCalledTimes(2);
    });

    it('should dispatch immediately if interval has already elapsed', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 1_000 });
      setOnBatchReady(onBatch);

      // First batch
      enqueueFile('src/a.ts');
      await vi.advanceTimersByTimeAsync(1_000);
      expect(onBatch).toHaveBeenCalledTimes(1);

      // Wait longer than the interval before enqueueing again
      await vi.advanceTimersByTimeAsync(5_000);
      (getFileDiff as ReturnType<typeof vi.fn>).mockResolvedValueOnce('diff-b');
      enqueueFile('src/b.ts');
      await vi.advanceTimersByTimeAsync(0); // delay should be 0 — already past cooldown
      expect(onBatch).toHaveBeenCalledTimes(2);
    });
  });

  // -------------------------------------------------------------------------
  // countdown
  // -------------------------------------------------------------------------

  describe('countdown', () => {
    it('should call onCountdown with initial remaining seconds when delay > 0', async () => {
      const onCountdown = vi.fn();
      configure({ minIntervalMs: 5_000 });
      setOnBatchReady(vi.fn());
      setOnCountdown(onCountdown);

      enqueueFile('src/auth.ts');

      // Countdown should have fired immediately with 5 s remaining
      expect(onCountdown).toHaveBeenCalledWith(5);
    });

    it('should tick down once per second', async () => {
      const onCountdown = vi.fn();
      configure({ minIntervalMs: 3_000 });
      setOnBatchReady(vi.fn());
      setOnCountdown(onCountdown);

      enqueueFile('src/auth.ts');
      // Initial call: 3 s
      expect(onCountdown).toHaveBeenLastCalledWith(3);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(onCountdown).toHaveBeenLastCalledWith(2);

      await vi.advanceTimersByTimeAsync(1_000);
      expect(onCountdown).toHaveBeenLastCalledWith(1);
    });

    it('should stop the countdown ticker when flush fires', async () => {
      const onCountdown = vi.fn();
      configure({ minIntervalMs: 2_000 });
      setOnBatchReady(vi.fn());
      setOnCountdown(onCountdown);

      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(2_000); // flush fires

      const callCount = onCountdown.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5_000); // advance well past
      // No new countdown calls after the flush
      expect(onCountdown.mock.calls.length).toBe(callCount);
    });

    it('should not call onCountdown when delay is 0 (immediate dispatch)', async () => {
      const onCountdown = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(vi.fn());
      setOnCountdown(onCountdown);

      enqueueFile('src/auth.ts');

      expect(onCountdown).not.toHaveBeenCalled();
    });

    it('cancelPending should stop the countdown ticker', async () => {
      const onCountdown = vi.fn();
      configure({ minIntervalMs: 5_000 });
      setOnBatchReady(vi.fn());
      setOnCountdown(onCountdown);

      enqueueFile('src/auth.ts');
      cancelPending();

      const callCount = onCountdown.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(onCountdown.mock.calls.length).toBe(callCount);
    });

    it('resetQueue should stop the countdown ticker', async () => {
      const onCountdown = vi.fn();
      configure({ minIntervalMs: 5_000 });
      setOnBatchReady(vi.fn());
      setOnCountdown(onCountdown);

      enqueueFile('src/auth.ts');
      resetQueue();

      const callCount = onCountdown.mock.calls.length;
      await vi.advanceTimersByTimeAsync(5_000);
      expect(onCountdown.mock.calls.length).toBe(callCount);
    });
  });

  // -------------------------------------------------------------------------
  // setOnBatchEmpty
  // -------------------------------------------------------------------------

  describe('setOnBatchEmpty', () => {
    it('should call onBatchEmpty when flush finds no diff for enqueued file', async () => {
      const onBatchEmpty = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(vi.fn());
      setOnBatchEmpty(onBatchEmpty);
      (getFileDiff as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(0);

      expect(onBatchEmpty).toHaveBeenCalledTimes(1);
    });

    it('should call onBatchEmpty when all files have the same diff hash as last review', async () => {
      const onBatch = vi.fn();
      const onBatchEmpty = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(onBatch);
      setOnBatchEmpty(onBatchEmpty);
      (getFileDiff as ReturnType<typeof vi.fn>).mockResolvedValue('unchanged diff');

      // First flush—sends file (hash stored)
      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(0);
      expect(onBatch).toHaveBeenCalledTimes(1);
      expect(onBatchEmpty).not.toHaveBeenCalled();

      // Second flush—same diff, so file is skipped
      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(0);
      expect(onBatch).toHaveBeenCalledTimes(1);
      expect(onBatchEmpty).toHaveBeenCalledTimes(1);
    });

    it('should NOT call onBatchEmpty when flush finds new diffs to review', async () => {
      const onBatch = vi.fn();
      const onBatchEmpty = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(onBatch);
      setOnBatchEmpty(onBatchEmpty);
      (getFileDiff as ReturnType<typeof vi.fn>).mockResolvedValue('new diff');

      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(0);

      expect(onBatch).toHaveBeenCalledTimes(1);
      expect(onBatchEmpty).not.toHaveBeenCalled();
    });

    it('should clear onBatchEmpty callback on resetQueue', async () => {
      const onBatchEmpty = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(vi.fn());
      setOnBatchEmpty(onBatchEmpty);
      (getFileDiff as ReturnType<typeof vi.fn>).mockResolvedValue(null);

      resetQueue();

      configure({ minIntervalMs: 0 });
      setOnBatchReady(vi.fn());
      // onBatchEmpty NOT re-registered

      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(0);

      expect(onBatchEmpty).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // cancelPending
  // -------------------------------------------------------------------------

  describe('cancelPending', () => {
    it('should cancel the pending flush without resetting diff hashes', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(onBatch);
      (getFileDiff as ReturnType<typeof vi.fn>).mockResolvedValue('same diff');

      // First review — file reviewed and hash stored
      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(0);
      expect(onBatch).toHaveBeenCalledTimes(1);

      // Enqueue again, then cancel before flush
      enqueueFile('src/auth.ts');
      cancelPending();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(onBatch).toHaveBeenCalledTimes(1); // flush was cancelled
    });
  });

  // -------------------------------------------------------------------------
  // resetQueue
  // -------------------------------------------------------------------------

  describe('resetQueue', () => {
    it('should cancel a pending flush timer on reset', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 30_000 });
      setOnBatchReady(onBatch);

      enqueueFile('src/auth.ts');
      resetQueue();

      await vi.advanceTimersByTimeAsync(60_000);
      expect(onBatch).not.toHaveBeenCalled();
    });

    it('should clear stored diff hashes so the same diff is sent again after re-arm', async () => {
      const onBatch = vi.fn();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(onBatch);
      (getFileDiff as ReturnType<typeof vi.fn>).mockResolvedValue('same diff');

      // First review stores hash
      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(0);
      expect(onBatch).toHaveBeenCalledTimes(1);

      // Full reset clears hashes
      resetQueue();
      configure({ minIntervalMs: 0 });
      setOnBatchReady(onBatch);

      // Same diff — but hashes were cleared, so file should be dispatched again
      enqueueFile('src/auth.ts');
      await vi.advanceTimersByTimeAsync(0);
      expect(onBatch).toHaveBeenCalledTimes(2);
    });
  });
});
