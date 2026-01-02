import * as fs from 'fs/promises';
import * as path from 'path';
import * as vscode from 'vscode';

import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { validateWorkspacePath, resolveWorkspacePath } from './toolUtils.js';
import { applyVisualDiff, getCleanContent } from '../utils/decorationUtils.js';

interface ApplyDiffArgs {
  path: string;
  diff: string;
}

/**
 * Parse search/replace blocks from diff string
 */
interface SearchReplaceBlock {
  startLine: number;
  searchContent: string;
  replaceContent: string;
}

/**
 * Find the line index where searchContent appears in lines array
 * Returns the starting line index, or -1 if not found
 */
function findContentInLines(lines: string[], searchLines: string[], hintLine: number, searchRadius: number = 50): number {
  const hintIdx = hintLine - 1; // Convert to 0-based

  // First, try exact match at hint location
  if (hintIdx >= 0 && hintIdx < lines.length) {
    let matches = true;
    for (let i = 0; i < searchLines.length; i++) {
      const lineIdx = hintIdx + i;
      if (lineIdx >= lines.length || lines[lineIdx] !== searchLines[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return hintIdx;
    }
  }

  // Search near the hint location (within searchRadius lines)
  const searchStart = Math.max(0, hintIdx - searchRadius);
  const maxValidStart = lines.length - searchLines.length;
  const searchEnd = Math.min(maxValidStart, hintIdx + searchRadius);

  // Only search if we have valid range
  if (searchEnd >= searchStart) {
    for (let startIdx = searchStart; startIdx <= searchEnd; startIdx++) {
      let matches = true;
      for (let i = 0; i < searchLines.length; i++) {
        if (lines[startIdx + i] !== searchLines[i]) {
          matches = false;
          break;
        }
      }
      if (matches) {
        return startIdx;
      }
    }
  }

  // If not found near hint, search entire file
  for (let startIdx = 0; startIdx <= lines.length - searchLines.length; startIdx++) {
    let matches = true;
    for (let i = 0; i < searchLines.length; i++) {
      if (lines[startIdx + i] !== searchLines[i]) {
        matches = false;
        break;
      }
    }
    if (matches) {
      return startIdx;
    }
  }

  return -1; // Not found
}

/**
 * Extract context around a match position in the file
 */
function extractContext(lines: string[], matchLineIndex: number, radius: number = 5): string {
  const start = Math.max(0, matchLineIndex - radius);
  const end = Math.min(lines.length, matchLineIndex + radius);
  return lines.slice(start, end).join('\n');
}

function parseSearchReplaceBlocks(diff: string): SearchReplaceBlock[] {
  const blocks: SearchReplaceBlock[] = [];

  // Match pattern: <<<<<<< SEARCH\n:start_line:N\n-------\n[content]\n=======\n[content]\n>>>>>>> REPLACE
  const blockRegex = /<<<<<<< SEARCH\s*\n:start_line:(\d+)\s*\n-------\s*\n([\s\S]*?)\n=======\s*\n([\s\S]*?)\n>>>>>>> REPLACE/g;

  let match;
  while ((match = blockRegex.exec(diff)) !== null) {
    const startLine = parseInt(match[1], 10);
    const searchContent = match[2].trimEnd();
    const replaceContent = match[3].trimEnd();

    if (!isNaN(startLine) && startLine > 0) {
      blocks.push({
        startLine,
        searchContent,
        replaceContent,
      });
    }
  }

  return blocks;
}

/**
 * Apply diff tool - uses search/replace format
 */
export const applyDiffTool: ToolDefinition = {
  name: 'apply_diff',
  description: `Apply precise, targeted modifications to an existing file using one or more search/replace blocks. The 'SEARCH' block must exactly match the existing content (including whitespace and indentation). The ':start_line:' is a hint - the tool will search for the content near that line and apply the change. If the content is found at a different line, it will still be applied. To make multiple targeted changes, provide multiple SEARCH/REPLACE blocks. Use 'read_file' first to get the exact content if needed.`,
  jsonSchema: {
    type: 'object',
    properties: {
      path: {
        type: 'string',
        description: 'The path of the file to modify, relative to the current workspace directory.',
      },
      diff: {
        type: 'string',
        description: `A string containing one or more search/replace blocks defining the changes. The ':start_line:' is required and indicates the starting line number of the original content. You must not add a start line for the replacement content. Each block must follow this format:
<<<<<<< SEARCH
:start_line:[line_number]
-------
[exact content to find]
=======
[new content to replace with]
>>>>>>> REPLACE`,
      },
    },
    required: ['path', 'diff'],
    additionalProperties: false,
  },
  execute: async (args: ApplyDiffArgs): Promise<ToolResult> => {
    try {
      if (!args.path) {
        return {
          status: 'error',
          error: {
            message: 'apply_diff requires path argument',
            code: 'INVALID_ARGS',
          },
        };
      }

      if (!args.diff) {
        return {
          status: 'error',
          error: {
            message: 'apply_diff requires diff argument',
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
      const fileName = path.basename(args.path);
      const fileExt = path.extname(fileName).slice(1) || 'text';

      // Check if file exists and get content (clean content if pending review)
      let originalContent: string;
      try {
        const content = await getCleanContent(vscode.Uri.file(fullPath));
        if (content === null) {
          throw new Error('File not found');
        }
        originalContent = content;
      } catch (error) {
        return {
          status: 'error',
          error: {
            message: `File not found: ${args.path}. ${error instanceof Error ? error.message : String(error)}`,
            code: 'FILE_NOT_FOUND',
          },
        };
      }

      // Parse search/replace blocks
      const blocks = parseSearchReplaceBlocks(args.diff);
      const blockCount = blocks.length;

      if (blocks.length === 0) {
        return {
          status: 'error',
          error: {
            message: 'No valid search/replace blocks found in diff. Expected format: <<<<<<< SEARCH\\n:start_line:N\\n-------\\n[content]\\n=======\\n[content]\\n>>>>>>> REPLACE',
            code: 'INVALID_DIFF_FORMAT',
          },
        };
      }

      // Sort blocks by start line (apply from bottom to top to preserve line numbers)
      const sortedBlocks = [...blocks].sort((a, b) => b.startLine - a.startLine);

      const lines = originalContent.split(/\r?\n/);
      const errors: string[] = [];
      const appliedBlocks: Array<{ hintLine: number; actualLine: number }> = [];

      // Apply each block
      for (const block of sortedBlocks) {
        // Find the search content in the file
        const searchLines = block.searchContent.split(/\r?\n/);
        const searchLength = searchLines.length;

        if (searchLength === 0) {
          errors.push(`Block at line ${block.startLine}: Search content is empty`);
          continue;
        }

        // Find where the content actually is (use hint line as starting point)
        const actualStartIdx = findContentInLines(lines, searchLines, block.startLine, 50);

        if (actualStartIdx === -1) {
          // Content not found - provide helpful error message
          const hintIdx = block.startLine - 1;
          const contextStart = Math.max(0, hintIdx - 10);
          const contextEnd = Math.min(lines.length, hintIdx + searchLength + 10);
          const context = extractContext(lines, hintIdx, 10);

          errors.push(
            `Block at line ${block.startLine}: Search content not found in file.\n` +
            `Searched content:\n${block.searchContent}\n\n` +
            `Context around line ${block.startLine}:\n${context}`
          );
          continue;
        }

        // Warn if found far from hint (but still apply)
        const lineDiff = Math.abs(actualStartIdx + 1 - block.startLine);
        if (lineDiff > 5) {
          // Still apply, but note the difference
          appliedBlocks.push({
            hintLine: block.startLine,
            actualLine: actualStartIdx + 1,
          });
        }

        // Replace the content at the found location
        const replaceLines = block.replaceContent.split(/\r?\n/);
        lines.splice(actualStartIdx, searchLength, ...replaceLines);
      }

      if (errors.length > 0) {
        return {
          status: 'error',
          error: {
            message: `Failed to apply ${errors.length} of ${blocks.length} blocks:\n${errors.join('\n\n')}`,
            code: 'APPLY_ERROR',
          },
        };
      }

      // Calculate final new content (in memory)
      const newText = lines.join('\n');

      // Apply changes with visual diff and review
      await applyVisualDiff(fullPath, newText, 'Agent edited', originalContent);

      const result: any = {
        path: args.path,
        blocks_applied: blocks.length,
      };

      // Add warnings if any blocks were found at different lines than specified
      if (appliedBlocks.length > 0) {
        result.warnings = appliedBlocks.map(b =>
          `Block specified at line ${b.hintLine} was found and applied at line ${b.actualLine}`
        );
      }

      return {
        status: 'success',
        result,
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