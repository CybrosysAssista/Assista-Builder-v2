import { z } from "zod";
import { TOOL_REGISTRY, type ToolFn } from '../../tools/registry.js';

export interface ToolResult {
    success: boolean;
    output?: any;
    error?: string;
}

export interface ToolCall {
    name: string;
    args?: any[];
    id?: string;
}


export function validateToolCall(call: ToolCall): string | null {
    if (!call || typeof call.name !== 'string') {
        return 'Invalid toolCall: "name" must be a string.';
    }
    if (call.args && !Array.isArray(call.args)) {
        return 'Invalid toolCall: "args" must be an array if present.';
    }
    const tool = TOOL_REGISTRY[call.name];
    if (!tool || typeof tool.fn !== "function") {
        return `Unknown tool requested by assistant: ${call.name}. Available tools: ${Object.keys(TOOL_REGISTRY).join(', ')}`;
    }
    const argsContainUndefined = (call.args ?? []).some(a => a === undefined);
    if (argsContainUndefined) {
        return 'Invalid toolCall args: contains undefined values.';
    }
    return null;
}

export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
    const tool = TOOL_REGISTRY[call.name];
    if (!tool) {
        return {
            success: false,
            error: `Unknown tool: ${call.name}`
        };
    }

    // 1️⃣ Validate args
    let args = call.args ?? [];
    // If provider sent object → convert to array (OpenAI sends objects)
    if (!Array.isArray(args) && typeof args === "object") {
        args = [args];
    }

    // 2️⃣ Schema validation (if defined)
    if (tool.schema) {
        try {
            args = [tool.schema.parse(args[0])]; // schema forces object-mode
        } catch (err: any) {
            return {
                success: false,
                error: `Invalid arguments for ${call.name}: ${err.message}`
            };
        }
    }

    // 3️⃣ Execute tool safely
    try {
        let result = await tool.fn.apply(null, args);

        // ensure JSON-safe output
        if (typeof result === "function") {
            throw new Error("Tool returned a function — invalid output");
        }
        if (typeof result === "bigint") {
            result = result.toString();
        }

        const MAX_SIZE = 200_000; // 200 KB text limit for model safety
        let outputString = JSON.stringify(result);
        if (outputString.length > MAX_SIZE) {
            outputString = outputString.slice(0, MAX_SIZE) + "...[TRUNCATED]";
        }

        return {
            success: true,
            output: JSON.parse(outputString)
        };
    } catch (err: any) {
        return {
            success: false,
            error: err?.message ?? String(err)
        };
    }
}

export function makeToolResultMessage(name: string, toolResult: ToolResult, id?: string) {
    if (!toolResult.success) {
        return {
            role: "tool" as const,
            content: JSON.stringify({ error: toolResult.error }),
            tool_call_id: id,
            name
        };
    }

    return {
        role: "tool" as const,
        content: typeof toolResult.output === "string"
            ? toolResult.output
            : JSON.stringify(toolResult.output),
        tool_call_id: id,
        name
    };
}
