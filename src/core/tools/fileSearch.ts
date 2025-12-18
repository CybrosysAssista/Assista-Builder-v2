import * as fs from 'fs/promises';
import * as path from 'path';
import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { getWorkspaceRoot } from './toolUtils.js';

interface FileSearchArgs {
  query: string;
}

/**
 * Calculate fuzzy match score between query and filename
 */
function fuzzyScore(query: string, filename: string): number {
  const lowerQuery = query.toLowerCase();
  const lowerFilename = filename.toLowerCase();
  
  // Exact match
  if (lowerFilename === lowerQuery) {
    return 1000;
  }
  
  // Starts with query
  if (lowerFilename.startsWith(lowerQuery)) {
    return 500;
  }
  
  // Contains query
  if (lowerFilename.includes(lowerQuery)) {
    return 300;
  }
  
  // Character-based fuzzy matching
  let score = 0;
  let queryIdx = 0;
  
  for (let i = 0; i < lowerFilename.length && queryIdx < lowerQuery.length; i++) {
    if (lowerFilename[i] === lowerQuery[queryIdx]) {
      score += 10;
      queryIdx++;
    }
  }
  
  // Bonus if all query characters found
  if (queryIdx === lowerQuery.length) {
    score += 50;
  }
  
  return score;
}

/**
 * Recursively find files matching fuzzy pattern
 */
async function findFilesFuzzy(
  dirPath: string,
  query: string,
  results: Array<{ path: string; score: number }>,
  maxResults: number = 10
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
      
      // Skip common ignore patterns
      if (entry.name.startsWith('.') && entry.name !== '.') {
        continue;
      }
      if (entry.name === 'node_modules' || entry.name === '__pycache__' || entry.name === '.git') {
        continue;
      }
      
      if (entry.isDirectory()) {
        await findFilesFuzzy(fullPath, query, results, maxResults);
      } else if (entry.isFile()) {
        // Score filename and basename
        const filename = entry.name;
        const basename = path.basename(filename, path.extname(filename));
        
        const filenameScore = fuzzyScore(query, filename);
        const basenameScore = fuzzyScore(query, basename);
        const maxScore = Math.max(filenameScore, basenameScore);
        
        if (maxScore > 0) {
          const workspaceRoot = getWorkspaceRoot();
          const relativePath = path.relative(workspaceRoot, fullPath).replace(/\\/g, '/');
          results.push({
            path: relativePath,
            score: maxScore,
          });
        }
      }
    }
  } catch (error) {
    // Ignore permission errors
  }
}

/**
 * File search tool - fuzzy filename matching
 */
export const fileSearchTool: ToolDefinition = {
  name: 'file_search',
  description: 'Fast file search based on fuzzy matching against file path. Use if you know part of the file path but don\'t know where it\'s located exactly. Response will be capped to 10 results. Make your query more specific if need to filter results further.',
  jsonSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Fuzzy filename to search for (e.g., "Todo.tsx", "utils", "model.py")',
      },
    },
    required: ['query'],
    additionalProperties: false,
  },
  execute: async (args: FileSearchArgs): Promise<ToolResult> => {
    try {
      if (!args.query || !args.query.trim()) {
        return {
          status: 'error',
          error: {
            message: 'file_search requires query argument',
            code: 'INVALID_ARGS',
          },
        };
      }

      const workspaceRoot = getWorkspaceRoot();
      const results: Array<{ path: string; score: number }> = [];

      await findFilesFuzzy(workspaceRoot, args.query.trim(), results, 10);

      // Sort by score (highest first)
      results.sort((a, b) => b.score - a.score);

      return {
        status: 'success',
        result: {
          matches: results.map(r => r.path),
          count: results.length,
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

