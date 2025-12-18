import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { getWorkspaceRoot, resolveWorkspacePath, validateWorkspacePath } from './toolUtils.js';

interface GlobFileSearchArgs {
  glob_pattern: string;
  target_directory?: string;
}

/**
 * Simple glob pattern matcher
 */
function matchesGlob(filePath: string, pattern: string): boolean {
  // Normalize pattern - add **/ prefix if not present
  let normalizedPattern = pattern;
  if (!pattern.startsWith('**/') && !pattern.startsWith('/')) {
    normalizedPattern = `**/${pattern}`;
  }
  
  // Convert glob pattern to regex
  let regexStr = normalizedPattern
    .replace(/\./g, '\\.')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*')
    .replace(/\?/g, '.');
  
  // Handle negation patterns starting with !
  if (pattern.startsWith('!')) {
    const positivePattern = pattern.slice(1);
    return !matchesGlob(filePath, positivePattern);
  }
  
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}

/**
 * Recursively find files matching glob pattern
 */
async function findFilesByGlob(
  dirPath: string,
  pattern: string,
  results: string[],
  workspaceRoot: string,
  maxResults: number = 100
): Promise<void> {
  if (results.length >= maxResults) {
    return;
  }

  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      if (results.length >= maxResults) {
        break;
      }

      const fullPath = path.join(dirPath, entry.name);
      const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
      
      // Skip common ignore patterns
      if (entry.name.startsWith('.') && entry.name !== '.') {
        continue;
      }
      if (entry.name === 'node_modules' || entry.name === '__pycache__' || entry.name === '.git') {
        continue;
      }
      
      if (entry.isDirectory()) {
        await findFilesByGlob(fullPath, pattern, results, workspaceRoot, maxResults);
      } else if (entry.isFile()) {
        // Check if file matches glob pattern
        if (matchesGlob(relativePath, pattern) || matchesGlob(entry.name, pattern)) {
          results.push(relativePath);
        }
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
}

/**
 * Glob file search tool - fast glob pattern file search
 */
export const globFileSearchTool: ToolDefinition = {
  name: 'glob_file_search',
  description: 'Fast file search based on glob patterns. Works fast with codebases of any size. Returns matching file paths sorted by modification time. Use this tool when you need to find files by name patterns. Examples: "*.py" finds all Python files, "**/*.tsx" finds all TSX files recursively, "src/**/*.ts" finds TypeScript files in src directory.',
  jsonSchema: {
    type: 'object',
    properties: {
      glob_pattern: {
        type: 'string',
        description: 'The glob pattern to match files against. Patterns not starting with "**/" are automatically prepended with "**/" to enable recursive searching. Examples: "*.js" (becomes "**/*.js"), "**/test/**/*.ts", "src/**/*.py"',
      },
      target_directory: {
        type: 'string',
        description: 'Path to directory to search for files in, relative to the workspace directory. If not provided, defaults to workspace root.',
      },
    },
    required: ['glob_pattern'],
    additionalProperties: false,
  },
  execute: async (args: GlobFileSearchArgs): Promise<ToolResult> => {
    try {
      if (!args.glob_pattern || !args.glob_pattern.trim()) {
        return {
          status: 'error',
          error: {
            message: 'glob_file_search requires glob_pattern argument',
            code: 'INVALID_ARGS',
          },
        };
      }

      const workspaceRoot = getWorkspaceRoot();
      let searchDir: string;
      
      if (args.target_directory) {
        if (!validateWorkspacePath(args.target_directory)) {
          return {
            status: 'error',
            error: {
              message: `Invalid path: ${args.target_directory}. Path must be within workspace and cannot contain ".."`,
              code: 'INVALID_PATH',
            },
          };
        }
        searchDir = resolveWorkspacePath(args.target_directory);
      } else {
        searchDir = workspaceRoot;
      }

      // Validate search directory exists
      try {
        const stats = await fs.stat(searchDir);
        if (!stats.isDirectory()) {
          return {
            status: 'error',
            error: {
              message: `Path is not a directory: ${searchDir}`,
              code: 'NOT_A_DIRECTORY',
            },
          };
        }
      } catch {
        return {
          status: 'error',
          error: {
            message: `Directory does not exist: ${searchDir}`,
            code: 'NOT_FOUND',
          },
        };
      }

      const results: string[] = [];
      await findFilesByGlob(searchDir, args.glob_pattern.trim(), results, workspaceRoot, 100);

      // Sort by modification time (most recent first)
      const filesWithTime: Array<{ path: string; mtime: number }> = [];
      for (const filePath of results) {
        try {
          const fullPath = resolveWorkspacePath(filePath);
          const stats = await fs.stat(fullPath);
          filesWithTime.push({
            path: filePath,
            mtime: stats.mtimeMs,
          });
        } catch {
          // Skip files we can't stat
          continue;
        }
      }

      filesWithTime.sort((a, b) => b.mtime - a.mtime);
      const sortedPaths = filesWithTime.map(f => f.path);

      return {
        status: 'success',
        result: {
          files: sortedPaths,
          count: sortedPaths.length,
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

