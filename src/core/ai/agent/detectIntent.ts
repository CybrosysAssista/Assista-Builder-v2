import * as vscode from "vscode";
import { runAgent } from "../agent.js";
import type { DetectedIntent } from "./types.js";

export async function detectIntent(
    prompt: string,
    context: vscode.ExtensionContext
): Promise<DetectedIntent> {

    const classifierPrompt = `
You are an Odoo development agent intent classifier.
Your task: classify ONLY the user's intent.

Respond STRICTLY in JSON. No explanation.

Allowed types:
- "create_module"
- "create_model"
- "add_field"
- "generate_view"
- "explain_code"
- "refactor_code"
- "unknown"

Extract:
- type
- name (module/model/etc)
- entity (optional)
`;

    const raw = await runAgent(
        {
            messages: [
                { role: "system", content: classifierPrompt },
                { role: "user", content: prompt }
            ],
            config: { useSession: false }
        },
        context
    );

    try {
        const json = JSON.parse(raw);
        return {
            type: json.type ?? "unknown",
            name: json.name,
            entity: json.entity,
            raw
        };
    } catch {
        return { type: "unknown", raw };
    }
}
