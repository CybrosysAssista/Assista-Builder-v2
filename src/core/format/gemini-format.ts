import type { InternalMessage, InternalBlock } from '../agent/types.js';

// Local type definitions to avoid top-level import dependency
type GeminiPart = {
  text?: string;
  functionCall?: { name: string; args: Record<string, unknown> };
  functionResponse?: { name: string; response: { name: string; content: string } };
  inlineData?: { data: string; mimeType: string };
  thoughtSignature?: string;
};

type GeminiContent = {
  role: 'user' | 'model' | 'tool';
  parts: GeminiPart[];
};

/**
 * Convert internal message format to Gemini format
 */
export function convertInternalToGemini(
  message: InternalMessage
): GeminiContent[] {
  const parts: GeminiPart[] = [];

  // Handle string content
  if (typeof message.content === 'string') {
    parts.push({ text: message.content });
    return [{
      role: message.role === 'assistant' ? 'model' : 'user',
      parts,
    }];
  }

  // Handle block-based content
  for (const block of message.content) {
    switch (block.type) {
      case 'text':
        if (block.text) {
          parts.push({ text: block.text });
        }
        break;

      case 'reasoning':
        // Gemini doesn't have a direct reasoning type, include as text
        if (block.text) {
          parts.push({ text: block.text });
        }
        break;

      case 'tool_use':
        parts.push({
          functionCall: {
            name: block.name,
            args: block.input || {},
          },
        });
        break;

      case 'tool_result':
        // Gemini needs tool name, not just ID
        // The name should be provided in the block (set by convertInternalMessagesToGemini)
        if (block.content) {
          const contentStr = typeof block.content === 'string'
            ? block.content
            : JSON.stringify(block.content);

          // Use name from block if available, otherwise use tool_use_id
          const toolName = (block as any).name || block.tool_use_id;

          parts.push({
            functionResponse: {
              name: toolName,
              response: {
                name: toolName,
                content: contentStr,
              },
            },
          });
        }
        break;

      case 'grounding':
        // Gemini grounding is handled separately in the response
        // Skip for now
        break;
    }
  }

  if (parts.length === 0) {
    return [];
  }

  return [{
    role: message.role === 'assistant' ? 'model' : message.role === 'tool' ? 'tool' : 'user',
    parts,
  }];
}

/**
 * Convert array of internal messages to Gemini contents
 * Builds tool_use_id -> name mapping for tool_result blocks
 */
export function convertInternalMessagesToGemini(
  messages: InternalMessage[]
): { contents: GeminiContent[]; toolIdToName: Map<string, string> } {
  const contents: GeminiContent[] = [];
  const toolIdToName = new Map<string, string>();

  // First pass: build tool ID to name mapping
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      for (const block of message.content) {
        if (block.type === 'tool_use' && block.id && block.name) {
          toolIdToName.set(block.id, block.name);
        }
      }
    }
  }

  // Second pass: convert messages
  for (const message of messages) {
    if (Array.isArray(message.content)) {
      // Replace tool_use_id with actual name in tool_result blocks
      const processedContent = message.content.map(block => {
        if (block.type === 'tool_result' && block.tool_use_id) {
          const toolName = toolIdToName.get(block.tool_use_id);
          if (toolName) {
            return {
              ...block,
              name: toolName, // Add name for conversion
            };
          }
        }
        return block;
      });

      const processedMessage: InternalMessage = {
        ...message,
        content: processedContent,
      };

      const geminiContents = convertInternalToGemini(processedMessage);
      contents.push(...geminiContents);
    } else {
      const geminiContents = convertInternalToGemini(message);
      contents.push(...geminiContents);
    }
  }

  return { contents, toolIdToName };
}

