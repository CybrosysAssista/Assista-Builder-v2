import * as vscode from 'vscode';
import type { ProviderMessage } from '../types.js';
import type { ChatMessage } from '../sessionManager.js';
import { readSessionMessages, clearActiveSession } from './sessionStore.js';
import { assemblePrompt, normalizeMessages } from './promptBuilder.js';
import { callProvider, extractProviderContent } from './providerCaller.js';
import { executeToolCall, type ToolCall } from './toolRunner.js';
import { parseProviderToolCall } from './providerParser.js';
import { persistAssistantReply } from './sessionStore.js';

function debugLog(params: any, ...args: any[]) {
    if (params?.debug) {
        console.log("[Assista X DEBUG]", ...args);
    }
}

export async function runAgent(params: any = {}, context: vscode.ExtensionContext): Promise<any> {
    if (!context) throw new Error("Extension context is required.");

    if (params?.toolCall) {
        const toolCall: ToolCall = {
            name: params.toolCall.name,
            args: Array.isArray(params.toolCall.args) ? params.toolCall.args : []
        };
        debugLog(params, `Executing tool (explicit param): ${toolCall.name}`);
        return await executeToolCall(toolCall);
    }

    // 1️⃣ Load session as CHAT messages (for history only)
    let sessionHistory = await readSessionMessages(context);

    const cfg = params.config ?? {};

    if (cfg.resetSession) {
        await clearActiveSession(context);
        sessionHistory = [];
    }

    // 2️⃣ Build initial ProviderMessages (NO CHAT MESSAGES AFTER THIS)
    const providerMessages: ProviderMessage[] = [];

    // system prompts
    for (const s of await assemblePrompt(params, sessionHistory)) {
        providerMessages.push({
            role: s.role as any,
            content: s.content
        });
    }

    // 3️⃣ First model call
    debugLog(params, "Sending to provider:", JSON.stringify(providerMessages, null, 2));
    let providerResponse = await callProvider(providerMessages, params, context);
    debugLog(params, "Provider response:", providerResponse);
    let lastAssistantResponse = providerResponse;

    const MAX_STEPS = 30;
    let step = 0;

    while (step++ < MAX_STEPS) {
        // Parse structured tool call

        const call = parseProviderToolCall(providerResponse);

        if (!call) break;

        debugLog(params, `STEP ${step}: Parsed tool call →`, call);

        // 1️⃣ Assistant function-call stub

        providerMessages.push({
            role: "assistant",
            content: "",
            toolCall: call
        });

        // 2️⃣ Execute tool

        debugLog(params, `Executing tool: ${call.name}`, "Args:", call.args);
        const toolResult = await executeToolCall(call);
        debugLog(params, "Tool result:", toolResult);

        // 3️⃣ Inject tool result

        const toolMessage = {
            role: "tool" as const,
            content: typeof toolResult.output === "string"
                ? toolResult.output
                : JSON.stringify(toolResult.output ?? { error: toolResult.error }),
            tool_call_id: call.id,
            name: call.name
        };
        debugLog(params, "Injecting tool result message:", toolMessage);
        providerMessages.push(toolMessage);

        // 4️⃣ Next LLM call

        debugLog(params, "ProviderMessages (before next call):", JSON.stringify(providerMessages, null, 2));
        providerResponse = await callProvider(providerMessages, params, context);
        lastAssistantResponse = providerResponse;
    }

    // 9️⃣ Persist final assistant response to session (ONLY FINAL)
    const newUserMessages = normalizeMessages([
        { role: "user", content: params.contents }
    ]);

    const finalAssistantText = extractProviderContent(lastAssistantResponse);

    await persistAssistantReply(
        context,
        sessionHistory,
        newUserMessages,
        { role: "assistant", content: finalAssistantText }
    );

    return lastAssistantResponse;
}

export async function resetSession(context: vscode.ExtensionContext): Promise<void> {
    await clearActiveSession(context);
}

export async function getSessionHistory(context: vscode.ExtensionContext): Promise<ChatMessage[]> {
    return await readSessionMessages(context);
}
