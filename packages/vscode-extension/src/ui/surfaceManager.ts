/**
 * Module: surfaceManager.ts
 *
 * Description:
 *   Manages all inline VS Code UI surfaces for displaying review issues.
 *   Acts as a single entry point that takes ReviewIssue[] and updates:
 *   - DiagnosticCollection (squiggles, Problems panel)
 *   - CodeLensProvider (one-line risk summary above flagged blocks)
 *   - TextEditorDecorationType (after-line text and gutter icons)
 *   - HoverProvider (rich markdown tooltip on hover)
 *
 *   All surfaces work inside both the normal editor and git diff view.
 *
 * Usage:
 *   import { initSurfaces, updateIssues, clearAll } from './surfaceManager';
 *   const disposables = initSurfaces();
 *   updateIssues(reviewIssues);
 */

import * as vscode from 'vscode';
import type { ReviewIssue, RiskTier } from '../types';
import { formatRiskLevel } from '../utils';

/** Current review issues, indexed by file path */
let issuesByFile = new Map<string, ReviewIssue[]>();

/** Diagnostic collection for squiggles and Problems panel */
let diagnosticCollection: vscode.DiagnosticCollection | undefined;

/** Decoration types for each risk tier (gutter icons + after-line text) */
let highDecorationType: vscode.TextEditorDecorationType | undefined;
let mediumDecorationType: vscode.TextEditorDecorationType | undefined;
let lowDecorationType: vscode.TextEditorDecorationType | undefined;

/** CodeLens provider disposable */
let codeLensDisposable: vscode.Disposable | undefined;

/** Hover provider disposable */
let hoverDisposable: vscode.Disposable | undefined;

/** Editor change listener */
let editorChangeDisposable: vscode.Disposable | undefined;

/** Tier icons for gutter */
const TIER_ICONS: Record<RiskTier, string> = {
  high: '🔴',
  medium: '🟡',
  low: '🟢',
};

/** Tier to diagnostic severity mapping */
const TIER_SEVERITY: Record<RiskTier, vscode.DiagnosticSeverity> = {
  high: vscode.DiagnosticSeverity.Error,
  medium: vscode.DiagnosticSeverity.Warning,
  low: vscode.DiagnosticSeverity.Information,
};

/**
 * Initializes all UI surfaces. Must be called once during extension activation.
 *
 * @returns Array of disposables to clean up all surfaces
 */
export function initSurfaces(): vscode.Disposable[] {
  const disposables: vscode.Disposable[] = [];

  diagnosticCollection = vscode.languages.createDiagnosticCollection('agentwatch');
  disposables.push(diagnosticCollection);

  highDecorationType = createDecorationType('high');
  mediumDecorationType = createDecorationType('medium');
  lowDecorationType = createDecorationType('low');
  disposables.push(highDecorationType, mediumDecorationType, lowDecorationType);

  codeLensDisposable = vscode.languages.registerCodeLensProvider(
    { scheme: '*' },
    { provideCodeLenses },
  );
  disposables.push(codeLensDisposable);

  hoverDisposable = vscode.languages.registerHoverProvider(
    { scheme: '*' },
    { provideHover },
  );
  disposables.push(hoverDisposable);

  editorChangeDisposable = vscode.window.onDidChangeActiveTextEditor((editor) => {
    if (editor) {
      applyDecorationsToEditor(editor);
    }
  });
  disposables.push(editorChangeDisposable);

  return disposables;
}

/**
 * Updates all surfaces with the given review issues.
 * Replaces any existing issues completely.
 *
 * @param issues - All review issues to display
 */
export function updateIssues(issues: ReviewIssue[]): void {
  issuesByFile.clear();

  for (const issue of issues) {
    const existing = issuesByFile.get(issue.file) ?? [];
    existing.push(issue);
    issuesByFile.set(issue.file, existing);
  }

  updateDiagnostics();
  updateDecorations();
}

/**
 * Adds issues for a single file without clearing other files.
 * Used for incremental per-file updates during review.
 *
 * @param filePath - Relative file path
 * @param issues - Issues found for this file
 */
export function addFileIssues(filePath: string, issues: ReviewIssue[]): void {
  issuesByFile.set(filePath, issues);
  updateDiagnostics();
  updateDecorations();
}

/**
 * Returns all current issues.
 */
export function getAllIssues(): ReviewIssue[] {
  const all: ReviewIssue[] = [];
  for (const issues of issuesByFile.values()) {
    all.push(...issues);
  }
  return all;
}

/**
 * Returns the total number of issues across all files.
 */
export function getIssueCount(): number {
  let count = 0;
  for (const issues of issuesByFile.values()) {
    count += issues.length;
  }
  return count;
}

/**
 * Clears all surfaces — removes diagnostics, decorations, and resets state.
 */
export function clearAll(): void {
  issuesByFile.clear();
  diagnosticCollection?.clear();
  clearDecorations();
}

/**
 * Creates a decoration type for a given risk tier.
 */
function createDecorationType(tier: RiskTier): vscode.TextEditorDecorationType {
  const color = tier === 'high' ? '#ff4444' : tier === 'medium' ? '#ffaa00' : '#44bb44';

  return vscode.window.createTextEditorDecorationType({
    gutterIconPath: undefined, // gutter icons use emoji in the after text
    after: {
      margin: '0 0 0 2em',
      color: new vscode.ThemeColor('editorCodeLens.foreground'),
    },
    overviewRulerColor: color,
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    isWholeLine: true,
  });
}

