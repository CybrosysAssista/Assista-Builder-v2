import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { validateWorkspacePath, resolveWorkspacePath } from './toolUtils.js';
import { applyVisualDiff } from '../utils/decorationUtils.js';

interface EditOperation {
  old_string: string;
  new_string: string;
  replace_all?: boolean;
}

interface MultiEditArgs {
  file_path: string;
  edits: EditOperation[];
}

/**
 * Multi-edit tool - makes multiple edits to a single file atomically
 */
export const multiEditTool: ToolDefinition = {
  name: 'multi_edit',
  description: 'Make multiple edits to a single file in one atomic operation. All edits are applied in sequence, and if any edit fails, none are applied. This is more efficient than making multiple separate edits. Each edit contains old_string (must match exactly including whitespace), new_string, and optional replace_all flag. Before using this tool, read the file to understand its current state.',
  jsonSchema: {
    type: 'object',
    properties: {
      file_path: {
        type: 'string',
        description: 'The path to the file to modify, relative to the workspace directory',
      },
      edits: {
        type: 'array',
        description: 'Array of edit operations to perform sequentially on the file',
        items: {
          type: 'object',
          properties: {
            old_string: {
              type: 'string',
              description: 'The text to replace (must match the file contents exactly, including all whitespace and indentation)',
            },
            new_string: {
              type: 'string',
              description: 'The edited text to replace the old_string (must be different from old_string)',
            },
            replace_all: {
              type: 'boolean',
              description: 'Replace all occurrences of old_string. Defaults to false (replace only first occurrence).',
              default: false,
            },
          },
          required: ['old_string', 'new_string'],
          additionalProperties: false,
        },
        minItems: 1,
      },
    },
    required: ['file_path', 'edits'],
    additionalProperties: false,
  },
  execute: async (args: MultiEditArgs): Promise<ToolResult> => {
    try {
      if (!args.file_path || !args.edits || !Array.isArray(args.edits) || args.edits.length === 0) {
        return {
          status: 'error',
          error: {
            message: 'multi_edit requires file_path and edits array with at least one edit',
            code: 'INVALID_ARGS',
          },
        };
      }

      // Validate and resolve path (relative to workspace)
      if (!validateWorkspacePath(args.file_path)) {
        return {
          status: 'error',
          error: {
            message: `Invalid path: ${args.file_path}. Path must be within workspace and cannot contain ".."`,
            code: 'INVALID_PATH',
          },
        };
      }

      const fullPath = resolveWorkspacePath(args.file_path);

      // Check if file exists
      try {
        await fs.access(fullPath);
      } catch {
        return {
          status: 'error',
          error: {
            message: `File does not exist: ${args.file_path}`,
            code: 'NOT_FOUND',
          },
        };
      }

      // Read current file content
      let currentContent = await fs.readFile(fullPath, 'utf-8');
      const originalContent = currentContent;

      // Apply all edits sequentially
      const appliedEdits: Array<{ edit_index: number; success: boolean; error?: string }> = [];

      for (let i = 0; i < args.edits.length; i++) {
        const edit = args.edits[i];

        if (!edit.old_string || !edit.new_string) {
          appliedEdits.push({
            edit_index: i,
            success: false,
            error: 'old_string and new_string are required',
          });
          continue;
        }

        if (edit.old_string === edit.new_string) {
          appliedEdits.push({
            edit_index: i,
            success: false,
            error: 'old_string and new_string must be different',
          });
          continue;
        }

        // Check if old_string exists in current content
        if (!currentContent.includes(edit.old_string)) {
          appliedEdits.push({
            edit_index: i,
            success: false,
            error: `old_string not found in file. Edit ${i + 1} of ${args.edits.length} failed.`,
          });
          // Don't continue - atomic operation means we should fail all
          return {
            status: 'error',
            error: {
              message: `Edit ${i + 1} failed: old_string not found in file. All edits were rolled back. Applied ${appliedEdits.filter(e => e.success).length} of ${i} edits before failure.`,
              code: 'EDIT_FAILED',
            },
          };
        }

        // Apply edit
        if (edit.replace_all) {
          // Replace all occurrences
          const regex = new RegExp(edit.old_string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
          currentContent = currentContent.replace(regex, edit.new_string);
        } else {
          // Replace first occurrence only
          currentContent = currentContent.replace(edit.old_string, edit.new_string);
        }

        appliedEdits.push({
          edit_index: i,
          success: true,
        });
      }

      // Apply changes with visual diff and review
      await applyVisualDiff(fullPath, currentContent, 'Agent edited', originalContent);

      return {
        status: 'success',
        result: {
          file: args.file_path,
          edits_applied: appliedEdits.length,
          total_edits: args.edits.length,
          applied_edits: appliedEdits,
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

