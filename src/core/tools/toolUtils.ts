import * as vscode from 'vscode';
import * as path from 'path';
import Ajv from 'ajv';
import type { ToolDefinition, ToolResult } from '../agent/types.js';

const ajv = new Ajv({ allErrors: true });

// File locking map to prevent concurrent writes
const fileLocks = new Map<string, Promise<ToolResult>>();

/**
 * Validate tool arguments against JSON schema
 */
export function validateToolArgs(tool: ToolDefinition, args: any): { valid: boolean; errors?: string[] } {
  try {
    const validate = ajv.compile(tool.jsonSchema);
    const valid = validate(args);

    if (!valid && validate.errors) {
      const errors = validate.errors.map(err => {
        const path = (err as any).instancePath || err.schemaPath || 'root';
        return `${path} ${err.message}`;
      });
      return { valid: false, errors };
    }

    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)]
    };
  }
}

/**
 * Safe JSON parsing with fallback
 */
export function safeParseJson(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    // If parsing fails, return as-is (might be a string argument)
    return str;
  }
}

/**
 * Validate workspace path and prevent directory traversal
 */
export function validateWorkspacePath(filePath: string): boolean {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    return false;
  }

  const workspaceRoot = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const resolvedPath = path.resolve(workspaceRoot, filePath);
  const normalizedWorkspace = path.normalize(workspaceRoot);
  const normalizedResolved = path.normalize(resolvedPath);

  // Check if resolved path is within workspace
  if (!normalizedResolved.startsWith(normalizedWorkspace)) {
    return false;
  }

  // Prevent directory traversal
  if (filePath.includes('..')) {
    return false;
  }

  return true;
}

/**
 * Execute tool with file locking for write operations
 */
export async function executeToolWithLock(
  tool: ToolDefinition,
  args: any
): Promise<ToolResult> {
  // Check if this is a write operation that needs locking
  const writeTools = ['writeFileTool', 'write_to_file', 'applyPatchTool', 'apply_diff'];
  const needsLock = writeTools.includes(tool.name) && args.path;

  if (needsLock) {
    const lockKey = args.path;

    // Wait for any existing lock on this file
    if (fileLocks.has(lockKey)) {
      await fileLocks.get(lockKey);
    }

    // Create new lock
    const lockPromise = (async () => {
      try {
        return await tool.execute(args);
      } finally {
        fileLocks.delete(lockKey);
      }
    })();

    fileLocks.set(lockKey, lockPromise);
    return await lockPromise;
  }

  // No lock needed, execute directly
  return await tool.execute(args);
}

/**
 * Get workspace root path
 */
export function getWorkspaceRoot(): string {
  if (!vscode.workspace.workspaceFolders || vscode.workspace.workspaceFolders.length === 0) {
    throw new Error('No workspace folder found');
  }
  return vscode.workspace.workspaceFolders[0].uri.fsPath;
}

/**
 * Resolve file path relative to workspace
 */
export function resolveWorkspacePath(filePath: string): string {
  const workspaceRoot = getWorkspaceRoot();
  return path.resolve(workspaceRoot, filePath);
}

