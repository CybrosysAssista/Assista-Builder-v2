import * as path from 'path';
import * as fs from 'fs/promises';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { validateWorkspacePath, resolveWorkspacePath } from './toolUtils.js';

interface WriteFileArgs {
  path: string;
  content: string;
  line_count: number;
}

/**
 * Write file tool - creates or overwrites file with content
 */
export const writeFileTool: ToolDefinition = {
  name: 'write_to_file',
  description: 'Create a new file or completely overwrite an existing file with the exact content provided. Use only when a full rewrite is intended; the tool will create missing directories automatically.',
  jsonSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'Path to the file to write, relative to the workspace',
      },
      content: {
        type: 'string',
        description: 'Full contents that the file should contain with no omissions or line numbers',
      },
      line_count: {
        type: 'integer',
        description: 'Total number of lines in the written file, counting blank lines',
      },
    },
    required: ['path', 'content', 'line_count'],
    additionalProperties: false,
  },
  execute: async (args: WriteFileArgs): Promise<ToolResult> => {
    try {
      if (!args.path) {
        return {
          status: 'error',
          error: {
            message: 'write_to_file requires path argument',
            code: 'INVALID_ARGS',
          },
        };
      }

      if (args.content === undefined) {
        return {
          status: 'error',
          error: {
            message: 'write_to_file requires content argument',
            code: 'INVALID_ARGS',
          },
        };
      }

      if (typeof args.line_count !== 'number' || args.line_count < 0) {
        return {
          status: 'error',
          error: {
            message: 'write_to_file requires valid line_count (non-negative integer)',
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

      // Create directory if it doesn't exist
      const dir = path.dirname(fullPath);
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error) {
        return {
          status: 'error',
          error: {
            message: `Failed to create directory: ${error instanceof Error ? error.message : String(error)}`,
            code: 'DIRECTORY_CREATION_ERROR',
          },
        };
      }

      // Write file
      await fs.writeFile(fullPath, args.content, 'utf-8');

      const actualLines = args.content.split(/\r?\n/).length;
      return {
        status: 'success',
        result: {
          path: args.path,
          line_count: actualLines,
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

