import * as vscode from 'vscode';
import type { ChatSession } from './types.js';

const STORAGE_KEY = 'assistaX.chat.sessions';
const ACTIVE_SESSION_KEY = 'assistaX.chat.activeSessionId';

function reviveSession(raw: any): ChatSession | undefined {
    if (!raw || typeof raw !== 'object') {
        return undefined;
    }
    const id = typeof raw.id === 'string' ? raw.id : undefined;
    if (!id) {
        return undefined;
    }
    const createdAt = typeof raw.createdAt === 'number' ? raw.createdAt : Date.now();
    const updatedAt = typeof raw.updatedAt === 'number' ? raw.updatedAt : createdAt;
    const title = typeof raw.title === 'string' ? raw.title : undefined;
    const messages = Array.isArray(raw.messages) ? raw.messages.filter(Boolean).map((message: any) => {
        const role = typeof message?.role === 'string' ? message.role : undefined;
        const content = typeof message?.content === 'string' ? message.content : undefined;
        if (!role || !content) {
            return undefined;
        }
        return {
            role,
            content,
            timestamp: typeof message.timestamp === 'number' ? message.timestamp : undefined
        };
    }).filter(Boolean) : [];

    return {
        id,
        title,
        createdAt,
        updatedAt,
        messages
    };
}

export function readPersistedSessions(context: vscode.ExtensionContext): ChatSession[] {
    const stored = context.globalState.get<any[]>(STORAGE_KEY, []);
    if (!Array.isArray(stored)) {
        return [];
    }
    return stored.map(reviveSession).filter((session): session is ChatSession => !!session);
}

export function readActiveSessionId(context: vscode.ExtensionContext): string | undefined {
    const id = context.globalState.get<string>(ACTIVE_SESSION_KEY);
    return typeof id === 'string' && id ? id : undefined;
}

export async function writePersistedSessions(
    context: vscode.ExtensionContext,
    sessions: ChatSession[]
): Promise<void> {
    const serializable = sessions.map((session) => ({
        id: session.id,
        title: session.title ?? undefined,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messages: session.messages.map((message) => ({
            role: message.role,
            content: message.content,
            timestamp: message.timestamp
        }))
    }));
    await context.globalState.update(STORAGE_KEY, serializable);
}

export async function writeActiveSessionId(
    context: vscode.ExtensionContext,
    sessionId: string | undefined
): Promise<void> {
    await context.globalState.update(ACTIVE_SESSION_KEY, sessionId ?? null);
}

