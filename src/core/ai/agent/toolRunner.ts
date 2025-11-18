import { TOOL_REGISTRY, type ToolFn } from '../../tools/registry.js';

export interface ToolCall {
    name: string;
    args?: any[];
}

export function extractToolCall(content: string): ToolCall | null {
    if (!content || typeof content !== 'string') return null;

    try {
        const p = JSON.parse(content.trim());
        const call = p?.toolCall ?? p?.tool_call ?? null;
        if (call && typeof call.name === 'string') {
            return call;
        }
    } catch {}

    const jsonMatch = content.match(/\{\s*"toolCall"\s*:\s*\{[^}]*"name"\s*:\s*"[^"]+"[^}]*\}\s*\}/);
    if (jsonMatch) {
        try {
            const p = JSON.parse(jsonMatch[0]);
            const call = p?.toolCall ?? p?.tool_call ?? null;
            if (call && typeof call.name === 'string') {
                return call;
            }
        } catch {}
    }

    if (content.includes('toolCall') || content.includes('tool_call')) {
        const anyJsonMatch = content.match(/\{[\s\S]{0,500}\}/);
        if (anyJsonMatch) {
            try {
                const p = JSON.parse(anyJsonMatch[0]);
                const call = p?.toolCall ?? p?.tool_call ?? null;
                if (call && typeof call.name === 'string') {
                    const knownTools = Object.keys(TOOL_REGISTRY);
                    if (knownTools.includes(call.name)) {
                        return call;
                    }
                }
            } catch {}
        }
    }

    return null;
}

export function validateToolCall(call: ToolCall): string | null {
    if (!call || typeof call.name !== 'string') {
        return 'Invalid toolCall: "name" must be a string.';
    }
    if (call.args && !Array.isArray(call.args)) {
        return 'Invalid toolCall: "args" must be an array if present.';
    }
    const rawFn = (TOOL_REGISTRY as any)[call.name];
    if (typeof rawFn !== 'function') {
        return `Unknown tool requested by assistant: ${call.name}. Available tools: ${Object.keys(TOOL_REGISTRY).join(', ')}`;
    }
    const argsContainUndefined = (call.args ?? []).some(a => a === undefined);
    if (argsContainUndefined) {
        return 'Invalid toolCall args: contains undefined values.';
    }
    return null;
}

export async function executeToolCall(call: ToolCall): Promise<any> {
    const validationError = validateToolCall(call);
    if (validationError) {
        return { 
            __toolError: true,
            error: validationError,
            toolCall: call
        };
    }
    
    const fn = (TOOL_REGISTRY as any)[call.name] as ToolFn;
    try {
        return await fn(...(call.args ?? []));
    } catch (err) {
        return { 
            __toolError: true,
            error: String(err),
            toolCall: call
        };
    }
}

export function makeToolResultMessage(name: string, toolResult: any) {
    if (toolResult && typeof toolResult === 'object' && toolResult.__toolError) {
        return {
            role: 'system' as const,
            content: `Tool ${name} encountered an error: ${toolResult.error || 'Unknown error'}`
        };
    }
    
    return {
        role: 'system' as const,
        content: `Tool ${name} returned:\n${typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult, null, 2)}`
    };
}
