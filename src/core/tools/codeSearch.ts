import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { getWorkspaceRoot, resolveWorkspacePath, validateWorkspacePath } from './toolUtils.js';
import { grepSearchTool } from './grepSearch.js';

interface CodeSearchArgs {
  search_folder_absolute_uri: string; // Keep name for backward compatibility, but accepts relative paths
  search_term: string;
  target_directories?: string[]; // Glob patterns for directories to search over
}

/**
 * Extract keywords from search term for better matching
 */
function extractKeywords(searchTerm: string): string[] {
  // Remove common words and extract meaningful terms
  const stopWords = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'from', 'where', 'how', 'what', 'when', 'find', 'search', 'locate', 'get', 'does', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'did', 'will', 'would', 'should', 'could', 'may', 'might', 'must', 'can']);
  
  // Split by spaces and also handle camelCase/PascalCase
  const words: string[] = [];
  const spaceWords = searchTerm.split(/\s+/);
  
  for (const word of spaceWords) {
    // Handle camelCase/PascalCase: split into components
    const camelCaseWords = word.replace(/([a-z])([A-Z])/g, '$1 $2').split(/\s+/);
    
    for (const w of camelCaseWords) {
      const cleanWord = w.toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanWord.length > 2 && !stopWords.has(cleanWord)) {
        words.push(cleanWord);
      }
    }
  }
  
  // Remove duplicates
  return Array.from(new Set(words));
}

/**
 * Score file relevance based on keyword matches with improved algorithm
 */
function scoreRelevance(content: string, keywords: string[], searchTerm: string): number {
  const lowerContent = content.toLowerCase();
  const lowerSearchTerm = searchTerm.toLowerCase();
  let score = 0;
  
  // Exact phrase match (highest priority)
  if (lowerContent.includes(lowerSearchTerm)) {
    score += 100;
  }
  
  // All keywords present (high priority)
  const allKeywordsPresent = keywords.every(kw => lowerContent.includes(kw));
  if (allKeywordsPresent) {
    score += 50;
  }
  
  // Individual keyword scoring
  for (const keyword of keywords) {
    // Count occurrences (weighted by frequency)
    const matches = (lowerContent.match(new RegExp(`\\b${keyword}\\b`, 'g')) || []).length;
    score += matches * 2; // Word boundary matches are more valuable
    
    // Bonus for multiple occurrences
    if (matches > 5) {
      score += 10; // High frequency indicates relevance
    }
    
    // Bonus for appearing in function/class names (camelCase patterns)
    const camelCasePattern = new RegExp(`[a-z]+${keyword}[a-z]*|[A-Z][a-z]*${keyword}[a-z]*`, 'g');
    const camelMatches = (content.match(camelCasePattern) || []).length;
    score += camelMatches * 5; // Function/class names are very relevant
  }
  
  // File type bonuses (Python files for Odoo)
  if (content.includes('class ') || content.includes('def ')) {
    score += 5; // Code files are more relevant than config
  }
  
  // Odoo-specific patterns
  if (content.includes('_name') || content.includes('_inherit') || content.includes('@api')) {
    score += 10; // Odoo model patterns
  }
  
  return score;
}

/**
 * Find relevant line ranges in a file with improved clustering
 */
