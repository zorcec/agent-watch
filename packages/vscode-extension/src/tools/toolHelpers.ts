import * as vscode from 'vscode';

/**
 * Opens a .diagram file by its absolute filesystem path and returns the
 * TextDocument. Returns an error string if the file cannot be opened.
 *
 * Use this in every mutating tool `invoke` method so the agent always
 * specifies which file to operate on — no active editor required.
 */
export async function openDiagramDocument(
  filePath: string,
): Promise<{ doc: vscode.TextDocument } | { error: string }> {
  const uri = vscode.Uri.file(filePath);
  try {
    const doc = await vscode.workspace.openTextDocument(uri);
    return { doc };
  } catch {
    return {
      error: `Cannot open file: ${filePath}. Make sure the path exists and is a .diagram file.`,
    };
  }
}

/** Extracts the filename from a full path for use in invocation messages. */
export function fileNameFromPath(filePath: string): string {
  return filePath.split('/').pop() ?? filePath;
}
