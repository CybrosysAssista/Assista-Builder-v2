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