/**
 * Updates the diagnostic collection with current issues.
 */
function updateDiagnostics(): void {
  if (!diagnosticCollection) return;

  diagnosticCollection.clear();

  for (const [filePath, issues] of issuesByFile) {
    const uri = resolveFileUri(filePath);
    if (!uri) continue;

    const diagnostics = issues.map((issue) => {
      const range = new vscode.Range(
        Math.max(0, issue.line - 1), 0,
        Math.max(0, issue.line - 1), Number.MAX_SAFE_INTEGER,
      );

      const diagnostic = new vscode.Diagnostic(
        range,
        `${TIER_ICONS[issue.tier]} ${issue.title}`,
        TIER_SEVERITY[issue.tier],
      );
      diagnostic.source = 'AgentWatch';
      diagnostic.message = `${issue.title}\n\n${issue.explanation}`;
      return diagnostic;
    });

    diagnosticCollection.set(uri, diagnostics);
  }
}

/**
 * Updates decorations for all visible editors.
 */
function updateDecorations(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    applyDecorationsToEditor(editor);
  }
}

/**
 * Clears decorations from all visible editors.
 */
function clearDecorations(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    if (highDecorationType) editor.setDecorations(highDecorationType, []);
    if (mediumDecorationType) editor.setDecorations(mediumDecorationType, []);
    if (lowDecorationType) editor.setDecorations(lowDecorationType, []);
  }
}

/**
 * Applies decorations for a specific editor based on its file's issues.
 */
function applyDecorationsToEditor(editor: vscode.TextEditor): void {
  const filePath = vscode.workspace.asRelativePath(editor.document.uri);
  const issues = issuesByFile.get(filePath) ?? [];

  const highDecos: vscode.DecorationOptions[] = [];
  const mediumDecos: vscode.DecorationOptions[] = [];
  const lowDecos: vscode.DecorationOptions[] = [];

  for (const issue of issues) {
    const line = Math.max(0, issue.line - 1);
    const range = new vscode.Range(line, 0, line, Number.MAX_SAFE_INTEGER);

    const decoration: vscode.DecorationOptions = {
      range,
      renderOptions: {
        after: {
          contentText: `  ${TIER_ICONS[issue.tier]} ${issue.title}`,
        },
      },
      hoverMessage: buildHoverMarkdown(issue),
    };

    switch (issue.tier) {
      case 'high': highDecos.push(decoration); break;
      case 'medium': mediumDecos.push(decoration); break;
      case 'low': lowDecos.push(decoration); break;
    }
  }

  if (highDecorationType) editor.setDecorations(highDecorationType, highDecos);
  if (mediumDecorationType) editor.setDecorations(mediumDecorationType, mediumDecos);
  if (lowDecorationType) editor.setDecorations(lowDecorationType, lowDecos);
}

/**
 * CodeLens provider: shows one-line risk summary above each flagged block.
 */
function provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
  const filePath = vscode.workspace.asRelativePath(document.uri);
  const issues = issuesByFile.get(filePath);
  if (!issues || issues.length === 0) return [];

  return issues.map((issue) => {
    const line = Math.max(0, issue.line - 1);
    const range = new vscode.Range(line, 0, line, 0);

    return new vscode.CodeLens(range, {
      title: `${TIER_ICONS[issue.tier]} AgentWatch: ${issue.title}`,
      command: 'agentWatch.showIssueDetail',
      arguments: [issue],
    });
  });
}

/**
 * Hover provider: shows rich markdown tooltip on flagged lines.
 */
function provideHover(
  document: vscode.TextDocument,
  position: vscode.Position,
): vscode.Hover | undefined {
  const filePath = vscode.workspace.asRelativePath(document.uri);
  const issues = issuesByFile.get(filePath);
  if (!issues) return undefined;

  const lineIssues = issues.filter((i) => i.line - 1 === position.line);
  if (lineIssues.length === 0) return undefined;

  const markdownParts = lineIssues.map(buildHoverMarkdown);
  const combined = new vscode.MarkdownString(
    markdownParts.map((m) => m.value).join('\n\n---\n\n'),
  );
  combined.isTrusted = true;

  return new vscode.Hover(combined);
}

/**
 * Builds a rich markdown hover tooltip for a single issue.
 */
function buildHoverMarkdown(issue: ReviewIssue): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;

  md.appendMarkdown(`**${TIER_ICONS[issue.tier]} AgentWatch — ${formatRiskLevel(issue.tier)}**\n\n`);
  md.appendMarkdown(`${issue.explanation}\n`);

  return md;
}

/**
 * Resolves a relative file path to a VS Code URI.
 */
function resolveFileUri(filePath: string): vscode.Uri | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return undefined;
  return vscode.Uri.joinPath(folders[0].uri, filePath);
}

/**
 * Resets module state. Used for testing.
 */
export function resetState(): void {
  issuesByFile.clear();
  diagnosticCollection = undefined;
  highDecorationType = undefined;
  mediumDecorationType = undefined;
  lowDecorationType = undefined;
  codeLensDisposable = undefined;
  hoverDisposable = undefined;
  editorChangeDisposable = undefined;
}
