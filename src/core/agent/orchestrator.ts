import * as vscode from 'vscode';
import type { ProviderAdapter } from '../providers/base.js';
import type { InternalMessage } from './types.js';
import { ALL_TOOLS, executeToolByName, findToolByName, readFileTool } from '../tools/registry.js';
import { safeParseJson } from '../tools/toolUtils.js';
import { log } from 'console';

// const MAX_TOOL_ITERATIONS = 8;

/**
 * Run agent with provider-agnostic orchestrator
 */
export async function runAgentOrchestrator(
  params: {
    contents: string;
    config?: any;
    reset?: boolean;
  },
  context: vscode.ExtensionContext,
  adapter: ProviderAdapter,
  sessionHistory: InternalMessage[]
): Promise<string> {
  const systemInstruction = params.config?.systemInstruction || '';
  let internalMessages: InternalMessage[] = [...sessionHistory];

  // Reset session if requested
  if (params.reset) {
    internalMessages = [];
  }

  // Add user message
  internalMessages.push({
    role: 'user',
    content: [{ type: 'text', text: params.contents }],
  });

  // Filter tools based on mode: chat = read_file only, agent = all tools
  const mode = params.config?.mode || 'agent';
  const tools = mode === 'chat' ? [readFileTool] : ALL_TOOLS;
  // let iterations = 0;
  let finalResponse = '';

  while (true) {
    // if (++iterations > MAX_TOOL_ITERATIONS) {
    //   throw new Error(`Too many tool iterations (${MAX_TOOL_ITERATIONS}). Possible infinite loop.`);
    // }

    // Build request
    const providerRequest = await adapter.buildRequest(
      systemInstruction,
      internalMessages,
      tools,
      params.config
    );
    console.log('[Assista X] Provider Request:', providerRequest);

    // Create message stream
    const stream = adapter.createMessageStream(providerRequest, params.config);

    const toolCalls: Array<{ id: string; name: string; args: string }> = [];
    let assistantContent: InternalMessage['content'] = [];
    console.log('[Assista X] Starting to process stream...');
    // Process stream
    for await (const event of stream) {
      // console.log('[Assista X] Event:', event);
      // console.log('[Assista X] Event type:', event.type);
      switch (event.type) {
        case 'text':
          finalResponse += event.text;
          assistantContent.push({ type: 'text', text: event.text });
          break;

        case 'reasoning':
          // Include reasoning in response
          finalResponse += event.text;
          assistantContent.push({ type: 'reasoning', text: event.text });
          break;

        case 'tool_call':
          toolCalls.push({
            id: event.id,
            name: event.name,
            args: event.args,
          });
          assistantContent.push({
            type: 'tool_use',
            id: event.id,
            name: event.name,
            input: safeParseJson(event.args),
          });
          break;

        case 'usage':
          // Log usage if needed
          console.log(`[Assista X] Usage: ${event.inputTokens} input, ${event.outputTokens} output tokens`);
          break;

        case 'error':
          throw new Error(event.error);

        case 'end':
          // Stream ended
          break;
      }
    }
    console.log('[Assista X] Assistant content:', assistantContent);
    // If we have assistant content, add it to messages
    if (assistantContent.length > 0) {
      internalMessages.push({
        role: 'assistant',
        content: assistantContent,
      });
    }

    // If we have tool calls, execute them and continue loop
    if (toolCalls.length > 0) {
      // Execute all tool calls
      for (const toolCall of toolCalls) {
        // Parse arguments
        const args = safeParseJson(toolCall.args);

        // Find and execute tool
        const tool = findToolByName(toolCall.name);
        if (!tool) {
          // Add error as tool result
          internalMessages.push({
            role: 'tool',
            content: [{
              type: 'tool_result',
              tool_use_id: toolCall.id,
              content: JSON.stringify({
                status: 'error',
                error: {
                  message: `Unknown tool: ${toolCall.name}`,
                  code: 'UNKNOWN_TOOL',
                },
              }),
            }],
          });
          continue;
        }

        // Execute tool
        const toolResult = await executeToolByName(toolCall.name, args);

        // Add tool result to conversation
        const resultContent = toolResult.status === 'success'
          ? JSON.stringify(toolResult.result)
          : JSON.stringify(toolResult.error || { message: 'Unknown error' });

        internalMessages.push({
          role: 'tool',
          content: [{
            type: 'tool_result',
            tool_use_id: toolCall.id,
            content: resultContent,
          }],
        });
      }

      // Reset final response for next iteration
      finalResponse = '';
      // Continue loop to send tool results back to model
      continue;
    }

    // No tool calls - we have final response
    return finalResponse.trim();
  }
}

