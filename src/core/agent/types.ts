/**
 * Internal message model (Anthropic-like)
 * Used as the lingua franca for all providers
 */

export type InternalRole = 'user' | 'assistant' | 'tool';

export type InternalBlock =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_use'; id?: string; name: string; input: any }
  | { type: 'tool_result'; tool_use_id: string; content: any }
  | { type: 'grounding'; sources: Array<{ title: string; url?: string }> };

export interface InternalMessage {
  role: InternalRole;
  content: InternalBlock[] | string;
  timestamp?: number;
  isError?: boolean;
}

/**
 * Provider-agnostic tool definition (canonical = OpenAI function schema)
 */
export interface ToolDefinition {
  name: string;
  description: string;
  jsonSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };
  execute: (args: any) => Promise<ToolResult>;
}

/**
 * Standardized tool return shape
 */
export interface ToolResult {
  status: 'success' | 'error';
  result?: any;
  error?: {
    message: string;
    code?: string;
  };
  stop?: boolean;
}

/**
 * Normalized events from provider streams
 */
export type NormalizedEvent =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: string } // args as JSON string
  | { type: 'grounding'; sources: any[] }
  | { type: 'usage'; inputTokens: number; outputTokens: number; cost?: number }
  | { type: 'end' }
  | { type: 'error'; error: string; message: string };

