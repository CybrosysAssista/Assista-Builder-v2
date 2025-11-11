import * as vscode from 'vscode';
import { getActiveProviderConfig } from '../services/configService.js';
import { generateWithOpenAICompat } from './providers/openai.js';
import { generateWithGoogle } from './providers/google.js';
import * as tools from '../services/toolService.js';

export interface ProviderConfig {
    apiKey: string;
    model: string;
    customUrl?: string;
}

export interface AppSettings {
    activeProvider: string;
    providers: { [key: string]: ProviderConfig };
}

type ChatMessage = {
    role: 'system' | 'user' | 'assistant';
    content: string;
};

interface SessionState {
    history: ChatMessage[];
}

const MAX_HISTORY_MESSAGES = 20;
const sessionStore = new WeakMap<vscode.ExtensionContext, SessionState>();

const TOOL_REGISTRY: Record<string, (...args: any[]) => Promise<any> | any> = {
    list_files: tools.listFiles,
    listFiles: tools.listFiles,
    get_file_content: tools.getFileContent,
    getFileContent: tools.getFileContent,
    write_file: tools.writeFileContent,
    writeFileContent: tools.writeFileContent,
    search_in_project: tools.searchInProject,
    searchInProject: tools.searchInProject,
};

function getSessionState(context: vscode.ExtensionContext): SessionState {
    let state = sessionStore.get(context);
    if (!state) {
        state = { history: [] };
        sessionStore.set(context, state);
    }
    return state;
}

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

function trimHistory(messages: ChatMessage[]): ChatMessage[] {
    const filtered = messages.filter(msg => msg.role === 'user' || msg.role === 'assistant');
    if (filtered.length <= MAX_HISTORY_MESSAGES) {
        return filtered;
    }
    return filtered.slice(filtered.length - MAX_HISTORY_MESSAGES);
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

    const session = getSessionState(context);
    const config = params.config = params.config ?? {};

    if (config.resetSession) {
        session.history = [];
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
    if (useSessionHistory && session.history.length) {
        requestMessages.push(...session.history);
    }
    requestMessages.push(...newMessages);

    const requestPayload = {
        ...params,
        messages: requestMessages.map(msg => ({ role: msg.role, content: msg.content })),
    };
    delete (requestPayload as any).contents;

    const { provider, config: providerConfig } = await getActiveProviderConfig(context);

    const response = provider === 'google'
        ? await generateWithGoogle(requestPayload, providerConfig, context)
        : await generateWithOpenAICompat(requestPayload, providerConfig, provider, context);

    if (useSessionHistory) {
        const updatedHistory = [
            ...session.history,
            ...newMessages,
            { role: 'assistant', content: response } as ChatMessage,
        ];
        session.history = trimHistory(updatedHistory);
    }

    return response;
}

export function resetSession(context: vscode.ExtensionContext): void {
    getSessionState(context).history = [];
}

export function getSessionHistory(context: vscode.ExtensionContext): ChatMessage[] {
    return [...getSessionState(context).history];
}

export async function generateOdooModule(): Promise<never> {
    throw new Error('Module generation has been removed in the simplified AI pipeline.');
}

