/**
 * OpenAI-compatible provider implementation
 */
import * as vscode from 'vscode';
import { ProviderConfig } from './types.js';

function getApiUrl(provider: string, config: ProviderConfig): string {
    switch (provider) {
        case 'openai': return 'https://api.openai.com/v1/chat/completions';
        case 'anthropic': return 'https://openrouter.ai/api/v1/chat/completions';
        case 'openrouter': return `${config.customUrl || 'https://openrouter.ai/api/v1'}/chat/completions`;
        case 'custom': return config.customUrl || '';
        default: throw new Error(`Unknown provider: ${provider}`);
    }
}

export async function generateWithOpenAICompat(
    params: any,
    config: ProviderConfig,
    provider: string,
    context: vscode.ExtensionContext
): Promise<string> {
    const url = getApiUrl(provider, config);
    if (!url) throw new Error(`URL for provider ${provider} not configured.`);

    const systemPrompt = params.config?.systemInstruction || '';
    // Support either a full messages array or a single string prompt
    let messages: Array<{ role: string; content: string }> = [];
    if (Array.isArray(params?.messages) && params.messages.length) {
        messages = params.messages.map((m: any) => ({ role: m.role, content: String(m.content ?? '') }));
        // Prepend system if provided and not already present
        if (systemPrompt) {
            const hasSystem = messages.length && messages[0].role === 'system';
            if (!hasSystem) messages.unshift({ role: 'system', content: systemPrompt });
        }
    } else {
        let userPrompt = params.contents;
        if (typeof userPrompt !== 'string') {
            userPrompt = JSON.stringify(userPrompt);
        }
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: userPrompt });
    }

    const body: any = {
        model: config.model,
        messages,
    };

    // Optional generation parameters passthrough
    const reqCfg = params.config || {};
    if (typeof reqCfg.temperature === 'number') body.temperature = reqCfg.temperature;
    if (typeof reqCfg.maxTokens === 'number') body.max_tokens = reqCfg.maxTokens;
    if (typeof reqCfg.topP === 'number') body.top_p = reqCfg.topP;

    // Enforce JSON mode where supported and append guard instruction once
    if (reqCfg?.responseMimeType === 'application/json') {
        body.response_format = { type: 'json_object' };
        const hasJsonInstruction = messages.some(
            m => (m as any).role === 'system' && typeof (m as any).content === 'string' && (m as any).content.includes('MUST respond in valid JSON')
        );
        if (!hasJsonInstruction) {
            messages[messages.length - 1].content += '\n\nYou MUST respond in valid JSON format, without any markdown formatting or extra text.';
        }
    }

    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
    };

    // Allow OpenRouter header overrides from settings
    if (provider === 'openrouter' || provider === 'anthropic') {
        const cfgSection = vscode.workspace.getConfiguration('assistaX');
        const referer = cfgSection.get<string>('openrouterHeaders.referer', 'https://assista-x.vscode')!;
        const xTitle = cfgSection.get<string>('openrouterHeaders.title', 'Assista X Extension')!;
        headers['HTTP-Referer'] = referer;
        headers['X-Title'] = xTitle;
    }

    // Fetch with retries and timeout for 429/5xx
    const maxRetries = 3;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timeout);

            if (!response.ok) {
                // Parse error payload if possible
                let detail: string = '';
                try {
                    const errJson = await response.json();
                    const ej: any = errJson as any;
                    detail = ej?.error?.message || JSON.stringify(errJson);
                } catch {
                    try {
                        detail = await response.text();
                    } catch { /* ignore */ }
                }

                // Retry on 429/5xx
                if (response.status === 429 || (response.status >= 500 && response.status <= 599)) {
                    lastErr = new Error(`API Error (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`);
                    const backoff = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s
                    await new Promise(r => setTimeout(r, backoff));
                    continue;
                }

                throw new Error(`API Error (${response.status} ${response.statusText})${detail ? `: ${detail}` : ''}`);
            }

            const data = await response.json() as any;
            const text = (data as any)?.choices?.[0]?.message?.content?.trim?.() || '';
            return text;
        } catch (e: any) {
            clearTimeout(timeout);
            lastErr = e;
            // Retry on abort/network error except last attempt
            if (attempt < maxRetries) {
                const backoff = Math.pow(2, attempt - 1) * 1000;
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }
        }
    }
    throw new Error(`Request failed after ${maxRetries} attempts: ${lastErr?.message || lastErr}`);
}


