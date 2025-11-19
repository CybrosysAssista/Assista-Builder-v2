import type { ChatMessage } from '../sessionManager.js';
import { getSystemPrompts } from '../prompts/systemPrompts.js';
import { trimHistory } from '../sessionManager.js';

export function normalizeMessages(raw: any[]): ChatMessage[] {
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
        if (rawContent === null || rawContent === undefined) { continue; }
        const text = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        if (!text.trim()) { continue; }
        normalized.push({ role, content: text });
    }
    return normalized;
}

/** Build the final messages array for provider call.
 *  Hook point: future RAG/context injection should be applied here.
 */
export async function assemblePrompt(
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
