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

type ProviderRole = "system" | "user" | "assistant" | "tool";

interface ProviderMessage {
    role: ProviderRole;
    content: string;
    tool_call_id?: string;
    name?: string;
    toolCall?: any;
}
