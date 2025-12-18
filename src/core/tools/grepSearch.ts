import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { getWorkspaceRoot, resolveWorkspacePath, validateWorkspacePath } from './toolUtils.js';

interface GrepSearchArgs {
  SearchPath: string;
  Query: string;
  MatchPerLine?: boolean;
  Includes?: string[];
  CaseSensitive?: boolean;
  FixedStrings?: boolean;
  '-A'?: number; // Lines after match
  '-B'?: number; // Lines before match
  '-C'?: number; // Lines before and after match
  '-n'?: boolean; // Show line numbers
  head_limit?: number; // Limit output to first N matches
  multiline?: boolean; // Enable multiline matching
  output_mode?: 'content' | 'files_with_matches' | 'count';
}

interface MatchResult {
  file: string;
  line: number;
  content: string;
  match: string;
  contextBefore?: string[];
  contextAfter?: string[];
}

/**
 * Simple glob pattern matcher
 */
function matchesGlob(filePath: string, pattern: string): boolean {
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
    return !matchesGlob(filePath, positivePattern);
  }
  
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(filePath);
}

/**
 * Recursively get all files in a directory
 */
async function getAllFiles(dirPath: string, includes: string[] = []): Promise<string[]> {
  const files: string[] = [];
  const workspaceRoot = getWorkspaceRoot();
  
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      
      // Skip node_modules, .git, and other common ignore patterns
      if (entry.name.startsWith('.') && entry.name !== '.') {
        continue;
      }
      if (entry.name === 'node_modules' || entry.name === '__pycache__') {
        continue;
      }
      
      if (entry.isDirectory()) {
        const subFiles = await getAllFiles(fullPath, includes);
        files.push(...subFiles);
      } else if (entry.isFile()) {
        // Check if file matches include patterns
        if (includes.length > 0) {
          const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
          const matches = includes.some(pattern => matchesGlob(relativePath, pattern));
          if (!matches) {
            continue;
          }
        }
        files.push(fullPath);
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
  
  return files;
}

/**
 * Search for pattern in a single file
 */
async function searchInFile(
  filePath: string,
  pattern: RegExp,
  matchPerLine: boolean,
  contextBefore: number,
  contextAfter: number,
  multiline: boolean
): Promise<MatchResult[]> {
  const results: MatchResult[] = [];
  
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split(/\r?\n/);
    const workspaceRoot = getWorkspaceRoot();
    const relativePath = path.relative(workspaceRoot, filePath).replace(/\\/g, '/');
    
    if (multiline) {
      // Multiline matching - search across line boundaries
      const fullText = content;
      const globalPattern = new RegExp(pattern.source, pattern.flags + 'g');
      let match;
      
      while ((match = globalPattern.exec(fullText)) !== null && results.length < 500) {
        // Find line number for match
        const beforeMatch = fullText.substring(0, match.index);
        const lineNum = beforeMatch.split(/\r?\n/).length;
        const lineContent = lines[lineNum - 1] || '';
        
        // Get context
        const beforeLines: string[] = [];
        const afterLines: string[] = [];
        
        for (let i = Math.max(0, lineNum - 1 - contextBefore); i < lineNum - 1; i++) {
          beforeLines.push(lines[i]);
        }
        
        for (let i = lineNum; i < Math.min(lines.length, lineNum + contextAfter); i++) {
          afterLines.push(lines[i]);
        }
        
        results.push({
          file: relativePath,
          line: lineNum,
          content: lineContent,
          match: match[0],
          contextBefore: contextBefore > 0 ? beforeLines : undefined,
          contextAfter: contextAfter > 0 ? afterLines : undefined,
        });
      }
    } else {
      // Single-line matching
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const matches = line.match(pattern);
        
        if (matches) {
          // Get context
          const beforeLines: string[] = [];
          const afterLines: string[] = [];
          
          for (let j = Math.max(0, i - contextBefore); j < i; j++) {
            beforeLines.push(lines[j]);
          }
          
          for (let j = i + 1; j < Math.min(lines.length, i + 1 + contextAfter); j++) {
            afterLines.push(lines[j]);
          }
          
          results.push({
            file: relativePath,
            line: i + 1,
            content: line,
            match: matches[0],
            contextBefore: contextBefore > 0 ? beforeLines : undefined,
            contextAfter: contextAfter > 0 ? afterLines : undefined,
          });
        }
      }
    }
  } catch (error) {
    // Ignore binary files or permission errors
  }
  
  return results;
}

