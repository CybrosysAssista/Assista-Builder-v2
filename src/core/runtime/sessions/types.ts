export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ToolExecution {
    toolId: string;
    toolName: string;
    filename: string;
    status: 'completed' | 'error';
    timestamp: number;
    args?: any;
    result?: any;
}

export interface ChatMessage {
    role: ChatRole;
    content: string;
    timestamp?: number;
    suggestions?: Array<{ text: string; mode?: string | null }>;
    selection?: string;
    toolExecutions?: ToolExecution[];
}

export interface ChatSession {
    id: string;
    title?: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
}
