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
    newUserMessages: ChatMessage[],
    finalAssistant: { role: "assistant"; content: string }
): Promise<void> {
    const updatedHistory: ChatMessage[] = [
        ...previousHistory,
        ...newUserMessages,
        finalAssistant
    ];
    await writeSessionMessages(context, updatedHistory);
}
