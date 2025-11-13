import * as vscode from "vscode";
import { detectIntent } from "./detectIntent.js";
import { handleModuleGeneration } from "./handleModuleGeneration.js";
import { runAgent } from "../agent.js";
import type { AgentResult } from "./types.js";

export async function agentController(
    prompt: string,
    context: vscode.ExtensionContext
): Promise<AgentResult> {

    // 1. Detect the user's intent
    const intent = await detectIntent(prompt, context);

    switch (intent.type) {

        case "create_module":
            return await handleModuleGeneration(intent, context);

        case "create_model":
        case "add_field":
        case "generate_view":
        case "refactor_code":
        case "explain_code":
            return {
                success: false,
                message: `Handler not implemented for intent: ${intent.type}`,
                data: intent
            };

        default:
            // Fallback to normal chat
            const answer = await runAgent(
                { contents: prompt },
                context
            );
            return { success: true, message: answer };
    }
}
