import * as vscode from 'vscode';
import type { ProviderAdapter } from './base-provider.js';
import type { InternalMessage, ToolDefinition, NormalizedEvent } from '../agent/types.js';
import { ProviderConfig } from '../ai/providers/types.js';
import { convertInternalMessagesToGemini } from '../transform/gemini-format.js';

export class GeminiAdapter implements ProviderAdapter {
  name = 'gemini';
  private client: any;
  private config: ProviderConfig;

  constructor(config: ProviderConfig, _context: vscode.ExtensionContext) {
    this.config = config;
  }

  async buildRequest(
    systemInstruction: string,
    messages: InternalMessage[],
    tools?: ToolDefinition[],
    options?: any
  ): Promise<any> {
    // Initialize client if needed
    if (!this.client) {
      const { GoogleGenAI } = await import('@google/genai');
      this.client = new GoogleGenAI({ apiKey: this.config.apiKey });
    }

    // Convert internal messages to Gemini format
    const { contents, toolIdToName } = convertInternalMessagesToGemini(messages);

    // Convert tools to Gemini format
    const toolsConfig: any[] = [];
    if (tools && tools.length > 0) {
      const functionDeclarations = tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        parametersJsonSchema: tool.jsonSchema,
      }));

      toolsConfig.push({
        functionDeclarations,
      });
    }

    // Build config
    const generateConfig: any = {
      systemInstruction: systemInstruction || undefined,
      ...(toolsConfig.length > 0 ? { tools: toolsConfig } : {}),
    };

    return {
      model: this.config.model,
      contents,
      config: generateConfig,
      toolIdToName, // Store for response processing
    };
  }

  async *createMessageStream(
    request: any,
    options?: any
  ): AsyncIterable<NormalizedEvent> {
    const { model, contents, config } = request;
    let lastError: Error | null = null;
    let toolCallCounter = 0;

    const requestPayload = {
      model,
      contents,
      ...(Object.keys(config).length > 0 ? { config } : {}),
    };

    for (let attempt = 1; attempt <= 5; attempt++) {
      try {
        const response = await this.client.models.generateContentStream(requestPayload);

        let hasToolCalls = false;
        let lastUsage: any = null;

        for await (const chunk of response) {
          if (chunk.candidates && chunk.candidates.length > 0) {
            const candidate = chunk.candidates[0];

            if (candidate.content?.parts) {
              for (const part of candidate.content.parts as Array<{
                text?: string;
                functionCall?: { name: string; args: Record<string, unknown> };
              }>) {
                if (part.functionCall) {
                  hasToolCalls = true;
                  const callId = `${part.functionCall.name}-${toolCallCounter++}`;
                  yield {
                    type: 'tool_call',
                    id: callId,
                    name: part.functionCall.name,
                    args: JSON.stringify(part.functionCall.args || {}),
                  };
                } else if (part.text) {
                  yield {
                    type: 'text',
                    text: part.text,
                  };
                }
              }
            }
          }

          // Store usage metadata for later
          if (chunk.usageMetadata) {
            lastUsage = chunk.usageMetadata;
          }
        }

        // Yield usage at the end
        if (lastUsage) {
          yield {
            type: 'usage',
            inputTokens: lastUsage.promptTokenCount || 0,
            outputTokens: lastUsage.candidatesTokenCount || 0,
          };
        }

        yield { type: 'end' };
        return;
      } catch (error) {
        lastError = error as Error;
        if (attempt < 5) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        } else {
          yield {
            type: 'error',
            error: `Gemini API failed after 5 attempts: ${lastError?.message}`,
            message: lastError?.message || 'Unknown error',
          };
          return;
        }
      }
    }
  }

  async convertToolsToProviderSchema(tools: ToolDefinition[]): Promise<any> {
    return tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      parametersJsonSchema: tool.jsonSchema,
    }));
  }
}

