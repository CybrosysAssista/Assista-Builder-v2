import * as path from 'path';
import * as fs from 'fs/promises';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { validateWorkspacePath, resolveWorkspacePath } from './toolUtils.js';

interface FileEntry {
  path: string;
  line_ranges?: string[]; // Format: "start-end"
  should_read_entire_file?: boolean; // Explicitly read entire file
  offset?: number; // Start reading from this line (1-indexed)
  limit?: number; // Number of lines to read
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
 * Check if file is binary or image
 */
function isBinaryFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.bmp'];
  const binaryExts = ['.pdf', '.zip', '.tar', '.gz', '.exe', '.dll', '.so', '.dylib'];
  return imageExts.includes(ext) || binaryExts.includes(ext);
}

/**
 * Check if file is a Jupyter notebook
 */
function isNotebookFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.ipynb';
}

/**
 * Read file tool - supports multiple files and line ranges
 */
export const readFileTool: ToolDefinition = {
  name: 'read_file',
  description: 'Read one or more files and return their contents with line numbers. Supports reading entire files, specific line ranges, or chunks. For large files (>2000 lines), consider using line_ranges or offset/limit. Images, PDFs, and binary files are not supported - use appropriate tools for those. Line numbers are formatted as LINE_NUMBER|LINE_CONTENT. You can optionally specify offset and limit for chunked reading, or line_ranges for non-contiguous sections.',
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
            should_read_entire_file: {
              type: 'boolean',
              description: 'Whether to read the entire file. Defaults to true if no line_ranges, offset, or limit are specified. For large files, consider using line_ranges or offset/limit instead.',
              default: true,
            },
            offset: {
              type: 'number',
              description: 'The line number to start reading from (1-indexed, inclusive). Only provide if the file is too large to read at once.',
            },
            limit: {
              type: 'number',
              description: 'The number of lines to read. Only provide if the file is too large to read at once. Defaults to 2000 lines if not specified.',
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

      const results: Array<{ path: string; content: string; error?: string; warning?: string }> = [];

      for (const fileEntry of args.files) {
        const { path: filePath, line_ranges, should_read_entire_file, offset, limit } = fileEntry;

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

          // Check for binary/image files
          if (isBinaryFile(fullPath)) {
            results.push({
              path: filePath,
              content: '',
              error: `Binary or image file cannot be read as text: ${filePath}. Use appropriate tools for images/PDFs.`,
            });
            continue;
          }

          // Check for notebook files (could add support later)
          if (isNotebookFile(fullPath)) {
            results.push({
              path: filePath,
              content: '',
              error: `Jupyter notebook files (.ipynb) are not yet supported: ${filePath}`,
            });
            continue;
          }

          let content: string;
          const fileContent = await fs.readFile(fullPath, 'utf-8');
          const lines = fileContent.split(/\r?\n/);
          const totalLines = lines.length;

          // Warn about large files
          if (totalLines > 2000 && should_read_entire_file !== false && !line_ranges && !offset) {
            // Still read, but note it's large
          }

          if (line_ranges && line_ranges.length > 0) {
            // Read specific line ranges
            content = await readLineRanges(fullPath, line_ranges);
          } else if (offset !== undefined) {
            // Read chunk using offset and limit
            const startIdx = Math.max(0, offset - 1); // Convert to 0-based
            const endIdx = limit !== undefined
              ? Math.min(lines.length, startIdx + limit)
              : Math.min(lines.length, startIdx + 2000); // Default 2000 lines

            const selectedLines = lines.slice(startIdx, endIdx);
            content = selectedLines.map((line, idx) => `${startIdx + idx + 1}|${line}`).join('\n');
          } else {
            // Read entire file (or up to limit if specified)
            const linesToRead = limit !== undefined ? lines.slice(0, limit) : lines;
            content = linesToRead.map((line, idx) => `${idx + 1}|${line}`).join('\n');

            if (limit !== undefined && lines.length > limit) {
              content += `\n... (file has ${totalLines} total lines, showing first ${limit})`;
            }
          }

          results.push({
            path: filePath,
            content,
            ...(totalLines > 2000 ? { warning: `Large file: ${totalLines} lines. Consider using line_ranges or offset/limit for better performance.` } : {}),
          });
        } catch (error) {
          // Check if it's an encoding error (likely binary file)
          if (error instanceof Error && error.message.includes('encoding')) {
            results.push({
              path: filePath,
              content: '',
              error: `File appears to be binary or not UTF-8 encoded: ${filePath}`,
            });
          } else {
            results.push({
              path: filePath,
              content: '',
              error: error instanceof Error ? error.message : String(error),
            });
          }
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

