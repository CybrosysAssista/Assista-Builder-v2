/**
 * AI Tool Service – Bridge between AI agent and workspace filesystem
 */
import * as vscode from 'vscode';
import * as path from 'path';
import { readFileContent, writeFileContent as writeFileContentFs, ensureDirectory } from './fileService.js';

export interface ToolResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
}

/** Resolve workspace root safely */
function getWorkspaceRoot(): vscode.Uri | null {
  const folder = vscode.workspace.workspaceFolders?.[0];
  return folder ? folder.uri : null;
}

/** List all files under workspace (optionally filtered) */
export async function listFiles(
  basePath?: string,
  filterExts?: string[]
): Promise<ToolResponse<string[]>> {
  try {
    const root = getWorkspaceRoot();
    if (!root) return { success: false, error: 'No workspace open' };

    const result: string[] = [];

    const shouldInclude = (name: string) =>
      !filterExts || filterExts.length === 0 || filterExts.some(ext => name.toLowerCase().endsWith(ext.toLowerCase()));

    const walk = async (dir: vscode.Uri) => {
      const entries = await vscode.workspace.fs.readDirectory(dir);
      for (const [name, type] of entries) {
        const uri = vscode.Uri.joinPath(dir, name);
        if (type === vscode.FileType.Directory) {
          await walk(uri);
        } else {
          if (shouldInclude(name)) {
            const rel = path.relative(root.fsPath, uri.fsPath);
            result.push(rel);
          }
        }
      }
    };
    await walk(root);
    return { success: true, data: result };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Get file content (relative to workspace root) */
export async function getFileContent(relPath: string): Promise<ToolResponse<string>> {
  try {
    const root = getWorkspaceRoot();
    if (!root) return { success: false, error: 'No workspace open' };
    const fileUri = vscode.Uri.joinPath(root, relPath);
    const data = await readFileContent(fileUri);
    return { success: true, data };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Write content to a file (creates folders if needed) */
export async function writeFileContent(relPath: string, content: string): Promise<ToolResponse> {
  try {
    const root = getWorkspaceRoot();
    if (!root) return { success: false, error: 'No workspace open' };
    const fileUri = vscode.Uri.joinPath(root, relPath);
    const segments = relPath.split(/[\\/]+/).filter(Boolean);
    const dirUri = segments.length > 1 ? vscode.Uri.joinPath(root, ...segments.slice(0, -1)) : root;
    await ensureDirectory(dirUri);
    await writeFileContentFs(fileUri, content);
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

/** Search text across project */
export async function searchInProject(
  query: string
): Promise<ToolResponse<{ path: string; line: number; match: string }[]>> {
  try {
    const root = getWorkspaceRoot();
    if (!root) return { success: false, error: 'No workspace open' };
    const filesRes = await listFiles(undefined, ['.py', '.xml']);
    if (!filesRes.success || !filesRes.data) {
      return { success: false, error: filesRes.error || 'No files found' };
    }

    const results: { path: string; line: number; match: string }[] = [];

    for (const rel of filesRes.data) {
      const fileRes = await getFileContent(rel);
      if (!fileRes.success || !fileRes.data) continue;

      const lines = fileRes.data.split('\n');
      lines.forEach((line, i) => {
        if (line.includes(query)) results.push({ path: rel, line: i + 1, match: line.trim() });
      });
    }

    return { success: true, data: results };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}
