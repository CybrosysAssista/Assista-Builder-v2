import * as vscode from 'vscode';
import type { ChatMessage } from '../sessionManager.js';
import {
    readSessionMessages,
    writeSessionMessages,
    clearActiveSession,
    startNewSession,
    switchActiveSession,
    deleteSession,
    getAllSessions,
    getActiveSession,
    trimHistory
} from '../sessionManager.js';

// Re-export all session management functions
export {
    readSessionMessages,
    writeSessionMessages,
    clearActiveSession,
    startNewSession,
    switchActiveSession,
    deleteSession,
    getAllSessions,
    getActiveSession,
    trimHistory
};

export async function persistAssistantReply(
    context: vscode.ExtensionContext,
    previousHistory: ChatMessage[],
    newMessages: ChatMessage[],
    assistantResponse: any
): Promise<void> {
    const assistantContent = typeof assistantResponse === 'string'
        ? assistantResponse
        : JSON.stringify(assistantResponse, null, 2);

    const updated: ChatMessage[] = [
        ...previousHistory,
        ...newMessages,
        { role: 'assistant', content: assistantContent },
    ];
    await writeSessionMessages(context, updated);
}
