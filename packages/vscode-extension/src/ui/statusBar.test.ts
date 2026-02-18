/**
 * AgentWatch StatusBar - Unit Tests
 *
 * Tests for status bar state machine transitions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
  const mockStatusBarItem = {
    text: '',
    tooltip: '',
    command: '' as string | undefined,
    backgroundColor: undefined as any,
    show: vi.fn(),
    dispose: vi.fn(),
  };

  return {
    window: {
      createStatusBarItem: vi.fn(() => mockStatusBarItem),
    },
    StatusBarAlignment: {
      Left: 1,
      Right: 2,
    },
    ThemeColor: vi.fn((id: string) => ({ id })),
  };
});

describe('statusBar', () => {
  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
  });

  it('should start in idle state', async () => {
    const { getState, resetState } = await import('./statusBar');
    resetState();
    expect(getState()).toBe('idle');
  });

  it('should transition to watching state', async () => {
    const { createStatusBar, setState, getState, resetState } = await import('./statusBar');
    resetState();
    createStatusBar();
    setState('watching');
    expect(getState()).toBe('watching');
  });

  it('should transition to reviewing state', async () => {
    const { createStatusBar, setState, getState, resetState } = await import('./statusBar');
    resetState();
    createStatusBar();
    setState('reviewing');
    expect(getState()).toBe('reviewing');
  });

  it('should transition to issues state with count', async () => {
    const { createStatusBar, setState, setIssueCount, getState, resetState } = await import('./statusBar');
    resetState();
    createStatusBar();
    setState('watching');
    setIssueCount(3);
    expect(getState()).toBe('issues');
  });

  it('should transition clean to idle after 5 seconds', async () => {
    const { createStatusBar, setState, getState, resetState } = await import('./statusBar');
    resetState();
    createStatusBar();
    setState('clean');
    expect(getState()).toBe('clean');

    vi.advanceTimersByTime(5000);
    expect(getState()).toBe('idle');
  });

  it('should not auto-fade if state changes before timer', async () => {
    const { createStatusBar, setState, getState, resetState } = await import('./statusBar');
    resetState();
    createStatusBar();
    setState('clean');
    setState('watching');

    vi.advanceTimersByTime(5000);
    expect(getState()).toBe('watching');
  });

  it('should not set issues state from idle', async () => {
    const { createStatusBar, setIssueCount, getState, resetState } = await import('./statusBar');
    resetState();
    createStatusBar();
    setIssueCount(5);
    // When in idle, setIssueCount should not change state
    expect(getState()).toBe('idle');
  });
});
