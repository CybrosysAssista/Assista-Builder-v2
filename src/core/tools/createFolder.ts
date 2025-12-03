import * as path from 'path';
import * as fs from 'fs/promises';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { validateWorkspacePath, resolveWorkspacePath } from './toolUtils.js';

interface CreateFolderArgs {
  path: string;
}

/**
 * Create folder tool
 */
export const createFolderTool: ToolDefinition = {
  name: 'create_folder',
  description: 'Create a folder (directory) at the specified path. Creates parent directories if they do not exist.',
  jsonSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path to the folder to create, relative to the workspace',
      },
    },
    required: ['path'],
    additionalProperties: false,
  },
  execute: async (args: CreateFolderArgs): Promise<ToolResult> => {
    try {
      if (!args.path) {
        return {
          status: 'error',
          error: {
            message: 'create_folder requires path argument',
            code: 'INVALID_ARGS',
          },
        };
      }

      // Validate path
      if (!validateWorkspacePath(args.path)) {
        return {
          status: 'error',
          error: {
            message: `Invalid path: ${args.path}. Path must be within workspace and cannot contain ".."`,
            code: 'INVALID_PATH',
          },
        };
      }

      const fullPath = resolveWorkspacePath(args.path);

      // Check if already exists
      try {
        const stats = await fs.stat(fullPath);
        if (stats.isDirectory()) {
          return {
            status: 'success',
            result: {
              path: args.path,
              message: 'Folder already exists',
            },
          };
        } else {
          return {
            status: 'error',
            error: {
              message: `Path exists but is not a directory: ${args.path}`,
              code: 'PATH_EXISTS',
            },
          };
        }
      } catch {
        // Path doesn't exist, create it
      }

      // Create directory (recursive)
      await fs.mkdir(fullPath, { recursive: true });

      return {
        status: 'success',
        result: {
          path: args.path,
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

