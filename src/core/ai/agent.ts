import * as vscode from 'vscode';
import { getActiveProviderConfig } from '../services/configService.js';
import { generateWithOpenAICompat } from './providers/openai.js';
import { generateWithGoogle } from './providers/google.js';
import {
    ChatMessage,
    clearActiveSession,
    readSessionMessages,
    writeSessionMessages,
    trimHistory
} from './sessionManager.js';
import { getSystemPrompts } from './prompts/systemPrompts.js';
import { TOOL_REGISTRY } from '../tools/registry.js';

type ToolFn = (...args: any[]) => Promise<any> | any;

function normalizeMessages(raw: any[]): ChatMessage[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const normalized: ChatMessage[] = [];
    for (const entry of raw) {
        if (!entry) { continue; }
        const rawRole = typeof entry.role === 'string' ? entry.role.toLowerCase() : 'user';
        const role: ChatMessage['role'] =
            rawRole === 'assistant' ? 'assistant' :
                rawRole === 'system' ? 'system' : 'user';
        const rawContent = (entry as any).content;
        if (rawContent === null) { continue; }
        const text = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        if (!text.trim()) { continue; }
        normalized.push({ role, content: text });
    }
    return normalized;
}

/** Build the final messages array for provider call.
 *  Hook point: future RAG/context injection should be applied here.
 */
async function assemblePrompt(
    params: any,
    sessionHistory: ChatMessage[]
): Promise<ChatMessage[]> {
    const config = params.config ?? {};
    const hasExplicitMessages = Array.isArray(params.messages) && params.messages.length > 0;
    const useSessionHistory = !hasExplicitMessages && config.useSession !== false;
    const systemInstruction = typeof config.systemInstruction === 'string'
        ? config.systemInstruction.trim()
        : '';

    const newMessages = hasExplicitMessages
        ? normalizeMessages(params.messages)
        : normalizeMessages([{ role: 'user', content: params.contents }]);

    if (!newMessages.length) { throw new Error('runAgent requires at least one user message.'); }

    // Future: insert RAG/context here, e.g. await attachRagContext(...)
    const messages: ChatMessage[] = getSystemPrompts();
    if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
    }
    if (useSessionHistory && sessionHistory.length) {
        messages.push(...trimHistory(sessionHistory));
    }
    messages.push(...newMessages);

    return messages;
}

/** Call the configured provider with the assembled payload */
async function callProvider(
    messages: ChatMessage[],
    params: any,
    context: vscode.ExtensionContext
): Promise<any> {
    // Build payload - keep all params but replace messages with sanitized role/content objects
    const payload = {
        ...params,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
    };
    delete (payload as any).contents;

    // Resolve provider config (throws if missing)
    const { provider, config: providerConfig } = await getActiveProviderConfig(context);

    // Hook point: you could perform pre-call transformations here (rate-limiting, chunking)
    console.log('[Assista X] Provider request payload:', payload);
    let providerResponse;
    if (provider === 'google') {
        providerResponse = await generateWithGoogle(payload, providerConfig, context);
    } else {
        providerResponse = await generateWithOpenAICompat(payload, providerConfig, provider, context);
    }
    console.log('[Assista X] Provider response:', providerResponse);
    return providerResponse;
}

/** Persist assistant reply into session store (keeps existing behaviour) */
async function persistAssistantReply(
    context: vscode.ExtensionContext,
    previousHistory: ChatMessage[],
    newMessages: ChatMessage[],
    assistantResponse: any
): Promise<void> {
    // Convert assistant response to string (keep same behavior as before)
    const assistantContent = typeof assistantResponse === 'string'
        ? assistantResponse
        : JSON.stringify(assistantResponse, null, 2);

    // Append to history and write back
    // Note: we mutate a copy to avoid surprises with callers
    const updated: ChatMessage[] = [
        ...previousHistory,
        ...newMessages,
        { role: 'assistant', content: assistantContent },
    ];
    await writeSessionMessages(context, updated);
}

export async function runAgent(params: any = {}, context: vscode.ExtensionContext): Promise<any> {
    if (!context) { throw new Error('Extension context is required.'); }
    if (params?.toolCall) {
        const name = params.toolCall.name  as keyof typeof TOOL_REGISTRY;
        const args = Array.isArray(params.toolCall.args) ? params.toolCall.args : [];

        const fn = TOOL_REGISTRY[name] as ToolFn | undefined;
        if (!fn) {
            throw new Error(`Unknown tool: ${name}`);
        }

        console.log(`[Assista X] Executing tool: ${name}`);
        return await fn(...args);
    }

    // Load session history
    let sessionHistory = await readSessionMessages(context);

    // Support resetSession flag in config (existing behavior)
    const cfg = params.config ?? {};
    if (cfg.resetSession) {
        await clearActiveSession(context);
        sessionHistory = [];
    }

    // Build messages (includes system + session + new user messages)
    const requestMessages = await assemblePrompt(params, sessionHistory);

    // Call LLM provider
    const response = await callProvider(requestMessages, params, context);

    // Persist assistant response only when session usage is enabled
    const hasExplicitMessages = Array.isArray(params.messages) && params.messages.length > 0;
    const useSessionHistory = !hasExplicitMessages && (params.config?.useSession !== false);
    if (useSessionHistory) {
        // Determine which messages are the "new" ones that we appended (they are the tail of requestMessages)
        // We can reconstruct new messages as those after any injected system/session items.
        // Simpler: reuse normalizeMessages on the original input path
        const newMessages = Array.isArray(params.messages) && params.messages.length > 0
            ? normalizeMessages(params.messages)
            : normalizeMessages([{ role: 'user', content: params.contents }]);
        await persistAssistantReply(context, sessionHistory, newMessages, response);
    }

    return response;
}

export async function resetSession(context: vscode.ExtensionContext): Promise<void> {
    await clearActiveSession(context);
}

export async function getSessionHistory(context: vscode.ExtensionContext): Promise<ChatMessage[]> {
    return await readSessionMessages(context);
}
