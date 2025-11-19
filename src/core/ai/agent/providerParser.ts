// src/core/ai/agent/providerParser.ts

import type { ToolCall } from "./toolRunner.js";

/**
 * UNIVERSAL provider parser.
 * Converts all provider formats into a canonical ToolCall shape.
 */
export function parseProviderToolCall(resp: any): ToolCall | null {
    if (!resp) return null;

    // 1️⃣ OpenAI: resp.choices[0].message.function_call
    const fnCall = resp?.choices?.[0]?.message?.function_call;
    if (fnCall?.name) {
        return {
            name: fnCall.name,
            args: safeParseArgs(fnCall.arguments),
            id: fnCall.id ?? generateId()
        };
    }

    // 2️⃣ OpenAI: resp.choices[0].message.tool_calls
    const toolCalls = resp?.choices?.[0]?.message?.tool_calls;
    if (Array.isArray(toolCalls) && toolCalls.length > 0) {
        const tc = toolCalls[0]; // (we support only first for now)
        return {
            name: tc.function?.name,
            args: safeParseArgs(tc.function?.arguments),
            id: tc.id ?? generateId()
        };
    }

    // 3️⃣ Gemini: resp.candidates[x].content.parts[].functionCall
    const gemParts = resp?.candidates?.[0]?.content?.parts;
    if (Array.isArray(gemParts)) {
        const fc = gemParts.find(p => p.functionCall);
        if (fc?.functionCall?.name) {
            return {
                name: fc.functionCall.name,
                args: fc.functionCall.args ?? {},
                id: gemParts?.[0]?.id ?? generateId()
            };
        }
    }

    // 4️⃣ Gemini: resp.candidates[].functionCall (old)
    const gemFn = resp?.candidates?.[0]?.functionCall;
    if (gemFn?.name) {
        return {
            name: gemFn.name,
            args: gemFn.args ?? {},
            id: generateId()
        };
    }

    // 5️⃣ Anthropic: resp.content[].tool_call
    const anth = resp?.content?.find((c: any) => c.tool_call);
    if (anth?.tool_call?.name) {
        return {
            name: anth.tool_call.name,
            args: anth.tool_call.arguments ?? {},
            id: anth.id ?? generateId()
        };
    }

    // 6️⃣ Raw JSON in text (fallback)
    const content = resp?.choices?.[0]?.message?.content
                 ?? resp?.content
                 ?? "";
    try {
        const parsed = JSON.parse(content);
        const call = parsed.toolCall ?? parsed.tool_call;
        if (call?.name) {
            return {
                name: call.name,
                args: call.args ?? [],
                id: call.id ?? generateId()
            };
        }
    } catch {}

    return null;
}

function safeParseArgs(val: any) {
    if (!val) return [];
    if (typeof val === "string") {
        try { return JSON.parse(val); }
        catch { return [val]; }
    }
    return val;
}

function generateId() {
    return "tool_" + Math.random().toString(36).slice(2, 10);
}
