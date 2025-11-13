import * as vscode from "vscode";
import { runAgent } from "../agent.js";
import * as tools from "../../services/toolService.js";
import type { DetectedIntent, AgentResult } from "./types.js";

export async function handleModuleGeneration(
    intent: DetectedIntent,
    context: vscode.ExtensionContext
): Promise<AgentResult> {

    const moduleName = intent.name ?? "custom_module";

    // ------------------------------
    // 1️⃣ Ask AI for module structure
    // ------------------------------
    const structurePrompt = `
Generate an Odoo 18 module structure in JSON ONLY.
No explanation. No extra text.

Keys = file paths
Values = "" (placeholder content)

Example:
{
  "hostel_management/__manifest__.py": "",
  "hostel_management/models/__init__.py": "",
  "hostel_management/models/room.py": ""
}

Module name: ${moduleName}
Output JSON only.
`;

    const structureRaw = await runAgent(
        {
            messages: [
                { role: "system", content: "Return ONLY JSON." },
                { role: "user", content: structurePrompt }
            ],
            config: { useSession: false }
        },
        context
    );

    let structure: Record<string, string>;
    try {
        structure = JSON.parse(structureRaw);
    } catch {
        return {
            success: false,
            message: "AI did not return valid JSON for module structure.",
            data: structureRaw
        };
    }

    // ------------------------------
    // 2️⃣ Create empty module files
    // ------------------------------
    for (const filePath of Object.keys(structure)) {
        await tools.writeFileContent(filePath, ""); // ensures file exists
    }

    // ------------------------------
    // 3️⃣ Ask AI to generate each file content
    // ------------------------------
    for (const filePath of Object.keys(structure)) {
        const contentPrompt = `
Generate content for Odoo 18 module file:

File: ${filePath}
Module: ${moduleName}

Rules:
- Return ONLY the file content
- No markdown
- No extra text
`;

        const fileContent = await runAgent(
            {
                messages: [
                    { role: "system", content: "Return raw file content ONLY." },
                    { role: "user", content: contentPrompt }
                ],
                config: { useSession: false }
            },
            context
        );

        await tools.writeFileContent(filePath, fileContent);
    }

    return {
        success: true,
        message: `Module "${moduleName}" generated successfully.`,
        data: { moduleName }
    };
}