function findRelevantRanges(content: string, keywords: string[], searchTerm: string, maxRanges: number = 5): Array<{ start: number; end: number; score: number; content?: string }> {
  const lines = content.split(/\r?\n/);
  const ranges: Array<{ start: number; end: number; score: number; content?: string }> = [];
  
  // Score each line
  const lineScores = lines.map((line, idx) => ({
    lineNum: idx + 1,
    line,
    score: scoreRelevance(line, keywords, searchTerm),
  }));
  
  // Find clusters of high-scoring lines with adaptive window size
  const highScoreLines = lineScores.filter(l => l.score > 0);
  
  if (highScoreLines.length === 0) {
    return [];
  }
  
  // Group nearby high-scoring lines into ranges
  let currentRange: { start: number; end: number; score: number; lines: string[] } | null = null;
  const rangeSize = 15; // Context window size
  
  for (const lineInfo of highScoreLines) {
    if (!currentRange || lineInfo.lineNum > currentRange.end + 5) {
      // Start new range
      if (currentRange) {
        ranges.push({
          start: currentRange.start,
          end: currentRange.end,
          score: currentRange.score,
          content: currentRange.lines.join('\n'),
        });
      }
      currentRange = {
        start: Math.max(1, lineInfo.lineNum - 3),
        end: Math.min(lines.length, lineInfo.lineNum + rangeSize),
        score: lineInfo.score,
        lines: [],
      };
    } else {
      // Extend current range
      currentRange.end = Math.min(lines.length, lineInfo.lineNum + rangeSize);
      currentRange.score += lineInfo.score;
    }
    
    // Add lines to range content
    if (currentRange) {
      const rangeLines = lines.slice(currentRange.start - 1, currentRange.end);
      currentRange.lines = rangeLines;
    }
  }
  
  // Add final range
  if (currentRange) {
    ranges.push({
      start: currentRange.start,
      end: currentRange.end,
      score: currentRange.score,
      content: currentRange.lines.join('\n'),
    });
  }
  
  // Sort by score and return top ranges
  return ranges
    .sort((a, b) => b.score - a.score)
    .slice(0, maxRanges)
    .map(range => ({
      start: range.start,
      end: range.end,
      score: range.score,
      content: range.content,
    }));
}

/**
 * Code search tool - semantic search for codebase exploration
 */
