import * as vscode from 'vscode';
import type { ProviderAdapter } from '../providers/base.js';
import type { InternalMessage } from './types.js';
import { ALL_TOOLS, executeToolByName, findToolByName, readFileTool } from '../tools/registry.js';
import { safeParseJson } from '../tools/toolUtils.js';
import { convertInternalToSession } from '../runtime/agent.js';
import { writeSessionMessages } from '../runtime/sessionManager.js';

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
  sessionHistory: InternalMessage[],
  abortSignal?: AbortSignal,
  onProgress?: (msg: string) => void
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
    const stream = adapter.createMessageStream(providerRequest, { ...params.config, abortSignal });

    const toolCalls: Array<{ id: string; name: string; args: string }> = [];
    let streamedText = "";
    let isStreaming = false;

    // Process stream
    for await (const event of stream) {
      // Check if cancelled
      if (abortSignal?.aborted) {
        throw new Error('Request cancelled');
      }

      switch (event.type) {
        case 'text':
        case 'reasoning':
          streamedText += event.text;
          finalResponse += event.text;
          onProgress?.(JSON.stringify({
            type: isStreaming ? 'stream_append' : 'stream_start',
            text: event.text
          }));
          isStreaming = true;
          break;

        case 'tool_call':
          if (isStreaming) {
            onProgress?.(JSON.stringify({ type: 'stream_end' }));
            isStreaming = false;
          }
          toolCalls.push({
            id: event.id,
            name: event.name,
            args: event.args
          });
          break;

        case 'usage':
          // Log usage if needed
          console.log(`[Assista X] Usage: ${event.inputTokens} input, ${event.outputTokens} output tokens`);
          break;

        case 'error':
          throw new Error(event.error);

        case 'end':
          // Stream ended - mark streaming as complete
          if (isStreaming) {
            onProgress?.(JSON.stringify({ type: 'stream_end' }));
            isStreaming = false;
          }
          break;
      }
    }

    console.log('[Assista X] Final Streamed Text:', streamedText);
    console.log('[Assista X] Tool Calls:', toolCalls);

    // Build assistant message with both text and tool calls
    const assistantContent: any[] = [];

    // Add text content if present
    if (streamedText.trim()) {
      assistantContent.push({ type: 'text', text: streamedText });
    }

    // Add tool use blocks
    for (const toolCall of toolCalls) {
      assistantContent.push({
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.name,
        input: safeParseJson(toolCall.args),
      });
    }

    // Push single assistant message with all content
    if (assistantContent.length > 0) {
      internalMessages.push({
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now()
      });
    }

    // If we have tool calls, execute them and continue loop
    if (toolCalls.length > 0) {
      // Execute all tool calls
      for (const toolCall of toolCalls) {
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

        // Check if tool requested to stop execution (e.g. user rejected changes)
        if (toolResult.stop) {
          await writeSessionMessages(context, convertInternalToSession(internalMessages));
          return finalResponse.trim() || "Operation cancelled by tool.";
        }
      }

      // Reset for next iteration
      finalResponse = '';

      // Continue loop to send tool results back to model
      continue;
    }

    // No tool calls - we have final response
    await writeSessionMessages(context, convertInternalToSession(internalMessages));
    return finalResponse.trim();
  }
}
