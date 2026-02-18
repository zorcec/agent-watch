/**
 * Module: workspaceTools.ts
 *
 * Description:
 *   Workspace exploration tools available to the AgentWatch review agent.
 *   These are called by the agent during its agentic review loop when it needs
 *   to inspect files, search for patterns, or understand project structure.
 *
 *   Tools:
 *   - readFile(path): Read any file in the workspace
 *   - searchCode(query, include?): Regex/text search across source files
 *   - listDirectory(path): List contents of a directory
 *
 * Usage (from reviewEngine.ts):
 *   import { executeToolCall } from './workspaceTools';
 *   const result = await executeToolCall('readFile', { path: 'src/auth.ts' });
 */

import * as vscode from 'vscode';

/** Maximum characters read from a single file before truncation */
const MAX_FILE_READ_CHARS = 30_000;

/** Maximum number of search result lines returned */
const MAX_SEARCH_RESULTS = 30;

/**
 * Dispatches a named tool call to the appropriate implementation.
 * Returns a plain string result to be fed back to the LLM.
 *
 * @param name - Tool name: 'readFile' | 'searchCode' | 'listDirectory'
 * @param input - Input arguments as a key-value record
 */
export async function executeToolCall(
  name: string,
  input: Record<string, string>,
): Promise<string> {
  switch (name) {
    case 'readFile':
      return readFile(input.path ?? '');
    case 'searchCode':
      return searchCode(input.query ?? '', input.include);
    case 'listDirectory':
      return listDirectory(input.path ?? '.');
    default:
      return `Unknown tool: ${name}`;
  }
}

/**
 * Reads and returns the full content of a workspace file.
 * Truncates at MAX_FILE_READ_CHARS to prevent context overflow.
 *
 * @param relativePath - Workspace-relative path (e.g. "src/auth.ts")
 */
export async function readFile(relativePath: string): Promise<string> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return 'Error: no workspace open';
  if (!relativePath) return 'Error: path is required';

  try {
    const uri = vscode.Uri.joinPath(folders[0].uri, relativePath);
    const bytes = await vscode.workspace.fs.readFile(uri);
    const content = Buffer.from(bytes).toString('utf-8');

    if (content.length > MAX_FILE_READ_CHARS) {
      return (
        content.slice(0, MAX_FILE_READ_CHARS) +
        `\n\n[... truncated — file is ${content.length} chars total]`
      );
    }
    return content;
  } catch (error) {
    return `Error reading '${relativePath}': ${error}`;
  }
}

/**
 * Searches for a text/regex pattern across workspace source files.
 * Uses findFiles + line-by-line scanning. Returns matching lines with file:line context.
 *
 * @param query - Text or regex pattern to search for
 * @param include - Optional glob to restrict which files to search
 */
export async function searchCode(query: string, include?: string): Promise<string> {
  if (!query) return 'Error: query is required';

  let regex: RegExp;
  try {
    regex = new RegExp(query, 'i');
  } catch {
    // Treat as plain text if the query is not valid regex
    regex = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const files = await vscode.workspace.findFiles(
    include ?? '**/*.{ts,js,tsx,jsx,py,go,java,cs,rs,rb,php,json,yaml,yml}',
    '**/node_modules/**',
  );

  const matches: string[] = [];

  for (const file of files) {
    if (matches.length >= MAX_SEARCH_RESULTS) break;
    try {
      const bytes = await vscode.workspace.fs.readFile(file);
      const content = Buffer.from(bytes).toString('utf-8');
      const lines = content.split('\n');
      const relPath = vscode.workspace.asRelativePath(file);

      for (let i = 0; i < lines.length; i++) {
        if (regex.test(lines[i])) {
          matches.push(`${relPath}:${i + 1}: ${lines[i].trim()}`);
          if (matches.length >= MAX_SEARCH_RESULTS) break;
        }
      }
    } catch {
      // Skip unreadable files silently
    }
  }

  if (matches.length === 0) return `No matches found for: ${query}`;

  const header =
    matches.length === MAX_SEARCH_RESULTS
      ? `Found ${MAX_SEARCH_RESULTS}+ matches for '${query}' (showing first ${MAX_SEARCH_RESULTS}):\n`
      : `Found ${matches.length} match(es) for '${query}':\n`;

  return header + matches.join('\n');
}

/**
 * Lists files and subdirectories at a workspace-relative path.
 * Directories are suffixed with '/'.
 *
 * @param relativePath - Workspace-relative path (e.g. "src" or "." for root)
 */
export async function listDirectory(relativePath: string): Promise<string> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) return 'Error: no workspace open';

  try {
    const uri = vscode.Uri.joinPath(folders[0].uri, relativePath);
    const entries = await vscode.workspace.fs.readDirectory(uri);
    const lines = entries.map(([name, type]) => {
      const suffix = type === vscode.FileType.Directory ? '/' : '';
      return `${name}${suffix}`;
    });
    return `Contents of '${relativePath}':\n${lines.join('\n')}`;
  } catch (error) {
    return `Error listing '${relativePath}': ${error}`;
  }
}
