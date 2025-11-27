import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { readFileTool } from './readFile.js';
import { writeFileTool } from './writeFile.js';
import { applyDiffTool } from './applyDiff.js';
import { createFolderTool } from './createFolder.js';
import { askFollowupQuestionTool } from './askFollowupQuestion.js';
import { findToolByName, executeToolByName as executeTool } from './toolExecutor.js';

/**
 * All available tools
 */
export const ALL_TOOLS: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  applyDiffTool,
  createFolderTool,
  askFollowupQuestionTool,
];

/**
 * Find a tool by name
 */
export { findToolByName };

/**
 * Execute a tool by name with validation
 */
export { executeTool as executeToolByName };

/**
 * Re-export tool definitions for convenience
 */
export { readFileTool, writeFileTool, applyDiffTool, createFolderTool, askFollowupQuestionTool };

