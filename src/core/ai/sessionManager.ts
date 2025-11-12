import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import type { ChatMessage, ChatSession } from './history/types.js';
import {
    readActiveSessionId,
    readPersistedSessions,
    writeActiveSessionId,
    writePersistedSessions
} from './history/storage.js';

export type { ChatRole, ChatMessage, ChatSession } from './history/types.js';

interface SessionState {
    loaded: boolean;
    sessions: ChatSession[];
    activeSessionId?: string;
}

export const MAX_HISTORY_MESSAGES = 20;

const RUNTIME_STATE = new WeakMap<vscode.ExtensionContext, SessionState>();

function ensureState(context: vscode.ExtensionContext): SessionState {
    let state = RUNTIME_STATE.get(context);
    if (!state) {
        state = { loaded: false, sessions: [], activeSessionId: undefined };
        RUNTIME_STATE.set(context, state);
    }
    return state;
}

function cloneMessage(message: ChatMessage): ChatMessage {
    return { ...message };
}

function cloneSession(session: ChatSession): ChatSession {
    return { ...session, messages: session.messages.map(cloneMessage) };
}

function sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages
        .filter((message) => typeof message.content === 'string' && message.content.trim().length > 0)
        .map((message) => ({
            role: message.role,
            content: message.content,
            timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now()
        }));
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
    await Promise.all([
        writePersistedSessions(context, state.sessions),
        writeActiveSessionId(context, state.activeSessionId)
    ]);
}

async function ensureLoaded(context: vscode.ExtensionContext): Promise<SessionState> {
    const state = ensureState(context);
    if (state.loaded) {
        return state;
    }

    state.sessions = readPersistedSessions(context).map(cloneSession);
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
    return cloneSession(session);
}

export async function getSessionHistory(context: vscode.ExtensionContext): Promise<ChatMessage[]> {
    const session = await getMutableActiveSession(context);
    return session.messages.map(cloneMessage);
}

export async function setSessionHistory(
    context: vscode.ExtensionContext,
    history: ChatMessage[]
): Promise<void> {
    const state = await ensureLoaded(context);
    const session = await getMutableActiveSession(context);
    const sanitized = trimHistory(sanitizeMessages(history));
    session.messages = sanitized;
    session.updatedAt = sanitized.length ? Date.now() : session.updatedAt;
    await persist(context, state);
}

export async function clearSessionHistory(context: vscode.ExtensionContext): Promise<void> {
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
    state.sessions.unshift(session);
    state.activeSessionId = session.id;
    await persist(context, state);
    return cloneSession(session);
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
    return cloneSession(target);
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
    return state.sessions
        .slice()
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .map(cloneSession);
}

export function trimHistory(messages: ChatMessage[]): ChatMessage[] {
    const filtered = messages.filter((msg) => msg.role === 'user' || msg.role === 'assistant');
    if (filtered.length <= MAX_HISTORY_MESSAGES) {
        return filtered.map(cloneMessage);
    }
    return filtered
        .slice(filtered.length - MAX_HISTORY_MESSAGES)
        .map(cloneMessage);
}
