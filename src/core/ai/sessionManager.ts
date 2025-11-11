import * as vscode from 'vscode';

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
    role: ChatRole;
    content: string;
}

interface SessionState {
    history: ChatMessage[];
}

export const MAX_HISTORY_MESSAGES = 20;

const sessionStore = new WeakMap<vscode.ExtensionContext, SessionState>();

function getSessionState(context: vscode.ExtensionContext): SessionState {
    let state = sessionStore.get(context);
    if (!state) {
        state = { history: [] };
        sessionStore.set(context, state);
    }
    return state;
}

export function getSessionHistory(context: vscode.ExtensionContext): ChatMessage[] {
    return [...getSessionState(context).history];
}

export function setSessionHistory(context: vscode.ExtensionContext, history: ChatMessage[]): void {
    getSessionState(context).history = history;
}

export function clearSessionHistory(context: vscode.ExtensionContext): void {
    getSessionState(context).history = [];
}

export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
    const filtered = messages.filter(msg => msg.role === 'user' || msg.role === 'assistant');
    if (filtered.length <= MAX_HISTORY_MESSAGES) {
        return filtered;
    }
    return filtered.slice(filtered.length - MAX_HISTORY_MESSAGES);
}

