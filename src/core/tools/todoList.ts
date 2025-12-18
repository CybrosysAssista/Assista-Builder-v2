import * as vscode from 'vscode';
import type { ToolDefinition, ToolResult } from '../agent/types.js';

interface TodoItem {
  id: string;
  content: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  priority: 'high' | 'medium' | 'low';
}

interface TodoListArgs {
  todos: TodoItem[];
}

// Global context storage for todo list
let globalContext: vscode.ExtensionContext | undefined;

/**
 * Set the extension context (called from orchestrator)
 */
export function setTodoListContext(context: vscode.ExtensionContext): void {
  globalContext = context;
}

/**
 * Get or initialize todo list from workspace state
 */
function getTodoList(): TodoItem[] {
  if (!globalContext) {
    return [];
  }
  const stored = globalContext.workspaceState.get<TodoItem[]>('assista_todos', []);
  return stored;
}

/**
 * Save todo list to workspace state
 */
function saveTodoList(todos: TodoItem[]): void {
  if (!globalContext) {
    return;
  }
  globalContext.workspaceState.update('assista_todos', todos);
}

/**
 * Todo list tool
 */
export const todoListTool: ToolDefinition = {
  name: 'todo_list',
  description: 'Use this tool to create, update, or manage a todo list. This tool helps you organize tasks with different statuses (pending, in_progress, completed, cancelled) and priorities (high, medium, low). Use this tool proactively for complex multi-step tasks (3+ steps), non-trivial work, or when user explicitly requests it. Skip for single straightforward tasks or trivial operations. Mark tasks as in_progress before starting, completed immediately after finishing. Only ONE task should be in_progress at a time. Remove cancelled tasks from the list entirely when no longer relevant.',
    jsonSchema: {
      type: 'object',
      properties: {
        todos: {
          type: 'array',
          description: 'List of todo items for the current task',
          items: {
            type: 'object',
            properties: {
              id: {
                type: 'string',
                description: 'unique identifier for the todo item',
              },
              content: {
                type: 'string',
                description: 'todo item content',
              },
              status: {
                type: 'string',
                enum: ['pending', 'in_progress', 'completed', 'cancelled'],
                description: 'todo item status, must be one of \'pending\', \'in_progress\', \'completed\', \'cancelled\'',
              },
              priority: {
                type: 'string',
                enum: ['high', 'medium', 'low'],
                description: 'todo item priority, must be one of \'high\', \'medium\', \'low\'',
              },
            },
            required: ['id', 'content', 'status', 'priority'],
            additionalProperties: false,
          },
        },
      },
      required: ['todos'],
      additionalProperties: false,
    },
    execute: async (args: TodoListArgs): Promise<ToolResult> => {
      try {
        if (!args.todos || !Array.isArray(args.todos)) {
          return {
            status: 'error',
            error: {
              message: 'todo_list requires todos array',
              code: 'INVALID_ARGS',
            },
          };
        }

        // Validate todos
        for (const todo of args.todos) {
          if (!todo.id || !todo.content || !todo.status || !todo.priority) {
            return {
              status: 'error',
              error: {
                message: 'Each todo must have id, content, status, and priority',
                code: 'INVALID_ARGS',
              },
            };
          }

          if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(todo.status)) {
            return {
              status: 'error',
              error: {
                message: `Invalid status: ${todo.status}. Must be one of: pending, in_progress, completed, cancelled`,
                code: 'INVALID_ARGS',
              },
            };
          }

          if (!['high', 'medium', 'low'].includes(todo.priority)) {
            return {
              status: 'error',
              error: {
                message: `Invalid priority: ${todo.priority}. Must be one of: high, medium, low`,
                code: 'INVALID_ARGS',
              },
            };
          }
        }

        if (!globalContext) {
          return {
            status: 'error',
            error: {
              message: 'Extension context not available for todo_list tool',
              code: 'CONTEXT_ERROR',
            },
          };
        }

        // Get existing todos
        const existingTodos = getTodoList();
        const existingMap = new Map<string, TodoItem>();
        for (const todo of existingTodos) {
          existingMap.set(todo.id, todo);
        }

        // Merge with new todos (replace existing, add new, filter cancelled)
        const updatedTodos: TodoItem[] = [];
        const processedIds = new Set<string>();
        const newTodoMap = new Map<string, TodoItem>();
        
        // Index new todos by ID
        for (const todo of args.todos) {
          newTodoMap.set(todo.id, todo);
        }

        // First, keep existing todos that aren't in the new list (unless they were cancelled in new list)
        for (const existing of existingTodos) {
          const newTodo = newTodoMap.get(existing.id);
          if (!newTodo) {
            // Keep existing todo if not in new list
            updatedTodos.push(existing);
          } else if (newTodo.status === 'cancelled') {
            // Remove cancelled todos - don't add them to updated list
            continue;
          }
        }

        // Then add/update todos from the new list (skip cancelled ones)
        for (const todo of args.todos) {
          if (todo.status === 'cancelled') {
            // Skip cancelled todos - they're removed from the list
            continue;
          }
          if (!processedIds.has(todo.id)) {
            updatedTodos.push(todo);
            processedIds.add(todo.id);
          }
        }

        // Save updated list
        saveTodoList(updatedTodos);

        // Count by status
        const counts = {
          pending: updatedTodos.filter(t => t.status === 'pending').length,
          in_progress: updatedTodos.filter(t => t.status === 'in_progress').length,
          completed: updatedTodos.filter(t => t.status === 'completed').length,
          cancelled: args.todos.filter(t => t.status === 'cancelled').length, // Count how many were cancelled
        };
        
        // Count by priority
        const priorityCounts = {
          high: updatedTodos.filter(t => t.priority === 'high').length,
          medium: updatedTodos.filter(t => t.priority === 'medium').length,
          low: updatedTodos.filter(t => t.priority === 'low').length,
        };

        return {
          status: 'success',
          result: {
            todos: updatedTodos,
            counts,
            priority_counts: priorityCounts,
            total: updatedTodos.length,
            cancelled_count: counts.cancelled,
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