export const codeSearchTool: ToolDefinition = {
  name: 'code_search',
  description: 'A search subagent the user refers to as \'Fast Context\' that is ideal for exploring the codebase based on a request. This tool invokes a subagent that runs parallel grep and readfile calls over multiple turns to locate line ranges and files which might be relevant to the request. The search term should be a targeted natural language query based on what you are trying to accomplish, like \'Find where authentication requests are handled in the Express routes\' or \'Modify the agentic rollout to use the new tokenizer and chat template\' or \'Fix the bug where the user gets redirected from the /feed page\'. Fill out extra details that you as a smart model can infer in the question if necessary. You should always use this tool to start your search. Note: The files and line ranges returned by this tool may be some of the ones needed to complete the user\'s request, but you should be careful in evaluating the relevance of the results, since the subagent might make mistakes. You should consider using classical search tools afterwards to locate the rest if necessary. **IMPORTANT: YOU CANNOT CALL THIS TOOL IN PARALLEL.**',
  jsonSchema: {
    type: 'object',
    properties: {
      search_folder_absolute_uri: {
        type: 'string',
        description: 'The path of the folder where the search should be performed, relative to the workspace directory. In multi-repo workspaces, specify a subfolder to avoid searching across all repos. Example: "src/models" or "custom_addons/my_module"',
      },
      search_term: {
        type: 'string',
        description: 'Search problem statement that this subagent is supposed to research for. Use natural language queries like "How does authentication work?" or "Where is payment processing handled?".',
      },
      target_directories: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional glob patterns for directories to search over. If not specified, searches the entire search_folder_absolute_uri. Example: ["src/models/**", "controllers/**"]',
      },
    },
    required: ['search_folder_absolute_uri', 'search_term'],
    additionalProperties: false,
  },
  execute: async (args: CodeSearchArgs): Promise<ToolResult> => {
    try {
      if (!args.search_folder_absolute_uri || !args.search_term) {
        return {
          status: 'error',
          error: {
            message: 'code_search requires search_folder_absolute_uri and search_term arguments',
            code: 'INVALID_ARGS',
          },
        };
      }

      // Validate and resolve path (relative to workspace)
      const searchPathInput = args.search_folder_absolute_uri;
      
      if (!validateWorkspacePath(searchPathInput)) {
        return {
          status: 'error',
          error: {
            message: `Invalid path: ${searchPathInput}. Path must be within workspace and cannot contain ".."`,
            code: 'INVALID_PATH',
          },
        };
      }

      const searchPath = resolveWorkspacePath(searchPathInput);

      // Check if path exists
      try {
        const stats = await fs.stat(searchPath);
        if (!stats.isDirectory()) {
          return {
            status: 'error',
            error: {
              message: `Path is not a directory: ${searchPath}`,
              code: 'NOT_A_DIRECTORY',
            },
          };
        }
      } catch {
        return {
          status: 'error',
          error: {
            message: `Directory does not exist: ${searchPath}`,
            code: 'NOT_FOUND',
          },
        };
      }

      // Extract keywords from search term
      const keywords = extractKeywords(args.search_term);
      
      if (keywords.length === 0) {
        return {
          status: 'error',
          error: {
            message: 'Search term must contain meaningful keywords',
            code: 'INVALID_SEARCH_TERM',
          },
        };
      }

      // Build includes pattern from target_directories if provided
      const includes = args.target_directories && args.target_directories.length > 0
        ? args.target_directories
        : undefined;

      // Use grep_search to find files containing keywords
      const grepResult = await grepSearchTool.execute({
        SearchPath: searchPath,
        Query: keywords.join('|'), // OR pattern
        CaseSensitive: false,
        FixedStrings: false,
        MatchPerLine: false,
        Includes: includes,
        output_mode: 'files_with_matches',
      });

      if (grepResult.status !== 'success') {
        return grepResult;
      }

      // Get list of files from grep result
      const files = (grepResult.result as any)?.files || [];
      
      if (files.length === 0) {
        return {
          status: 'success',
          result: {
            search_term: args.search_term,
            folder: searchPath,
            results: [],
            total_files: 0,
          },
        };
      }
      
      // Score and rank files by relevance
      const fileScores: Array<{ file: string; score: number; fullPath: string }> = [];
      
      // Read and score files (limit to first 100 for performance)
      const filesToScore = files.slice(0, 100);
      
      for (const file of filesToScore) {
        try {
          // File path is already relative from grep_search, resolve it
          const fullPath = path.isAbsolute(file) ? file : resolveWorkspacePath(file);
          const content = await fs.readFile(fullPath, 'utf-8');
          const contentScore = scoreRelevance(content, keywords, args.search_term);
          
          fileScores.push({
            file,
            score: contentScore,
            fullPath,
          });
        } catch {
          // Skip files we can't read
          continue;
        }
      }

      // Sort by score and get top results
      fileScores.sort((a, b) => b.score - a.score);
      const topFiles = fileScores.slice(0, 20); // Top 20 files

      // Get relevant line ranges for top files
      const results: Array<{
        file: string;
        line_ranges: Array<{ start: number; end: number; content?: string }>;
        score: number;
        full_content?: string; // For top results
      }> = [];

      for (let i = 0; i < topFiles.length; i++) {
        const fileInfo = topFiles[i];
        try {
          const content = await fs.readFile(fileInfo.fullPath, 'utf-8');
          const ranges = findRelevantRanges(content, keywords, args.search_term, i < 5 ? 5 : 3);
          
          if (ranges.length > 0) {
            results.push({
              file: fileInfo.file,
              line_ranges: ranges.map(r => ({
                start: r.start,
                end: r.end,
                ...(i < 5 && r.content ? { content: r.content } : {}), // Full content for top 5
              })),
              score: fileInfo.score,
              ...(i < 3 ? { full_content: content } : {}), // Full file content for top 3
            });
          }
        } catch {
          // Skip files we can't read
          continue;
        }
      }

      return {
        status: 'success',
        result: {
          search_term: args.search_term,
          folder: searchPath,
          results,
          total_files: results.length,
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

