import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { readFileTool } from './readFile.js';
import { writeFileTool } from './writeFile.js';
import { applyDiffTool } from './applyDiff.js';
import { askFollowupQuestionTool } from './askFollowupQuestion.js';
import { grepSearchTool } from './grepSearch.js';
import { listDirTool } from './listDir.js';
import { findByNameTool } from './findByName.js';
import { codeSearchTool } from './codeSearch.js';
import { todoListTool, setTodoListContext } from './todoList.js';
import { runCommandTool } from './runCommand.js';
import { multiEditTool } from './multiEdit.js';
import { fileSearchTool } from './fileSearch.js';
import { globFileSearchTool } from './globFileSearch.js';
import { findToolByName, executeToolByName as executeTool } from './toolExecutor.js';

/**
 * All available tools
 */
export const ALL_TOOLS: ToolDefinition[] = [
  readFileTool,
  writeFileTool,
  applyDiffTool,
  grepSearchTool,
  listDirTool,
  findByNameTool,
  codeSearchTool,
  todoListTool,
  runCommandTool,
  multiEditTool,
  fileSearchTool,
  globFileSearchTool,
  // askFollowupQuestionTool,
];

/**
 * Initialize tools with context (called from orchestrator)
 */
export function initializeTools(context: any): void {
  setTodoListContext(context);
}

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
export { readFileTool, writeFileTool, applyDiffTool, askFollowupQuestionTool };
