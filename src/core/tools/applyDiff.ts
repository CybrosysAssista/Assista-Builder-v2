import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { validateWorkspacePath, resolveWorkspacePath } from './toolUtils.js';
import { reportProgress } from './progressContext.js';

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
 * Find the line index where searchText appears in content
 */
function findMatchLineIndex(content: string, searchText: string): number {
  const pos = content.indexOf(searchText);
  if (pos === -1) return 0;
  return content.substring(0, pos).split(/\r?\n/).length - 1;
}

/**
 * Extract context around a match position in the file
 */
function extractContext(original: string, matchLineIndex: number, radius: number = 5): string {
  const lines = original.split(/\r?\n/);
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
  description: `Apply precise, targeted modifications to an existing file using one or more search/replace blocks. This tool is for surgical edits only; the 'SEARCH' block must exactly match the existing content, including whitespace and indentation. To make multiple targeted changes, provide multiple SEARCH/REPLACE blocks in the 'diff' parameter. Use the 'read_file' tool first if you are not confident in the exact content to search for.`,
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

      // Check if file exists
      reportProgress(JSON.stringify({
        type: 'file_operation',
        operation: 'reading_file',
        path: args.path
      }));
      let originalContent: string;
      try {
        originalContent = await fs.readFile(fullPath, 'utf-8');
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
      const fileId = `file-${args.path.replace(/[^a-zA-Z0-9]/g, '-')}`;

      // Extract context around first block (if any)
      let contextPreview = '';
      let contextTruncated = false;
      if (blocks.length > 0) {
        const first = blocks[0];
        const matchIndex = findMatchLineIndex(originalContent, first.searchContent);
        contextPreview = extractContext(originalContent, matchIndex, 5);
        contextTruncated = true;
      } else {
        // Fallback to first 15 lines if no blocks
        contextPreview = originalContent.split(/\r?\n/).slice(0, 15).join('\n');
        contextTruncated = originalContent.split(/\r?\n/).length > 15;
      }

      reportProgress(JSON.stringify({
        type: 'file_preview',
        file: fileName,
        filePath: args.path,
        fileId: fileId,
        preview: contextPreview,
        truncated: contextTruncated,
        state: 'applying',
        language: fileExt,
        blockCount: blockCount
      }));
      
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
      
      let modifiedContent = originalContent;
      const lines = originalContent.split(/\r?\n/);
      const errors: string[] = [];

      // Apply each block
      for (const block of sortedBlocks) {
        const startIdx = block.startLine - 1; // Convert to 0-based
        
        if (startIdx < 0 || startIdx >= lines.length) {
          errors.push(`Block at line ${block.startLine}: Start line out of bounds`);
          continue;
        }

        // Find the search content in the file
        const searchLines = block.searchContent.split(/\r?\n/);
        const searchLength = searchLines.length;
        
        // Check if search content matches at startLine
        let found = true;
        for (let i = 0; i < searchLength; i++) {
          const lineIdx = startIdx + i;
          if (lineIdx >= lines.length || lines[lineIdx] !== searchLines[i]) {
            found = false;
            break;
          }
        }

        if (!found) {
          // Try to find a fuzzy match nearby
          const contextStart = Math.max(0, startIdx - 5);
          const contextEnd = Math.min(lines.length, startIdx + searchLength + 5);
          const context = lines.slice(contextStart, contextEnd).join('\n');
          
          errors.push(
            `Block at line ${block.startLine}: Search content does not match exactly. ` +
            `Expected to find at line ${block.startLine}:\n${block.searchContent}\n` +
            `Found in context:\n${context}`
          );
          continue;
        }

        // Replace the content
        const replaceLines = block.replaceContent.split(/\r?\n/);
        lines.splice(startIdx, searchLength, ...replaceLines);
      }

      if (errors.length > 0) {
        return {
          status: 'error',
          error: {
            message: `Failed to apply some blocks:\n${errors.join('\n\n')}`,
            code: 'APPLY_ERROR',
          },
        };
      }

      // Write modified content
      modifiedContent = lines.join('\n');
      const writePreviewLines = modifiedContent.split(/\r?\n/).slice(0, 15);
      const writePreview = writePreviewLines.join('\n');
      const writeIsTruncated = modifiedContent.split(/\r?\n/).length > 15;
      
      reportProgress(JSON.stringify({
        type: 'file_preview',
        file: fileName,
        filePath: args.path,
        fileId: fileId,
        preview: writePreview,
        truncated: writeIsTruncated,
        state: 'writing',
        language: fileExt
      }));
      await fs.writeFile(fullPath, modifiedContent, 'utf-8');
      
      // Update to completed state
      reportProgress(JSON.stringify({
        type: 'file_preview',
        file: fileName,
        filePath: args.path,
        fileId: fileId,
        preview: writePreview,
        truncated: writeIsTruncated,
        state: 'completed',
        language: fileExt,
        blockCount: blockCount
      }));

      return {
        status: 'success',
        result: {
          path: args.path,
          blocks_applied: blocks.length,
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

