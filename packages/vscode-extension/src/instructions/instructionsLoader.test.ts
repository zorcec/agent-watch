/**
 * AgentWatch InstructionsLoader - Unit Tests
 *
 * Tests for loading, parsing, and formatting user-defined review instructions.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [
      { uri: { fsPath: '/workspace' } },
    ],
    fs: {
      readFile: vi.fn(),
    },
  },
  Uri: {
    joinPath: vi.fn((_base: any, path: string) => ({
      fsPath: `/workspace/${path}`,
    })),
  },
}));

import {
  loadUserInstructions,
  getUserInstructionsText,
  parseInstructions,
  extractFrontMatter,
} from './instructionsLoader';
import type { UserRule } from './instructionsLoader';

describe('parseInstructions', () => {
  it('should parse rules with severity tags', () => {
    const content = `# Rules
- [high] Flag changes to auth logic
- [medium] Watch for API changes
- [low] Note config file changes`;

    const rules = parseInstructions(content);
    expect(rules).toHaveLength(3);
    expect(rules[0]).toEqual({ severity: 'high', text: 'Flag changes to auth logic' });
    expect(rules[1]).toEqual({ severity: 'medium', text: 'Watch for API changes' });
    expect(rules[2]).toEqual({ severity: 'low', text: 'Note config file changes' });
  });

  it('should default to medium severity when no tag is present', () => {
    const content = `- Flag removed error handlers`;
    const rules = parseInstructions(content);
    expect(rules).toHaveLength(1);
    expect(rules[0].severity).toBe('medium');
    expect(rules[0].text).toBe('Flag removed error handlers');
  });

  it('should ignore comment lines starting with >', () => {
    const content = `> This is a comment
- [high] Real rule`;
    const rules = parseInstructions(content);
    expect(rules).toHaveLength(1);
    expect(rules[0].text).toBe('Real rule');
  });

  it('should ignore heading lines starting with #', () => {
    const content = `# Section Header
## Sub-section
- [low] A rule`;
    const rules = parseInstructions(content);
    expect(rules).toHaveLength(1);
  });

  it('should ignore empty lines', () => {
    const content = `
- [high] Rule one

- [low] Rule two
`;
    const rules = parseInstructions(content);
    expect(rules).toHaveLength(2);
  });

  it('should handle asterisk list markers', () => {
    const content = `* [high] Asterisk rule`;
    const rules = parseInstructions(content);
    expect(rules).toHaveLength(1);
    expect(rules[0].text).toBe('Asterisk rule');
  });

  it('should handle numbered list markers', () => {
    const content = `1. [medium] Numbered rule`;
    const rules = parseInstructions(content);
    expect(rules).toHaveLength(1);
    expect(rules[0].text).toBe('Numbered rule');
  });

  it('should handle case-insensitive severity tags', () => {
    const content = `- [HIGH] Uppercase tag
- [Medium] Mixed case
- [Low] Another`;
    const rules = parseInstructions(content);
    expect(rules).toHaveLength(3);
    expect(rules[0].severity).toBe('high');
    expect(rules[1].severity).toBe('medium');
    expect(rules[2].severity).toBe('low');
  });

  it('should return empty array for empty content', () => {
    const rules = parseInstructions('');
    expect(rules).toHaveLength(0);
  });

  it('should return empty array for content with only headers and comments', () => {
    const content = `# Header
> Comment
## Another header`;
    const rules = parseInstructions(content);
    expect(rules).toHaveLength(0);
  });

  it('should handle lines without list markers', () => {
    const content = `[high] Bare line rule`;
    const rules = parseInstructions(content);
    expect(rules).toHaveLength(1);
    expect(rules[0].severity).toBe('high');
    expect(rules[0].text).toBe('Bare line rule');
  });

  it('should parse a full template document', () => {
    const content = `# AgentWatch Instructions

> Define project-specific validation rules below.

## Security
- [high] Always flag changes to authentication or authorization logic
- [high] Flag any hardcoded secrets, API keys, or credentials

## Data
- [high] Flag changes to database migration files or schema definitions
- [medium] Watch for changes to data validation logic

## Custom Rules
- [low] Note changes to configuration files`;

    const rules = parseInstructions(content);
    expect(rules).toHaveLength(5);
    expect(rules.filter((r) => r.severity === 'high')).toHaveLength(3);
    expect(rules.filter((r) => r.severity === 'medium')).toHaveLength(1);
    expect(rules.filter((r) => r.severity === 'low')).toHaveLength(1);
  });
});

describe('getUserInstructionsText', () => {
  it('should return empty string for no rules', () => {
    const result = getUserInstructionsText([]);
    expect(result).toBe('');
  });

  it('should format a single high rule', () => {
    const rules: UserRule[] = [{ severity: 'high', text: 'Check auth logic' }];
    const result = getUserInstructionsText(rules);
    expect(result).toContain('[HIGH]');
    expect(result).toContain('Check auth logic');
    expect(result).toContain('agent-watch-instructions.md');
  });

  it('should format multiple rules with correct severity labels', () => {
    const rules: UserRule[] = [
      { severity: 'high', text: 'Auth changes' },
      { severity: 'medium', text: 'API changes' },
      { severity: 'low', text: 'Config changes' },
    ];
    const result = getUserInstructionsText(rules);
    expect(result).toContain('[HIGH]');
    expect(result).toContain('[MEDIUM]');
    expect(result).toContain('[LOW]');
  });

  it('should include the project-specific header', () => {
    const rules: UserRule[] = [{ severity: 'medium', text: 'Some rule' }];
    const result = getUserInstructionsText(rules);
    expect(result).toContain('Additional project-specific validation rules');
  });
});

describe('extractFrontMatter', () => {
  it('should return empty config and full body when no front matter', () => {
    const content = '# Rules\n- [high] A rule';
    const { body, config } = extractFrontMatter(content);
    expect(config).toEqual({});
    expect(body).toBe(content);
  });

  it('should extract model from front matter', () => {
    const content = '---\nmodel: claude-3-5-sonnet\n---\n# Rules\n- [high] A rule';
    const { body, config } = extractFrontMatter(content);
    expect(config.model).toBe('claude-3-5-sonnet');
    expect(body).toContain('# Rules');
    expect(body).not.toContain('---');
  });

  it('should extract minWaitTimeMs from front matter', () => {
    const content = '---\nminWaitTimeMs: 15000\n---\n# Rules';
    const { config } = extractFrontMatter(content);
    expect(config.minWaitTimeMs).toBe(15000);
  });

  it('should extract both model and minWaitTimeMs', () => {
    const content = '---\nmodel: gpt-4o\nminWaitTimeMs: 30000\n---\n- [medium] A rule';
    const { body, config } = extractFrontMatter(content);
    expect(config.model).toBe('gpt-4o');
    expect(config.minWaitTimeMs).toBe(30000);
    expect(body).toContain('- [medium] A rule');
  });

  it('should ignore invalid minWaitTimeMs values', () => {
    const content = '---\nminWaitTimeMs: not-a-number\n---\n# Rules';
    const { config } = extractFrontMatter(content);
    expect(config.minWaitTimeMs).toBeUndefined();
  });

  it('should not parse front matter not at start of file', () => {
    const content = '# Rules\n---\nmodel: gpt-4o\n---';
    const { config } = extractFrontMatter(content);
    expect(config.model).toBeUndefined();
  });
});

describe('parseInstructions with front matter input', () => {
  it('should not include dashes from front matter delimiters as rules', () => {
    // parseInstructions receives body only (already stripped by extractFrontMatter)
    const body = '# Rules\n- [high] A real rule';
    const rules = parseInstructions(body);
    expect(rules).toHaveLength(1);
    expect(rules[0].text).toBe('A real rule');
  });
});

describe('loadUserInstructions', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should return found:false when no workspace folders exist', async () => {
    const vscode = await import('vscode');
    (vscode.workspace as any).workspaceFolders = undefined;

    const { loadUserInstructions: load } = await import('./instructionsLoader');
    const result = await load();
    expect(result.found).toBe(false);
    expect(result.rules).toHaveLength(0);
    expect(result.config).toEqual({});
  });

  it('should return found:false when file read fails', async () => {
    const vscode = await import('vscode');
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
    (vscode.workspace.fs.readFile as any) = vi.fn().mockRejectedValue(new Error('File not found'));

    const { loadUserInstructions: load } = await import('./instructionsLoader');
    const result = await load();
    expect(result.found).toBe(false);
    expect(result.rules).toHaveLength(0);
  });

  it('should return found:true with empty rules for empty file', async () => {
    const vscode = await import('vscode');
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
    (vscode.workspace.fs.readFile as any) = vi.fn().mockResolvedValue(Buffer.from(''));

    const { loadUserInstructions: load } = await import('./instructionsLoader');
    const result = await load();
    expect(result.found).toBe(true);
    expect(result.rules).toHaveLength(0);
    expect(result.config).toEqual({});
  });

  it('should parse rules from file content', async () => {
    const vscode = await import('vscode');
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
    const content = `- [high] Auth rule\n- [low] Config rule`;
    (vscode.workspace.fs.readFile as any) = vi.fn().mockResolvedValue(Buffer.from(content));

    const { loadUserInstructions: load } = await import('./instructionsLoader');
    const result = await load();
    expect(result.found).toBe(true);
    expect(result.rules).toHaveLength(2);
    expect(result.rawContent).toBe(content);
  });

  it('should parse config from YAML front matter', async () => {
    const vscode = await import('vscode');
    (vscode.workspace as any).workspaceFolders = [{ uri: { fsPath: '/workspace' } }];
    const content = '---\nmodel: claude-3-5-sonnet\nminWaitTimeMs: 20000\n---\n- [high] Auth rule';
    (vscode.workspace.fs.readFile as any) = vi.fn().mockResolvedValue(Buffer.from(content));

    const { loadUserInstructions: load } = await import('./instructionsLoader');
    const result = await load();
    expect(result.found).toBe(true);
    expect(result.config.model).toBe('claude-3-5-sonnet');
    expect(result.config.minWaitTimeMs).toBe(20000);
    expect(result.rules).toHaveLength(1);
  });
});
