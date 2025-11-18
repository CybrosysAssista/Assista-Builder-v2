import * as vscode from 'vscode';
import type { ChatMessage } from './sessionManager.js';
import { readSessionMessages,clearActiveSession} from './agent/sessionStore.js';
import { assemblePrompt, normalizeMessages } from './agent/promptBuilder.js';
import { callProvider, extractProviderContent } from './agent/providerCaller.js';
import { extractToolCall, executeToolCall, makeToolResultMessage, type ToolCall } from './agent/toolRunner.js';
import { persistAssistantReply } from './agent/sessionStore.js';

export async function runAgent(params: any = {}, context: vscode.ExtensionContext): Promise<any> {
    if (!context) { throw new Error('Extension context is required.'); }

    if (params?.toolCall) {
        const toolCall: ToolCall = {
            name: params.toolCall.name,
            args: Array.isArray(params.toolCall.args) ? params.toolCall.args : []
        };
        console.log(`[Assista X] Executing tool (explicit param): ${toolCall.name}`);
        return await executeToolCall(toolCall);
    }

    let sessionHistory = await readSessionMessages(context);
    const cfg = params.config ?? {};
    if (cfg.resetSession) {
        await clearActiveSession(context);
        sessionHistory = [];
    }

    let requestMessages = await assemblePrompt(params, sessionHistory);

    const MAX_TOOL_CALLS = 30;
    let iterations = 0;
    let lastAssistantResponse: any = null;

    let providerResponse = await callProvider(requestMessages, params, context);
    lastAssistantResponse = providerResponse;

    while (iterations < MAX_TOOL_CALLS) {
        iterations++;

        const content = extractProviderContent(providerResponse);
        const call = extractToolCall(content);
        if (!call) { break; }

        console.log(`[Assista X] Executing tool requested by model: ${call.name}`);
        const toolResult = await executeToolCall(call);

        try {
            await persistAssistantReply(context, sessionHistory, [], providerResponse);
            sessionHistory = await readSessionMessages(context);
        } catch (err) {
            console.error('[Assista X] Failed to persist assistant tool call:', err);
        }

        const toolResultMessage = makeToolResultMessage(call.name, toolResult);
        requestMessages = await assemblePrompt(params, sessionHistory);
        requestMessages.push({ role: 'assistant', content: content });
        requestMessages.push(toolResultMessage as any);

        providerResponse = await callProvider(requestMessages, params, context);
        lastAssistantResponse = providerResponse;
    }

    const hasExplicitMessages = Array.isArray(params.messages) && params.messages.length > 0;
    const useSessionHistory = !hasExplicitMessages && (params.config?.useSession !== false);
    if (useSessionHistory) {
        const currentSessionHistory = await readSessionMessages(context);
        const newMessages = Array.isArray(params.messages) && params.messages.length > 0
            ? normalizeMessages(params.messages)
            : normalizeMessages([{ role: 'user', content: params.contents }]);
        await persistAssistantReply(context, currentSessionHistory, newMessages, lastAssistantResponse);
    }

    return lastAssistantResponse;
}

export async function resetSession(context: vscode.ExtensionContext): Promise<void> {
    await clearActiveSession(context);
}

export async function getSessionHistory(context: vscode.ExtensionContext): Promise<ChatMessage[]> {
    return await readSessionMessages(context);
}
