/**
 * Google Gemini provider implementation
 */
import * as vscode from 'vscode';
import { ProviderConfig } from './types.js';

export async function generateWithGoogle(
    params: any,
    config: ProviderConfig,
    _context: vscode.ExtensionContext
): Promise<string> {
    const maxRetries = 10;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(config.apiKey);
            const model = genAI.getGenerativeModel({ model: config.model });

            const systemPrompt = params.config?.systemInstruction || '';
            const promptParts: string[] = [];
            if (Array.isArray(params?.messages) && params.messages.length) {
                if (systemPrompt) { promptParts.push(systemPrompt); }
                // Flatten messages into a single textual context for Gemini simple generateContent
                const combined = params.messages.map((m: any) => {
                    const role = String(m.role || '').toUpperCase();
                    return `[${role}] ${String(m.content ?? '')}`;
                }).join('\n');
                promptParts.push(combined);
            } else {
                let userPrompt = params.contents;
                if (typeof userPrompt !== 'string') { userPrompt = JSON.stringify(userPrompt); }
                if (systemPrompt) { promptParts.push(systemPrompt); }
                promptParts.push(userPrompt);
            }

            const result = await model.generateContent(promptParts);
            const response = await result.response;
            const text = response.text();
            return text ? text.trim() : '';
        } catch (error) {
            lastError = error as Error;
            console.warn(`Google API attempt ${attempt} failed:`, error);

            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s backoff
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    console.error('Google Generative AI failed after retries:', lastError);
    throw new Error(`Google API Error after ${maxRetries} retries: ${lastError?.message}. The service may be overloaded; try OpenRouter provider or later.`);
}


