import type { OdooEnv } from '../../utils/odooDetection.js';

const BASE_PROMPTS = [
    'You are Assista X, an AI assistant specialized in Odoo development, functional workflows, module customization, debugging, architecture decisions, ORM usage, API integration, and best practices across Odoo versions. Help developers working on Odoo projects with precise, actionable, minimally verbose guidance.',
    'Provide clear reasoning while staying concise. Prefer direct code examples using correct Odoo patterns. Validate missing information explicitly, warn about incorrect, unsafe, or deprecated approaches, and highlight version-specific differences when relevant.',
    'Never guess unknown facts, never output destructive commands unless explicitly requested and safe, and never expose private data, secrets, or internal file paths unless provided by the user. Prioritize accuracy, reliability, and a professional tone.',
];

const CHAT_MODE_PROMPT = 'IMPORTANT: You are in CHAT mode. You have READ-ONLY access to files. You can only read files using the read_file tool. You cannot write, modify, or create files. Use the read_file tool to examine code and provide guidance, explanations, and suggestions, but do not attempt to make any changes. If the user requests file operations (writing, modifying, creating files), inform them that they need to switch to Agent mode to perform such operations.';

const AGENT_MODE_PROMPT = 'You are in AGENT mode. You have full access to tools including reading, writing, modifying, and creating files. Use tools as needed to help the user with their Odoo development tasks.';

function formatEnvironmentInfo(environment: OdooEnv | null): string {
    if (!environment) {
        return '';
    }

    const parts: string[] = [];
    
    if (environment.version && environment.version !== 'not available') {
        parts.push(`Odoo Version: ${environment.version}`);
    }
    
    if (environment.addons && environment.addons.length > 0) {
        parts.push(`Addons Paths: ${environment.addons.join(', ')}`);
    }

    if (parts.length === 0) {
        return '';
    }

    return `\n\nWORKSPACE ENVIRONMENT:\n${parts.join('\n')}`;
}

export function getSystemInstruction(
    customInstructions?: string,
    mode: string = 'agent',
    environment?: OdooEnv | null
): string {
    const base = BASE_PROMPTS.join('\n\n');
    const modePrompt = mode === 'chat' ? CHAT_MODE_PROMPT : AGENT_MODE_PROMPT;
    const envInfo = formatEnvironmentInfo(environment ?? null);
    const fullPrompt = `${base}\n\n${modePrompt}${envInfo}`;
    return customInstructions?.trim() ? `${fullPrompt}\n\n${customInstructions.trim()}` : fullPrompt;
}
