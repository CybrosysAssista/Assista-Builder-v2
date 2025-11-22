import type { InternalMessage, InternalBlock } from '../agent/types.js';

/**
 * OpenAI message format
 */
export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: 'function';
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
}

/**
 * Convert internal message format to OpenAI format
 */
export function convertInternalToOpenAI(
  messages: InternalMessage[]
): OpenAIMessage[] {
  const openaiMessages: OpenAIMessage[] = [];

  for (const message of messages) {
    if (typeof message.content === 'string') {
      // Simple string content
      if (message.role === 'tool') {
        // Tool messages need tool_call_id
        openaiMessages.push({
          role: 'tool',
          content: message.content,
          tool_call_id: '', // Will be set by orchestrator
        });
      } else {
        openaiMessages.push({
          role: message.role === 'assistant' ? 'assistant' : 'user',
          content: message.content,
        });
      }
      continue;
    }

    // Block-based content
    const textParts: string[] = [];
    const toolCalls: Array<{
      id: string;
      type: 'function';
      function: {
        name: string;
        arguments: string;
      };
    }> = [];
    let toolResultContent: string | null = null;
    let toolCallId: string | undefined;

    for (const block of message.content) {
      switch (block.type) {
        case 'text':
          if (block.text) {
            textParts.push(block.text);
          }
          break;

        case 'reasoning':
          // OpenAI doesn't have reasoning type, include as text
          if (block.text) {
            textParts.push(block.text);
          }
          break;

        case 'tool_use':
          toolCalls.push({
            id: block.id || `call_${Date.now()}_${Math.random()}`,
            type: 'function',
            function: {
              name: block.name,
              arguments: JSON.stringify(block.input || {}),
            },
          });
          break;

        case 'tool_result':
          toolResultContent = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content);
          toolCallId = block.tool_use_id;
          break;

        case 'grounding':
          // OpenAI doesn't have grounding type
          // Could include as text if needed
          break;
      }
    }

    // Create message based on content
    if (message.role === 'tool' || toolResultContent !== null) {
      // Tool result message
      openaiMessages.push({
        role: 'tool',
        content: toolResultContent || textParts.join('\n') || null,
        tool_call_id: toolCallId || '',
      });
    } else if (toolCalls.length > 0) {
      // Assistant message with tool calls
      openaiMessages.push({
        role: 'assistant',
        content: textParts.length > 0 ? textParts.join('\n') : null,
        tool_calls: toolCalls,
      });
    } else if (textParts.length > 0) {
      // Regular message
      openaiMessages.push({
        role: message.role === 'assistant' ? 'assistant' : 'user',
        content: textParts.join('\n'),
      });
    }
  }

  return openaiMessages;
}

