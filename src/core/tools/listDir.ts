import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { getWorkspaceRoot, validateWorkspacePath, resolveWorkspacePath } from './toolUtils.js';

interface ListDirArgs {
  DirectoryPath: string;
}

/**
 * List directory tool
 */
export const listDirTool: ToolDefinition = {
  name: 'list_dir',
  description: 'Lists files and directories in a given path. The path must be relative to the workspace directory. For each item in the directory, output will have: relative path to the file or directory, and size in bytes if file or number of items if directory. You should generally prefer the find_by_name and grep_search tools, if you know which directories to search.',
  jsonSchema: {
    type: 'object',
    properties: {
      DirectoryPath: {
        type: 'string',
        description: 'The path to the directory to list, relative to the workspace directory',
      },
    },
    required: ['DirectoryPath'],
    additionalProperties: false,
  },
  execute: async (args: ListDirArgs): Promise<ToolResult> => {
    try {
      if (!args.DirectoryPath) {
        return {
          status: 'error',
          error: {
            message: 'list_dir requires DirectoryPath argument',
            code: 'INVALID_ARGS',
          },
        };
      }

      // Validate and resolve path (relative to workspace)
      if (!validateWorkspacePath(args.DirectoryPath)) {
        return {
          status: 'error',
          error: {
            message: `Invalid path: ${args.DirectoryPath}. Path must be within workspace and cannot contain ".."`,
            code: 'INVALID_PATH',
          },
        };
      }

      const workspaceRoot = getWorkspaceRoot();
      const fullPath = resolveWorkspacePath(args.DirectoryPath);

      // Check if path exists and is a directory
      let stats;
      try {
        stats = await fs.stat(fullPath);
      } catch {
        return {
          status: 'error',
          error: {
            message: `Directory does not exist: ${args.DirectoryPath}`,
            code: 'NOT_FOUND',
          },
        };
      }

      if (!stats.isDirectory()) {
        return {
          status: 'error',
          error: {
            message: `Path is not a directory: ${args.DirectoryPath}`,
            code: 'NOT_A_DIRECTORY',
          },
        };
      }

      // Read directory contents
      const entries = await fs.readdir(fullPath, { withFileTypes: true });
      
      const items: Array<{
        name: string;
        path: string;
        type: 'file' | 'directory';
        size?: number;
        modified?: number;
      }> = [];

      for (const entry of entries) {
        const entryFullPath = path.join(fullPath, entry.name);
        const relativePath = path.relative(workspaceRoot, entryFullPath).replace(/\\/g, '/');
        
        try {
          const entryStats = await fs.stat(entryFullPath);
          
          if (entry.isFile()) {
            items.push({
              name: entry.name,
              path: relativePath,
              type: 'file',
              size: entryStats.size,
              modified: entryStats.mtimeMs,
            });
          } else if (entry.isDirectory()) {
            // Count items in directory (non-recursive for performance)
            try {
              const dirContents = await fs.readdir(entryFullPath);
              items.push({
                name: entry.name,
                path: relativePath,
                type: 'directory',
                size: dirContents.length,
                modified: entryStats.mtimeMs,
              });
            } catch {
              items.push({
                name: entry.name,
                path: relativePath,
                type: 'directory',
                modified: entryStats.mtimeMs,
              });
            }
          }
        } catch {
          // Skip entries we can't stat
          continue;
        }
      }

      // Sort: directories first, then files, both alphabetically
      items.sort((a, b) => {
        if (a.type !== b.type) {
          return a.type === 'directory' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
      });

      return {
        status: 'success',
        result: {
          directory: fullPath,
          items,
          count: items.length,
        },
      };
    } catch (error) {
      return {
        status: 'error',
        error: {
          message: error instanceof Error ? error.message : String(error),
          code: 'EXECUTION_ERROR',
        },
      };
    }
  },
};

