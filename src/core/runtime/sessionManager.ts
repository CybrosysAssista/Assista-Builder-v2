import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import type { ChatMessage, ChatSession } from './sessions/types.js';
import {
    readActiveSessionId,
    readPersistedSessions,
    writeActiveSessionId,
    writePersistedSessions
} from './sessions/storage.js';

export type { ChatRole, ChatMessage, ChatSession } from './sessions/types.js';

interface SessionState {
    loaded: boolean;
    sessions: ChatSession[];
    activeSessionId?: string;
}


const RUNTIME_STATE = new WeakMap<vscode.ExtensionContext, SessionState>();

function deepClone<T>(value: T): T {
    const clone = (globalThis as typeof globalThis & { structuredClone?: typeof structuredClone }).structuredClone;
    if (typeof clone === 'function') {
        return clone(value);
    }
    return JSON.parse(JSON.stringify(value)) as T;
}

function ensureState(context: vscode.ExtensionContext): SessionState {
    let state = RUNTIME_STATE.get(context);
    if (!state) {
        state = { loaded: false, sessions: [], activeSessionId: undefined };
        RUNTIME_STATE.set(context, state);
    }
    return state;
}

function sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages
        .filter((message) => (typeof message.content === 'string' && message.content.trim().length > 0) || (message.toolExecutions && message.toolExecutions.length > 0))
        .map((message) => ({
            role: message.role,
            content: message.content,
            timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
            suggestions: message.suggestions,
            selection: message.selection,
            toolExecutions: message.toolExecutions
        }));
}

function deriveTitle(messages: ChatMessage[]): string {
    const firstUser = messages.find((message) => message.role === 'user' && message.content.trim());
    if (!firstUser) {
        return 'Untitled';
    }
    return firstUser.content.replace(/\s+/g, ' ').slice(0, 40) || 'Untitled';
}

function createSession(): ChatSession {
    const now = Date.now();
    return {
        id: randomUUID(),
        title: undefined,
        createdAt: now,
        updatedAt: now,
        messages: []
    };
}

async function persist(context: vscode.ExtensionContext, state: SessionState): Promise<void> {
    const sessionsWithMessages = state.sessions.filter((session) => session.messages.length > 0);
    for (const session of sessionsWithMessages) {
        if (!session.title || !session.title.trim()) {
            session.title = deriveTitle(session.messages);
        }
    }

    // Always persist the active session ID, even if the session is empty
    // This is crucial for new chat sessions that haven't received messages yet
    const activeId = state.activeSessionId;

    await Promise.all([
        writePersistedSessions(context, deepClone(sessionsWithMessages)),
        writeActiveSessionId(context, activeId)
    ]);
}

async function ensureLoaded(context: vscode.ExtensionContext): Promise<SessionState> {
    const state = ensureState(context);
    if (state.loaded) {
        return state;
    }

    state.sessions = deepClone(readPersistedSessions(context));
    state.activeSessionId = readActiveSessionId(context);

    if (!state.sessions.length) {
        const session = createSession();
        state.sessions = [session];
        state.activeSessionId = session.id;
        await persist(context, state);
    } else if (!state.activeSessionId || !state.sessions.some((session) => session.id === state.activeSessionId)) {
        const fallback = state.sessions[0];
        state.activeSessionId = fallback.id;
        await persist(context, state);
    }

    state.loaded = true;
    return state;
}

async function getMutableActiveSession(context: vscode.ExtensionContext): Promise<ChatSession> {
    const state = await ensureLoaded(context);
    const activeId = state.activeSessionId ?? state.sessions[0]?.id;
    if (!activeId) {
        const session = createSession();
        state.sessions = [session];
        state.activeSessionId = session.id;
        await persist(context, state);
        return session;
    }
    const session = state.sessions.find((candidate) => candidate.id === activeId);
    if (!session) {
        const fallback = state.sessions[0] ?? createSession();
        state.activeSessionId = fallback.id;
        if (!state.sessions.includes(fallback)) {
            state.sessions.unshift(fallback);
        }
        await persist(context, state);
        return fallback;
    }
    return session;
}

export async function getActiveSession(context: vscode.ExtensionContext): Promise<ChatSession> {
    const session = await getMutableActiveSession(context);
    return deepClone(session);
}

export async function readSessionMessages(context: vscode.ExtensionContext): Promise<ChatMessage[]> {
    const session = await getMutableActiveSession(context);
    return deepClone(session.messages);
}

export async function writeSessionMessages(
    context: vscode.ExtensionContext,
    history: ChatMessage[]
): Promise<void> {
    const state = await ensureLoaded(context);
    const session = await getMutableActiveSession(context);
    const sanitized = (sanitizeMessages(history));
    session.messages = sanitized;
    session.updatedAt = sanitized.length ? Date.now() : session.updatedAt;
    session.title = deriveTitle(session.messages);
    await persist(context, state);
}

export async function clearActiveSession(context: vscode.ExtensionContext): Promise<void> {
    const state = await ensureLoaded(context);
    const session = await getMutableActiveSession(context);
    session.messages = [];
    session.updatedAt = Date.now();
    await persist(context, state);
}

export async function startNewSession(
    context: vscode.ExtensionContext,
    initialMessages: ChatMessage[] = []
): Promise<ChatSession> {
    const state = await ensureLoaded(context);
    const session = createSession();
    session.messages = sanitizeMessages(initialMessages);
    session.updatedAt = session.messages.length ? Date.now() : session.updatedAt;
    if (session.messages.length) {
        session.title = deriveTitle(session.messages);
    }
    state.sessions.unshift(session);
    state.activeSessionId = session.id;
    await persist(context, state);
    return deepClone(session);
}

export async function switchActiveSession(
    context: vscode.ExtensionContext,
    sessionId: string
): Promise<ChatSession> {
    const state = await ensureLoaded(context);
    const target = state.sessions.find((session) => session.id === sessionId);
    if (!target) {
        throw new Error(`Chat session "${sessionId}" not found.`);
    }
    state.activeSessionId = sessionId;
    await persist(context, state);
    return deepClone(target);
}

export async function deleteSession(
    context: vscode.ExtensionContext,
    sessionId: string
): Promise<void> {
    const state = await ensureLoaded(context);
    const index = state.sessions.findIndex((session) => session.id === sessionId);
    if (index === -1) {
        return;
    }
    state.sessions.splice(index, 1);
    if (!state.sessions.length) {
        const session = createSession();
        state.sessions = [session];
        state.activeSessionId = session.id;
    } else if (state.activeSessionId === sessionId) {
        state.activeSessionId = state.sessions[0].id;
    }
    await persist(context, state);
}

export async function getAllSessions(context: vscode.ExtensionContext): Promise<ChatSession[]> {
    const state = await ensureLoaded(context);
    const ordered = state.sessions
        .filter((session) => session.messages.length > 0)
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt);
    return deepClone(ordered);
}


export async function clearAllSessions(context: vscode.ExtensionContext): Promise<void> {
    const state = await ensureLoaded(context);
    const session = createSession();
    state.sessions = [session];
    state.activeSessionId = session.id;
    await persist(context, state);
}
