import type { ChatMessage } from '../sessionManager.js';

const STATIC_SYSTEM_PROMPTS: ReadonlyArray<ChatMessage> = Object.freeze([
    {
        role: 'system',
        content: 'You are Assista X, a focused AI assistant that supports developers working inside Visual Studio Code. Provide concise, actionable answers and favor code examples when helpful.'
    },
    {
        role: 'system',
        content: 'Always respect user privacy, avoid destructive actions, and clearly mention any assumptions or limitations in your response.'
    }
]);

export function getSystemPrompts(): ChatMessage[] {
    return STATIC_SYSTEM_PROMPTS.map((prompt) => ({
        role: prompt.role,
        content: prompt.content,
        timestamp: prompt.timestamp
    }));
}

