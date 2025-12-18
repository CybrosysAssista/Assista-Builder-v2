import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { getWorkspaceRoot, resolveWorkspacePath, validateWorkspacePath } from './toolUtils.js';

interface FindByNameArgs {
  SearchDirectory: string;
  Pattern: string;
  Type?: 'file' | 'directory' | 'any';
  Extensions?: string[];
  MaxDepth?: number;
  Excludes?: string[];
  FullPath?: boolean;
}

/**
 * Simple glob pattern matcher
 */
function matchesGlob(name: string, pattern: string): boolean {
  // Convert glob pattern to regex
  let regexStr = pattern
    .replace(/\./g, '\\.')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  
  // Handle ** pattern
  regexStr = regexStr.replace(/\*\*/g, '.*');
  
  // Handle negation patterns starting with !
  if (pattern.startsWith('!')) {
    const positivePattern = pattern.slice(1);
    return !matchesGlob(name, positivePattern);
  }
  
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(name);
}

/**
 * Check if path matches any exclude pattern
 */
function matchesExcludes(relativePath: string, excludes: string[]): boolean {
  return excludes.some(pattern => matchesGlob(relativePath, pattern));
}

/**
 * Recursively find files/directories matching pattern
 */
async function findMatching(
  dirPath: string,
  pattern: string,
  type: 'file' | 'directory' | 'any',
  extensions: string[] | undefined,
  maxDepth: number,
  currentDepth: number,
  excludes: string[],
  fullPath: boolean,
  results: Array<{ path: string; type: 'file' | 'directory'; size?: number; modified?: number }>,
  workspaceRoot: string
): Promise<void> {
  if (currentDepth > maxDepth) {
    return;
  }

  if (results.length >= 50) {
    return; // Cap at 50 results
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (results.length >= 50) {
        break;
      }

      const entryFullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(workspaceRoot, entryFullPath).replace(/\\/g, '/');
      
      // Check excludes
      if (excludes.length > 0 && matchesExcludes(relativePath, excludes)) {
        continue;
      }

      // Check if name matches pattern
      const matchesPattern = fullPath 
        ? matchesGlob(relativePath, pattern) || matchesGlob(entry.name, pattern)
        : matchesGlob(entry.name, pattern);

      if (entry.isDirectory()) {
        if (matchesPattern && (type === 'directory' || type === 'any')) {
          try {
            const stats = await fs.stat(entryFullPath);
            results.push({
              path: relativePath,
              type: 'directory',
              modified: stats.mtimeMs,
            });
          } catch {
            // Skip if can't stat
          }
        }
        
        // Recurse into directory
        if (currentDepth < maxDepth) {
          await findMatching(
            entryFullPath,
            pattern,
            type,
            extensions,
            maxDepth,
            currentDepth + 1,
            excludes,
            fullPath,
            results,
            workspaceRoot
          );
        }
      } else if (entry.isFile()) {
        if (matchesPattern && (type === 'file' || type === 'any')) {
          // Check extension filter
          if (extensions && extensions.length > 0) {
            const ext = path.extname(entry.name).slice(1); // Remove leading dot
            if (!extensions.includes(ext)) {
              continue;
            }
          }
          
          try {
            const stats = await fs.stat(entryFullPath);
            results.push({
              path: relativePath,
              type: 'file',
              size: stats.size,
              modified: stats.mtimeMs,
            });
          } catch {
            // Skip if can't stat
          }
        }
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
}

/**
 * Find by name tool
 */
export const findByNameTool: ToolDefinition = {
  name: 'find_by_name',
  description: 'Search for files and subdirectories within a specified directory using glob patterns. Search uses smart case and will ignore gitignored files by default. Pattern and Excludes both use the glob format. If you are searching for Extensions, there is no need to specify both Pattern AND Extensions. To avoid overwhelming output, the results are capped at 50 matches. Use the various arguments to filter the search scope as needed. Results will include the type, size, modification time, and relative path.',
  jsonSchema: {
    type: 'object',
    properties: {
      SearchDirectory: {
        type: 'string',
        description: 'The directory to search within, relative to the workspace directory',
      },
      Pattern: {
        type: 'string',
        description: 'Pattern to search for, supports glob format',
      },
      Excludes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional, exclude files/directories that match the given glob patterns',
      },
      Type: {
        type: 'string',
        enum: ['file', 'directory', 'any'],
        description: 'Optional, type filter, enum=file,directory,any',
      },
      MaxDepth: {
        type: 'integer',
        description: 'Optional, maximum depth to search',
      },
      Extensions: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional, file extensions to include (without leading .), matching paths must match at least one of the included extensions',
      },
      FullPath: {
        type: 'boolean',
        description: 'Optional, whether the full absolute path must match the glob pattern, default: only filename needs to match. Take care when specifying glob patterns with this flag on, e.g when FullPath is on, pattern \'*.py\' will not match to the file \'/foo/bar.py\', but pattern \'**/*.py\' will match.',
      },
    },
    required: ['SearchDirectory', 'Pattern'],
    additionalProperties: false,
  },
  execute: async (args: FindByNameArgs): Promise<ToolResult> => {
    try {
      if (!args.SearchDirectory || !args.Pattern) {
        return {
          status: 'error',
          error: {
            message: 'find_by_name requires SearchDirectory and Pattern arguments',
            code: 'INVALID_ARGS',
          },
        };
      }

      // Validate path
      if (!validateWorkspacePath(args.SearchDirectory)) {
        return {
          status: 'error',
          error: {
            message: `Invalid path: ${args.SearchDirectory}. Path must be within workspace and cannot contain ".."`,
            code: 'INVALID_PATH',
          },
        };
      }

      const searchDir = resolveWorkspacePath(args.SearchDirectory);
      const workspaceRoot = getWorkspaceRoot();
      
      // Check if directory exists
      try {
        const stats = await fs.stat(searchDir);
        if (!stats.isDirectory()) {
          return {
            status: 'error',
            error: {
              message: `Path is not a directory: ${args.SearchDirectory}`,
              code: 'NOT_A_DIRECTORY',
            },
          };
        }
      } catch {
        return {
          status: 'error',
          error: {
            message: `Directory does not exist: ${args.SearchDirectory}`,
            code: 'NOT_FOUND',
          },
        };
      }

      const type = args.Type || 'any';
      const maxDepth = args.MaxDepth ?? 10;
      const excludes = args.Excludes || [];
      const fullPath = args.FullPath || false;

      const results: Array<{ path: string; type: 'file' | 'directory'; size?: number; modified?: number }> = [];

      await findMatching(
        searchDir,
        args.Pattern,
        type,
        args.Extensions,
        maxDepth,
        0,
        excludes,
        fullPath,
        results,
        workspaceRoot
      );

      return {
        status: 'success',
        result: {
          matches: results,
          count: results.length,
          truncated: results.length >= 50,
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

