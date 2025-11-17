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
        const name = params.toolCall.name as keyof typeof TOOL_REGISTRY;
        const args = Array.isArray(params.toolCall.args) ? params.toolCall.args : [];

        const rawFn = TOOL_REGISTRY[name] as unknown;
        const fn = rawFn as ToolFn;
        if (typeof fn !== 'function') { throw new Error(`Unknown tool: ${String(name)}`); }
        console.log(`[Assista X] Executing tool (explicit param): ${name}`);
        return await fn(...args);
    }

    // --- normal flow: build prompt and ask provider ---
    let sessionHistory = await readSessionMessages(context);
    const cfg = params.config ?? {};
    if (cfg.resetSession) {
        await clearActiveSession(context);
        sessionHistory = [];
    }
    const requestMessages = await assemblePrompt(params, sessionHistory);

    // We'll implement a small loop to handle toolCall -> execute -> feed result back -> re-call provider
    const MAX_TOOL_CALLS = 3;
    let iterations = 0;
    let lastAssistantResponse: any = null;

    // initial provider call
    let providerResponse = await callProvider(requestMessages, params, context);
    lastAssistantResponse = providerResponse;

    while (iterations < MAX_TOOL_CALLS) {
        iterations++;

        // normalize providerResponse to string content (provider may return object)
        const content = typeof providerResponse === 'string' ? providerResponse : (providerResponse?.content ?? JSON.stringify(providerResponse));

        // try to extract JSON from assistant response (robust: tries to find first {...} block)
        let parsed: any = null;
        try {
            // first attempt: whole content is JSON
            parsed = JSON.parse(content);
        } catch (e) {
            // fallback: try to extract a JSON block using regex
            const jsonBlockMatch = content.match(/\{[\s\S]*\}/);
            if (jsonBlockMatch) {
                try { parsed = JSON.parse(jsonBlockMatch[0]); } catch { parsed = null; }
            }
        }

        const call = parsed?.toolCall ?? parsed?.tool_call ?? null;
        if (!call) { break; } // no toolCall -> done

        // Validate tool call shape
        const name = call.name;
        const args = Array.isArray(call.args) ? call.args : [];

        if (typeof name !== 'string') {
            throw new Error('Invalid toolCall: "name" must be a string.');
        }

        const rawFn = (TOOL_REGISTRY as any)[name];
        const fn = rawFn as ToolFn;
        if (typeof fn !== 'function') {
            throw new Error(`Unknown tool requested by assistant: ${name}`);
        }

        // Additional safety checks (example): ensure args are simple
        const unsafeArg = args.find((a: any) => a === undefined);
        if (unsafeArg !== undefined) {
            throw new Error('Invalid toolCall args: contains undefined.');
        }

        console.log(`[Assista X] Executing tool requested by model: ${name}`);
        let toolResult;
        try {
            // cast to ToolFn to avoid TS tuple spread issue
            toolResult = await fn(...args);
        } catch (err) {
            toolResult = { __toolError: String(err) };
        }

        // Persist the assistant tool call + the tool result into session history
        // Compose messages to append:
        // 1) assistant message content (the original provider response)
        // 2) system message or assistant message containing the tool result (so LLM can see it)
        try {
            // persist assistant's tool-call message
            await persistAssistantReply(context, sessionHistory, [], providerResponse);
        } catch (err) {
            console.error('[Assista X] Failed to persist assistant tool call:', err);
        }

        // Now create a message containing the tool result and append to requestMessages for the next provider call
        const toolResultMessage = {
            role: 'system',
            content: `Tool ${name} returned:\n${typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)}`
        };

        // Build next round messages: we append tool result to the previous request messages
        // (assemblePrompt returned a fresh message array earlier; we should rebuild from session+user to keep things consistent)
        // For simplicity, push tool result onto requestMessages and call provider again.
        requestMessages.push({ role: 'assistant', content: content }); // assistant's toolCall content
        requestMessages.push(toolResultMessage as any);

        // Call provider again to continue the conversation / produce final assistant reply
        providerResponse = await callProvider(requestMessages, params, context);
        lastAssistantResponse = providerResponse;
    }

    // After loop, persist assistant reply if session history is enabled (your original logic)
    const hasExplicitMessages = Array.isArray(params.messages) && params.messages.length > 0;
    const useSessionHistory = !hasExplicitMessages && (params.config?.useSession !== false);
    if (useSessionHistory) {
        const newMessages = Array.isArray(params.messages) && params.messages.length > 0
            ? normalizeMessages(params.messages)
            : normalizeMessages([{ role: 'user', content: params.contents }]);
        await persistAssistantReply(context, sessionHistory, newMessages, lastAssistantResponse);
    }

    return lastAssistantResponse;
}

export async function resetSession(context: vscode.ExtensionContext): Promise<void> {
    await clearActiveSession(context);
}

export async function getSessionHistory(context: vscode.ExtensionContext): Promise<ChatMessage[]> {
    return await readSessionMessages(context);
}