/**
 * Grep search tool - powerful regex search
 */
export const grepSearchTool: ToolDefinition = {
  name: 'grep_search',
  description: 'A powerful search tool built on ripgrep-like functionality. NEVER invoke `grep` or `rg` as a Bash command, use this tool instead. Supports full regex syntax. Filter files with Includes parameter in glob format. Use output_mode to control result format: "content" shows matching lines with context, "files_with_matches" shows only file paths, "count" shows match counts per file.',
  jsonSchema: {
    type: 'object',
    properties: {
      SearchPath: {
        type: 'string',
        description: 'The path to search, relative to the workspace directory. This can be a directory or a file. This is a required parameter.',
      },
      Query: {
        type: 'string',
        description: 'The search term or pattern to look for within files. Supports full regex syntax. Escape special characters for literal matches.',
      },
      MatchPerLine: {
        type: 'boolean',
        description: 'Show the surrounding file content together with the matches. Use this ONLY if you have found a very specific search, and not for broad initial searches.',
        default: false,
      },
      Includes: {
        type: 'array',
        items: { type: 'string' },
        description: 'Glob patterns to filter files found within the \'SearchPath\', if \'SearchPath\' is a directory. For example, \'*.go\' to only include Go files, or \'!**/vendor/*\' to exclude vendor directories.',
      },
      CaseSensitive: {
        type: 'boolean',
        description: 'If true, performs a case-sensitive search. Defaults to false (case-insensitive).',
        default: false,
      },
      FixedStrings: {
        type: 'boolean',
        description: 'If true, treats Query as a literal string where all characters are matched exactly (no regex). Defaults to false (regex).',
        default: false,
      },
      '-A': {
        type: 'number',
        description: 'Number of lines to show after each match (context after). Requires output_mode: "content", ignored otherwise.',
      },
      '-B': {
        type: 'number',
        description: 'Number of lines to show before each match (context before). Requires output_mode: "content", ignored otherwise.',
      },
      '-C': {
        type: 'number',
        description: 'Number of lines to show before and after each match (context). Requires output_mode: "content", ignored otherwise.',
      },
      '-n': {
        type: 'boolean',
        description: 'Show line numbers in output. Requires output_mode: "content", ignored otherwise. Defaults to true when output_mode is "content".',
        default: true,
      },
      head_limit: {
        type: 'number',
        description: 'Limit output to first N matches/files. Works across all output modes.',
      },
      multiline: {
        type: 'boolean',
        description: 'Enable multiline mode where . matches newlines and patterns can span lines. Default: false.',
        default: false,
      },
      output_mode: {
        type: 'string',
        enum: ['content', 'files_with_matches', 'count'],
        description: 'Output mode: "content" shows matching lines (supports -A/-B/-C context, -n line numbers, head_limit), "files_with_matches" shows only file paths (supports head_limit), "count" shows match counts per file (supports head_limit). Defaults to "content".',
        default: 'content',
      },
    },
    required: ['SearchPath', 'Query'],
    additionalProperties: false,
  },
  execute: async (args: GrepSearchArgs): Promise<ToolResult> => {
    try {
      if (!args.SearchPath || !args.Query) {
        return {
          status: 'error',
          error: {
            message: 'grep_search requires SearchPath and Query arguments',
            code: 'INVALID_ARGS',
          },
        };
      }

      // Validate path
      if (!validateWorkspacePath(args.SearchPath)) {
        return {
          status: 'error',
          error: {
            message: `Invalid path: ${args.SearchPath}. Path must be within workspace and cannot contain ".."`,
            code: 'INVALID_PATH',
          },
        };
      }

      const searchPath = resolveWorkspacePath(args.SearchPath);
      
      // Check if path exists
      try {
        const stats = await fs.stat(searchPath);
        const isFile = stats.isFile();
        const isDir = stats.isDirectory();
        
        if (!isFile && !isDir) {
          return {
            status: 'error',
            error: {
              message: `Path is not a file or directory: ${args.SearchPath}`,
              code: 'INVALID_PATH',
            },
          };
        }

        // Build regex pattern
        let patternStr = args.Query;
        if (args.FixedStrings) {
          // Escape special regex characters
          patternStr = patternStr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        }
        
        const flags = args.CaseSensitive ? (args.multiline ? 'gm' : 'g') : (args.multiline ? 'gim' : 'gi');
        const pattern = new RegExp(patternStr, flags);

        // Calculate context
        const contextBefore = args['-C'] !== undefined ? args['-C'] : (args['-B'] || 0);
        const contextAfter = args['-C'] !== undefined ? args['-C'] : (args['-A'] || 0);
        const outputMode = args.output_mode || 'content';
        const showLineNumbers = args['-n'] !== false; // Default to true
        const headLimit = args.head_limit;
        const multiline = args.multiline || false;

        const allMatches: MatchResult[] = [];
        
        if (isFile) {
          // Search in single file
          const matches = await searchInFile(
            searchPath,
            pattern,
            args.MatchPerLine || false,
            contextBefore,
            contextAfter,
            multiline
          );
          allMatches.push(...matches);
        } else {
          // Search in directory
          const files = await getAllFiles(searchPath, args.Includes || []);
          
          // Limit to first 1000 files to avoid performance issues
          const filesToSearch = files.slice(0, 1000);
          
          for (const file of filesToSearch) {
            const matches = await searchInFile(
              file,
              pattern,
              args.MatchPerLine || false,
              contextBefore,
              contextAfter,
              multiline
            );
            allMatches.push(...matches);
            
            // Limit total matches to prevent overwhelming output
            if (!headLimit && allMatches.length > 500) {
              break;
            }
            if (headLimit && allMatches.length >= headLimit) {
              break;
            }
          }
        }

        // Apply head_limit if specified
        const limitedMatches = headLimit ? allMatches.slice(0, headLimit) : allMatches;

        // Group results by file
        const resultsByFile: Record<string, MatchResult[]> = {};
        for (const match of limitedMatches) {
          if (!resultsByFile[match.file]) {
            resultsByFile[match.file] = [];
          }
          resultsByFile[match.file].push(match);
        }

        // Format results based on output mode
        if (outputMode === 'files_with_matches') {
          const files = Object.keys(resultsByFile);
          const limitedFiles = headLimit ? files.slice(0, headLimit) : files;
          return {
            status: 'success',
            result: {
              files: limitedFiles,
              count: limitedFiles.length,
              truncated: headLimit ? files.length > headLimit : false,
            },
          };
        }

        if (outputMode === 'count') {
          const counts: Array<{ file: string; count: number }> = [];
          for (const [file, matches] of Object.entries(resultsByFile)) {
            counts.push({ file, count: matches.length });
          }
          const limitedCounts = headLimit ? counts.slice(0, headLimit) : counts;
          return {
            status: 'success',
            result: {
              counts: limitedCounts,
              totalFiles: limitedCounts.length,
              totalMatches: limitedMatches.length,
              truncated: headLimit ? counts.length > headLimit : false,
            },
          };
        }

        // Default: content mode
        const formattedResults: Array<{
          file: string;
          matches: Array<{
            line: number;
            content: string;
            match: string;
            contextBefore?: string[];
            contextAfter?: string[];
          }>;
        }> = [];

        for (const [file, matches] of Object.entries(resultsByFile)) {
          formattedResults.push({
            file,
            matches: matches.map(m => ({
              line: m.line,
              content: m.content,
              match: m.match,
              ...(m.contextBefore && { contextBefore: m.contextBefore }),
              ...(m.contextAfter && { contextAfter: m.contextAfter }),
            })),
          });
        }

        return {
          status: 'success',
          result: {
            matches: formattedResults,
            totalMatches: limitedMatches.length,
            truncated: headLimit ? allMatches.length > headLimit : allMatches.length >= 500,
            showLineNumbers,
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

