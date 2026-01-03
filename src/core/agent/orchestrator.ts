import * as vscode from 'vscode';
import type { ProviderAdapter } from '../providers/base.js';
import type { InternalMessage } from './types.js';
import { ALL_TOOLS, executeToolByName, findToolByName, readFileTool, initializeTools } from '../tools/registry.js';
import { safeParseJson } from '../tools/toolUtils.js';
import { convertInternalToSession } from '../runtime/agent.js';
import { writeSessionMessages, writeSessionMessagesById } from '../runtime/sessionManager.js';

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
  sessionId: string,
  abortSignal?: AbortSignal,
  onProgress?: (msg: string) => void
): Promise<string> {
  // Initialize tools with context
  initializeTools(context);

  const systemInstruction = params.config?.systemInstruction || '';
  let internalMessages: InternalMessage[] = [...sessionHistory];

  // Reset session if requested
  if (params.reset) {
    internalMessages = [];
  }

  // Add user message if not already present (to avoid duplication if saved by provider)
  const lastMsgBefore = internalMessages[internalMessages.length - 1];
  const alreadyHasUserMsg = lastMsgBefore && lastMsgBefore.role === 'user' &&
    (typeof lastMsgBefore.content === 'string'
      ? lastMsgBefore.content === params.contents
      : (Array.isArray(lastMsgBefore.content) && lastMsgBefore.content.length > 0 && 'text' in lastMsgBefore.content[0] && (lastMsgBefore.content[0] as any).text === params.contents));

  if (!alreadyHasUserMsg) {
    internalMessages.push({
      role: 'user',
      content: [{ type: 'text', text: params.contents }],
    });
  }

  // Filter tools based on mode: chat = read_file only, agent = all tools
  const mode = params.config?.mode || 'agent';
  const tools = mode === 'chat' ? [readFileTool] : ALL_TOOLS;
  let finalResponse = '';

  // Helper to save current state
  const save = () => writeSessionMessagesById(context, sessionId, convertInternalToSession(internalMessages));

  try {
    while (true) {
      const providerRequest = await adapter.buildRequest(systemInstruction, internalMessages, tools, params.config);
      //console.log('[Assista Coder] Provider Request:', providerRequest);

      const stream = adapter.createMessageStream(providerRequest, { ...params.config, abortSignal });

      const toolCalls: Array<{ id: string; name: string; args: string }> = [];
      let streamedText = "";
      let isStreaming = false;

      try {
        for await (const event of stream) {
          if (abortSignal?.aborted) throw new Error('Request cancelled');

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
              //console.log(`[Assista Coder] Usage: ${event.inputTokens} input, ${event.outputTokens} output tokens`);
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
      } catch (e: any) {
        if (abortSignal?.aborted) {
          const content: any[] = [];
          if (streamedText.trim()) content.push({ type: 'text', text: streamedText });
          content.push({ type: 'text', text: 'Request cancelled by user.' });
          internalMessages.push({ role: 'assistant', content, timestamp: Date.now() });
          await save();
        }
        throw e;
      }

      //console.log('[Assista Coder] Final Streamed Text:', streamedText);
      //console.log('[Assista Coder] Tool Calls:', toolCalls);

      // Add assistant message (text + tool calls)
      const assistantContent: any[] = [];
      if (streamedText.trim()) assistantContent.push({ type: 'text', text: streamedText });
      for (const tc of toolCalls) assistantContent.push({ type: 'tool_use', id: tc.id, name: tc.name, input: safeParseJson(tc.args) });

      if (assistantContent.length > 0) {
        internalMessages.push({ role: 'assistant', content: assistantContent, timestamp: Date.now() });
        await save();
      }

      if (toolCalls.length === 0) return finalResponse.trim();

      // Execute tools
      for (const tc of toolCalls) {
        const args = safeParseJson(tc.args);
        const tool = findToolByName(tc.name);
        if (!tool) {
          internalMessages.push({ role: 'tool', content: [{ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify({ status: 'error', error: { message: `Unknown tool: ${tc.name}` } }) }] });
          continue;
        }

        const filename = args?.path || (tc.name === 'read_file' && args?.files?.[0]?.path) || tc.name;
        onProgress?.(JSON.stringify({ type: 'tool_execution_start', toolName: tc.name, toolId: tc.id, filename, status: 'loading', args }));

        const result = await executeToolByName(tc.name, args);

        if (abortSignal?.aborted) {
          internalMessages.push({ role: 'assistant', content: [{ type: 'text', text: 'Request cancelled by user.' }], timestamp: Date.now() });
          await save();
          throw new Error('Request cancelled');
        }

        onProgress?.(JSON.stringify({ type: 'tool_execution_complete', toolName: tc.name, toolId: tc.id, filename, status: result.status === 'success' ? 'completed' : 'error', result: result.status === 'success' ? result.result : result.error }));
        internalMessages.push({ role: 'tool', content: [{ type: 'tool_result', tool_use_id: tc.id, content: JSON.stringify(result.status === 'success' ? result.result : result.error) }] });
        await save();

        if (result.stop) return finalResponse.trim() || "Operation cancelled by tool.";
      }
    }
  } catch (e) {
    throw e;
  }
}
