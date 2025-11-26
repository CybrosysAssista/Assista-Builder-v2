import * as vscode from 'vscode';
import { readSessionMessages, clearActiveSession, writeSessionMessages } from './sessionManager.js';
import { getActiveProviderConfig } from '../config/configService.js';
import { getSystemInstruction } from './prompts/systemPrompts.js';
import { createProvider } from '../providers/factory.js';
import { runAgentOrchestrator } from '../agent/orchestrator.js';
import type { InternalMessage } from '../agent/types.js';
import type { ChatMessage, ChatRole } from './sessions/types.js';
import { OdooEnvironmentService } from '../utils/odooDetection.js';

/**
 * Convert session messages to internal message format
 */
function convertSessionToInternal(sessionMessages: ChatMessage[]): InternalMessage[] {
  return sessionMessages
    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
    .map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: typeof msg.content === 'string'
        ? [{ type: 'text' as const, text: msg.content }]
        : msg.content,
      timestamp: msg.timestamp,
    }));
}

/**
 * Convert internal messages back to session format
 */
function convertInternalToSession(internalMessages: InternalMessage[]): ChatMessage[] {
  return internalMessages
    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
    .map(msg => {
      let content = '';
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else {
        // Extract text from blocks
        const textBlocks = msg.content.filter(block => block.type === 'text');
        content = textBlocks.map(block => (block as any).text).join('\n');
      }
      return {
        role: msg.role as ChatRole,
        content,
        timestamp: msg.timestamp,
      };
    });
}

export async function runAgent(
  params: any = {},
  context: vscode.ExtensionContext,
  odooEnvService: OdooEnvironmentService
): Promise<string> {
  if (!context) { throw new Error("Extension context is required."); }

  const cfg = params.config ?? {};
  let sessionHistory = await readSessionMessages(context);

  if (cfg.resetSession) {
    await clearActiveSession(context);
    sessionHistory = [];
  }

  // Get provider configuration
  const { provider: providerName, config: providerConfig } = await getActiveProviderConfig(context);
  const configSection = vscode.workspace.getConfiguration('assistaX');
  const customInstructions = configSection.get<string>('systemPrompt.customInstructions', '');

  // Create provider adapter
  const adapter = createProvider(providerName, providerConfig, context);

  // Convert session history to internal format
  const internalHistory = convertSessionToInternal(sessionHistory);

  // Get environment and system instruction with mode
  const mode = params.mode || 'agent';
  const environment = await odooEnvService.getEnvironment();
  const systemInstruction = getSystemInstruction(customInstructions, mode, environment);
  // console.log('environment', environment);
  // console.log('systemInstruction', systemInstruction);
  // Run orchestrator
  const userContent = typeof params.contents === 'string' ? params.contents : String(params.contents || '');

  const requestPayload = {
    contents: userContent,
    config: {
      ...params.config,
      systemInstruction,
      mode: params.mode || 'agent',
    },
    reset: cfg.resetSession,
  };

  // Log request before calling orchestrator
  // console.log('[Assista X] Request to orchestrator:',requestPayload);
  // console.log('[Assista X] context:',context);
  // console.log('[Assista X] adapter:',adapter);
  // console.log('[Assista X] Internal history:',internalHistory);

  const response = await runAgentOrchestrator(
    requestPayload,
    context,
    adapter,
    internalHistory
  );

  // Log response after orchestrator call
  // console.log('[Assista X] Response from orchestrator:', response);

  // Convert back to session format and persist
  const updatedInternalHistory: InternalMessage[] = [
    ...internalHistory,
    {
      role: 'user',
      content: [{ type: 'text', text: userContent }],
      timestamp: Date.now(),
    },
    {
      role: 'assistant',
      content: [{ type: 'text', text: response }],
      timestamp: Date.now(),
    },
  ];

  const updatedSessionHistory = convertInternalToSession(updatedInternalHistory);
  await writeSessionMessages(context, updatedSessionHistory);

  return response;
}

export async function resetSession(context: vscode.ExtensionContext): Promise<void> {
  await clearActiveSession(context);
}

export async function getSessionHistory(context: vscode.ExtensionContext) {
  return await readSessionMessages(context);
}
