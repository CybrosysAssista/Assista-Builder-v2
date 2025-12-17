import * as vscode from 'vscode';
import type { ProviderAdapter } from './base.js';
import type { InternalMessage, ToolDefinition, NormalizedEvent } from '../agent/types.js';
import { ProviderConfig } from './types.js';
import { convertInternalToOpenAI } from '../format/openai-format.js';

function getApiUrl(provider: string, config: ProviderConfig): string {
  switch (provider) {
    case 'openai':
      return 'https://api.openai.com/v1/chat/completions';
    case 'anthropic':
      return 'https://openrouter.ai/api/v1/chat/completions';
    case 'openrouter':
      return `${config.customUrl || 'https://openrouter.ai/api/v1'}/chat/completions`;
    case 'custom':
      return config.customUrl || '';
    default:
      throw new Error(`Unknown provider: ${provider}`);
  }
}

export class OpenAIAdapter implements ProviderAdapter {
  name: string;
  private config: ProviderConfig;
  private providerName: string;

  constructor(config: ProviderConfig, providerName: string, _context: vscode.ExtensionContext) {
    this.config = config;
    this.providerName = providerName;
    this.name = providerName;
  }

  async buildRequest(
    systemInstruction: string,
    messages: InternalMessage[],
    tools?: ToolDefinition[],
    options?: any
  ): Promise<any> {
    // Convert internal messages to OpenAI format
    const openaiMessages = convertInternalToOpenAI(messages);

    // Add system message if provided
    if (systemInstruction) {
      const hasSystem = openaiMessages.length > 0 && openaiMessages[0].role === 'system';
      if (!hasSystem) {
        openaiMessages.unshift({
          role: 'system',
          content: systemInstruction,
        });
      }
    }

    // Convert tools to OpenAI format (identity mapping - OpenAI format is canonical)
    const openaiTools = tools
      ? tools.map(tool => ({
        type: 'function' as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.jsonSchema,
        },
      }))
      : undefined;

    const body: any = {
      model: this.config.model,
      messages: openaiMessages,
      stream: true,
    };

    if (openaiTools && openaiTools.length > 0) {
      body.tools = openaiTools;
      body.tool_choice = options?.tool_choice || 'auto';
    }

    // Optional generation parameters
    if (options?.temperature !== undefined) {
      body.temperature = options.temperature;
    }
    if (options?.maxTokens !== undefined) {
      body.max_tokens = options.maxTokens;
    }
    if (options?.topP !== undefined) {
      body.top_p = options.topP;
    }

    return {
      url: getApiUrl(this.providerName, this.config),
      body,
      headers: this.buildHeaders(),
    };
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.config.apiKey}`,
    };

    // OpenRouter-specific headers
    if (this.providerName === 'openrouter' || this.providerName === 'anthropic') {
      const cfgSection = vscode.workspace.getConfiguration('assistaCoder');
      const referer = cfgSection.get<string>('openrouterHeaders.referer', 'https://assista-coder.vscode')!;
      const xTitle = cfgSection.get<string>('openrouterHeaders.title', 'Assista Coder Extension')!;
      headers['HTTP-Referer'] = referer;
      headers['X-Title'] = xTitle;
    }

    return headers;
  }

  async *createMessageStream(
    request: any,
    options?: any
  ): AsyncIterable<NormalizedEvent> {
    const { url, body, headers } = request;
    const maxRetries = 10;
    let lastErr: any = null;

    const externalAbortSignal = options?.abortSignal as AbortSignal | undefined;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      // Check if already aborted
      if (externalAbortSignal?.aborted) {
        throw new Error('Request cancelled');
      }
      
      // Create a combined signal: abort on timeout OR external signal
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 60_000);
      
      // If external signal exists, listen to it and abort our controller
      if (externalAbortSignal) {
        externalAbortSignal.addEventListener('abort', () => {
          controller.abort();
          clearTimeout(timeout);
        });
      }

      try {
        const response = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (!response.ok) {
          let detail = '';
          try {
            const errJson = await response.json();
            detail = (errJson as any)?.error?.message || JSON.stringify(errJson);
          } catch {
            try {
              detail = await response.text();
            } catch {
              /* ignore */
            }
          }

          // Retry on 429/5xx
          if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
            lastErr = new Error(`API Error (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`);
            const backoff = Math.pow(2, attempt - 1) * 1000;
            await new Promise(r => setTimeout(r, backoff));
            continue;
          }

          yield {
            type: 'error',
            error: `API Error (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`,
            message: detail || response.statusText,
          };
          return;
        }

        // Stream response
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();

        if (!reader) {
          yield {
            type: 'error',
            error: 'No response body',
            message: 'No response body received',
          };
          return;
        }

        let buffer = '';
        let toolCallCounter = 0;
        let lastChunk: any = null;
        const toolCalls = new Map<number, { id: string; name: string; args: string }>();

        const finalizeToolCalls = function* () {
          for (const tc of toolCalls.values()) {
            yield { type: 'tool_call' as const, id: tc.id, name: tc.name, args: tc.args || '{}' };
          }
          toolCalls.clear();
        };

        while (true) {
          const { done, value } = await reader.read();
          if (done) { break; }

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) { continue; }

            const data = line.slice(6);
            if (data === '[DONE]') {
              yield* finalizeToolCalls();
              if (lastChunk?.usage) { yield { type: 'usage', inputTokens: lastChunk.usage.prompt_tokens || 0, outputTokens: lastChunk.usage.completion_tokens || 0 }; }
              yield { type: 'end' };
              return;
            }

            try {
              const chunk = JSON.parse(data);
              lastChunk = chunk;
              const delta = chunk.choices?.[0]?.delta;

              if (delta?.tool_calls) {
                for (const tc of delta.tool_calls) {
                  const idx = tc.index ?? toolCallCounter;
                  const acc = toolCalls.get(idx) || { id: tc.id || `call_${toolCallCounter++}`, name: '', args: '' };
                  if (tc.id) { acc.id = tc.id; }
                  if (tc.function?.name) { acc.name = tc.function.name; }
                  if (tc.function?.arguments) { acc.args += tc.function.arguments; }
                  toolCalls.set(idx, acc);
                }
              } else if (delta?.content) {
                yield { type: 'text', text: delta.content };
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        yield* finalizeToolCalls();
        if (lastChunk?.usage) { yield { type: 'usage', inputTokens: lastChunk.usage.prompt_tokens || 0, outputTokens: lastChunk.usage.completion_tokens || 0 }; }
        yield { type: 'end' };
        return;
      } catch (e: any) {
        clearTimeout(timeout);
        lastErr = e;

        if (attempt < maxRetries && !controller.signal.aborted) {
          const backoff = Math.pow(2, attempt - 1) * 1000;
          await new Promise(r => setTimeout(r, backoff));
          continue;
        }
      }
    }

    yield {
      type: 'error',
      error: `Request failed after ${maxRetries} attempts: ${lastErr?.message || lastErr}`,
      message: lastErr?.message || 'Unknown error',
    };
  }

  async convertToolsToProviderSchema(tools: ToolDefinition[]): Promise<any> {
    // OpenAI format is canonical, so identity mapping
    return tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.jsonSchema,
      },
    }));
  }
}

