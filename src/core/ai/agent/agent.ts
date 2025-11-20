import * as vscode from 'vscode';
import { readSessionMessages, clearActiveSession, writeSessionMessages } from '../sessionManager.js';
import { getActiveProviderConfig } from '../../services/configService.js';
import { generateWithGoogle } from '../providers/google.js';
import { getSystemInstruction } from '../prompts/systemPrompts.js';

export async function runAgent(params: any = {}, context: vscode.ExtensionContext): Promise<string> {
    if (!context) throw new Error("Extension context is required.");

    const cfg = params.config ?? {};
    let sessionHistory = await readSessionMessages(context);

    if (cfg.resetSession) {
        await clearActiveSession(context);
        sessionHistory = [];
    }

    const { config: providerConfig } = await getActiveProviderConfig(context);
    const configSection = vscode.workspace.getConfiguration('assistaX');
    const customInstructions = configSection.get<string>('systemPrompt.customInstructions', '');

    // Build messages array
    const messages: Array<{ role: string; content: string }> = [];
    for (const msg of sessionHistory) {
        if (msg.role === 'user' || msg.role === 'assistant') {
            messages.push({ role: msg.role, content: msg.content });
        }
    }
    
    const userContent = typeof params.contents === 'string' ? params.contents : String(params.contents || '');
    messages.push({ role: 'user', content: userContent });

    // Build payload with system instruction
    const systemInstruction = getSystemInstruction(customInstructions);
    const response = await generateWithGoogle(
        { messages, config: { ...params.config, systemInstruction } },
        providerConfig,
        context
    );

    // Persist to session
    await writeSessionMessages(context, [
        ...sessionHistory,
        { role: 'user' as const, content: userContent, timestamp: Date.now() },
        { role: 'assistant' as const, content: response, timestamp: Date.now() }
    ]);

    return response;
}

export async function resetSession(context: vscode.ExtensionContext): Promise<void> {
    await clearActiveSession(context);
}

export async function getSessionHistory(context: vscode.ExtensionContext) {
    return await readSessionMessages(context);
}
