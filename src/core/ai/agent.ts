import * as vscode from 'vscode';
import { getActiveProviderConfig } from '../services/configService.js';
import { generateWithOpenAICompat } from './providers/openai.js';
import { generateWithGoogle } from './providers/google.js';
import * as tools from '../services/toolService.js';
import {
    ChatMessage,
    clearActiveSession,
    readSessionMessages,
    writeSessionMessages,
    trimHistory
} from './sessionManager.js';

export interface ProviderConfig {
    apiKey: string;
    model: string;
    customUrl?: string;
}

type ToolFn = (...args: any[]) => Promise<any> | any;

const TOOL_REGISTRY: Record<string, ToolFn> = {
    list_files: tools.listFiles,
    listFiles: tools.listFiles,
    get_file_content: tools.getFileContent,
    getFileContent: tools.getFileContent,
    write_file: tools.writeFileContent,
    writeFileContent: tools.writeFileContent,
    search_in_project: tools.searchInProject,
    searchInProject: tools.searchInProject,
};

function normalizeMessages(raw: any[]): ChatMessage[] {
    if (!Array.isArray(raw)) {
        return [];
    }
    const normalized: ChatMessage[] = [];
    for (const entry of raw) {
        if (!entry) continue;
        const rawRole = typeof entry.role === 'string' ? entry.role.toLowerCase() : 'user';
        const role: ChatMessage['role'] =
            rawRole === 'assistant' ? 'assistant' :
            rawRole === 'system' ? 'system' : 'user';
        const rawContent = (entry as any).content;
        if (rawContent == null) continue;
        const text = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
        if (!text.trim()) continue;
        normalized.push({ role, content: text });
    }
    return normalized;
}

export async function generateContent(params: any = {}, context: vscode.ExtensionContext): Promise<any> {
    if (!context) {
        throw new Error('Extension context is required.');
    }

    if (params?.toolCall) {
        const name: string | undefined = params.toolCall?.name;
        const args: any[] = Array.isArray(params.toolCall?.args) ? params.toolCall.args : [];
        const toolFn = name ? TOOL_REGISTRY[name] : undefined;
        if (!toolFn) {
            throw new Error(`Tool "${name ?? '<unknown>'}" is not registered.`);
        }
        return await toolFn(...args);
    }

    let sessionHistory = await readSessionMessages(context);
    const config = params.config = params.config ?? {};

    if (config.resetSession) {
        await clearActiveSession(context);
        sessionHistory = [];
    }

    const hasExplicitMessages = Array.isArray(params.messages) && params.messages.length > 0;
    const useSessionHistory = !hasExplicitMessages && config.useSession !== false;
    const systemInstruction = typeof config.systemInstruction === 'string'
        ? config.systemInstruction.trim()
        : '';

    const newMessages = hasExplicitMessages
        ? normalizeMessages(params.messages)
        : normalizeMessages([{ role: 'user', content: params.contents }]);

    if (!newMessages.length) {
        throw new Error('generateContent requires at least one user message.');
    }

    const requestMessages: ChatMessage[] = [];
    if (systemInstruction) {
        requestMessages.push({ role: 'system', content: systemInstruction });
    }
    if (useSessionHistory && sessionHistory.length) {
        requestMessages.push(...trimHistory(sessionHistory));
    }
    requestMessages.push(...newMessages);

    const requestPayload = {
        ...params,
        messages: requestMessages.map(msg => ({ role: msg.role, content: msg.content })),
    };
    delete (requestPayload as any).contents;

    try {
        console.log('[Assista X] AI request payload:', JSON.stringify(requestPayload, null, 2));
    } catch {
        console.log('[Assista X] AI request payload (raw):', requestPayload);
    }

    const { provider, config: providerConfig } = await getActiveProviderConfig(context);

    const response = provider === 'google'
        ? await generateWithGoogle(requestPayload, providerConfig, context)
        : await generateWithOpenAICompat(requestPayload, providerConfig, provider, context);

    try {
        console.log('[Assista X] AI response payload:', typeof response === 'string' ? response : JSON.stringify(response, null, 2));
    } catch {
        console.log('[Assista X] AI response payload (raw):', response);
    }

    if (useSessionHistory) {
        const assistantContent = typeof response === 'string'
            ? response
            : JSON.stringify(response, null, 2);
        const updatedHistory: ChatMessage[] = [
            ...sessionHistory,
            ...newMessages,
            { role: 'assistant', content: assistantContent },
        ];
        await writeSessionMessages(context, updatedHistory);
    }

    return response;
}

export async function resetSession(context: vscode.ExtensionContext): Promise<void> {
    await clearActiveSession(context);
}

export async function getSessionHistory(context: vscode.ExtensionContext): Promise<ChatMessage[]> {
    return await readSessionMessages(context);
}

export async function generateOdooModule(): Promise<never> {
    throw new Error('Module generation has been removed in the simplified AI pipeline.');
}

