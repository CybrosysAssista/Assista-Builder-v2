import type { ToolDefinition, ToolResult } from '../agent/types.js';
import { ALL_TOOLS } from './index.js';
import { validateToolArgs, executeToolWithLock } from './utils.js';

/**
 * Find a tool by name
 */
export function findToolByName(name: string): ToolDefinition | undefined {
  return ALL_TOOLS.find(tool => tool.name === name);
}

/**
 * Execute a tool by name with validation
 */
export async function executeToolByName(
  name: string,
  args: any
): Promise<ToolResult> {
  const tool = findToolByName(name);
  
  if (!tool) {
    return {
      status: 'error',
      error: {
        message: `Unknown tool: ${name}`,
        code: 'UNKNOWN_TOOL',
      },
    };
  }

  // Validate arguments against schema
  const validation = validateToolArgs(tool, args);
  if (!validation.valid) {
    return {
      status: 'error',
      error: {
        message: `Invalid arguments for ${name}: ${validation.errors?.join(', ') || 'Validation failed'}`,
        code: 'VALIDATION_ERROR',
      },
    };
  }

  // Execute tool with locking for write operations
  try {
    return await executeToolWithLock(tool, args);
  } catch (error) {
    return {
      status: 'error',
      error: {
        message: error instanceof Error ? error.message : String(error),
        code: 'EXECUTION_ERROR',
      },
    };
  }
}

