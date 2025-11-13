export interface DetectedIntent {
    type: string;
    name?: string;
    entity?: string;
    raw?: string;
}

export interface AgentResult {
    success: boolean;
    message: string;
    data?: any;
}
