import * as path from 'path';
import * as fs from 'fs/promises';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { validateWorkspacePath, resolveWorkspacePath } from './toolUtils.js';

interface FileEntry {
  path: string;
  line_ranges?: string[]; // Format: "start-end"
}

interface ReadFileArgs {
  files: FileEntry[];
}

/**
 * Parse line range string "start-end" to { start, end }
 */
function parseLineRange(rangeStr: string): { start: number; end: number } | null {
  const match = rangeStr.match(/^(\d+)-(\d+)$/);
  if (!match) { return null; }

  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);

  if (isNaN(start) || isNaN(end) || start < 1 || end < 1 || start > end) {
    return null;
  }

  return { start, end };
}

/**
 * Read specific line ranges from a file
 */
async function readLineRanges(filePath: string, ranges: string[]): Promise<string> {
  const content = await fs.readFile(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);

  const selectedLines: string[] = [];

  for (const rangeStr of ranges) {
    const range = parseLineRange(rangeStr);
    if (!range) { continue; }

    // Convert to 0-based index
    const startIdx = range.start - 1;
    const endIdx = Math.min(range.end, lines.length);

    for (let i = startIdx; i < endIdx; i++) {
      const lineNum = i + 1;
      selectedLines.push(`${lineNum}|${lines[i]}`);
    }
  }

  return selectedLines.join('\n');
}

/**
 * Read file tool - supports multiple files and line ranges
 */
export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read one or more files and return their contents with line numbers for diffing or discussion. Structure: { files: [{ path: "relative/path.ts", line_ranges: ["1-50", "100-150"] }] }. The "path" is required and relative to workspace. The "line_ranges" is optional for reading specific sections (format: "start-end", 1-based inclusive). Example single file: { files: [{ path: "src/app.ts" }] }. Example with line ranges: { files: [{ path: "src/app.ts", line_ranges: ["1-50", "100-150"] }] }. Example multiple files: { files: [{ path: "file1.ts", line_ranges: ["1-50"] }, { path: "file2.ts" }] }',
  jsonSchema: {
    type: 'object',
    properties: {
      files: {
        type: 'array',
        description: 'List of files to read; request related files together when allowed',
        items: {
          type: 'object',
          properties: {
            path: {
              type: 'string',
              description: 'Path to the file to read, relative to the workspace',
            },
            line_ranges: {
              type: ['array', 'null'],
              description: 'Optional 1-based inclusive ranges to read (format: start-end). Use multiple ranges for non-contiguous sections and keep ranges tight to the needed context.',
              items: {
                type: 'string',
                pattern: '^[0-9]+-[0-9]+$',
              },
            },
          },
          required: ['path'],
          additionalProperties: false,
        },
        minItems: 1,
      },
    },
    required: ['files'],
    additionalProperties: false,
  },
  execute: async (args: ReadFileArgs): Promise<ToolResult> => {
    try {
      if (!args.files || !Array.isArray(args.files) || args.files.length === 0) {
        return {
          status: 'error',
          error: {
            message: 'read_file requires files array with at least one file',
            code: 'INVALID_ARGS',
          },
        };
      }

      const results: Array<{ path: string; content: string; error?: string }> = [];

      for (const fileEntry of args.files) {
        const { path: filePath, line_ranges } = fileEntry;

        if (!filePath) {
          results.push({
            path: filePath || '<unknown>',
            content: '',
            error: 'Missing path',
          });
          continue;
        }

        // Validate path
        if (!validateWorkspacePath(filePath)) {
          results.push({
            path: filePath,
            content: '',
            error: `Invalid path: ${filePath}. Path must be within workspace and cannot contain ".."`,
          });
          continue;
        }

        try {
          const fullPath = resolveWorkspacePath(filePath);

          // Check if file exists
          try {
            await fs.access(fullPath);
          } catch {
            results.push({
              path: filePath,
              content: '',
              error: `File not found: ${filePath}`,
            });
            continue;
          }

          let content: string;

          if (line_ranges && line_ranges.length > 0) {
            // Read specific line ranges
            content = await readLineRanges(fullPath, line_ranges);
          } else {
            // Read entire file
            const fileContent = await fs.readFile(fullPath, 'utf-8');
            const lines = fileContent.split(/\r?\n/);
            // Add line numbers
            content = lines.map((line, idx) => `${idx + 1}|${line}`).join('\n');
          }

          results.push({
            path: filePath,
            content,
          });
        } catch (error) {
          results.push({
            path: filePath,
            content: '',
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }

      return {
        status: 'success',
        result: {
          files: results,
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

