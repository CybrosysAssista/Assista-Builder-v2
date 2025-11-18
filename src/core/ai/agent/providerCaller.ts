import * as vscode from 'vscode';
import type { ChatMessage } from '../sessionManager.js';
import { getActiveProviderConfig } from '../../services/configService.js';
import { generateWithOpenAICompat } from '../providers/openai.js';
import { generateWithGoogle } from '../providers/google.js';

export function extractProviderContent(providerResponse: any): string {
    if (typeof providerResponse === 'string') {
        return providerResponse;
    }
    
    if (providerResponse?.choices?.[0]?.message?.content) {
        return String(providerResponse.choices[0].message.content);
    }
    
    if (providerResponse?.content) {
        return String(providerResponse.content);
    }
    
    return JSON.stringify(providerResponse);
}

export async function callProvider(
    messages: ChatMessage[],
    params: any,
    context: vscode.ExtensionContext
): Promise<any> {
    const payload = {
        ...params,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
    };
    delete (payload as any).contents;

    const { provider, config: providerConfig } = await getActiveProviderConfig(context);

    console.log('[Assista X] Provider request payload:', payload);
    let providerResponse;
    if (provider === 'google') {
        providerResponse = await generateWithGoogle(payload, providerConfig, context);
    } else {
        providerResponse = await generateWithOpenAICompat(payload, providerConfig, provider, context);
    }
    console.log('[Assista X] Provider response:', providerResponse);
    return providerResponse;
}
