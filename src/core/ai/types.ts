export type ProviderRole = "system" | "user" | "assistant" | "tool";

export interface ProviderMessage {
    role: ProviderRole;
    content: string;
    // optional: structured tool call if assistant produced it
    toolCall?: { name: string; args?: any[]; id?: string };
    // tool messages use these:
    name?: string;
    tool_call_id?: string;
}

export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
    role: ChatRole;
    content: string;
    timestamp?: number;
}

export interface ChatSession {
    id: string;
    title?: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
}
