export type ProviderRole = "system" | "user" | "assistant" | "tool";

export interface ProviderMessage {
    role: ProviderRole;
    content: string;

    toolCall?: {
        name: string;
        args?: any[];
        id?: string;
    };
    tool_call_id?: string;
    name?: string;
}
