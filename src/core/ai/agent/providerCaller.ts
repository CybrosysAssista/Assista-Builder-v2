import * as vscode from 'vscode';
import type { ProviderMessage } from '../types.js';
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
    messages: ProviderMessage[],
    params: any,
    context: vscode.ExtensionContext
): Promise<any> {

    const { provider, config: providerConfig } = await getActiveProviderConfig(context);

    // Format messages according to provider requirements
    const formattedMessages = messages.map(m => {
        const base: any = {
            role: m.role,
            content: m.content
        };
        // Assistant → triggers tool call
        if (m.toolCall) {
            if (provider === 'google') {
                // Gemini format
                base.parts = [
                    {
                        functionCall: {
                            name: m.toolCall.name,
                            args: m.toolCall.args ?? {}
                        }
                    }
                ];
            } else {
                // OpenAI format
                base.tool_calls = [{
                    type: "function",
                    function: {
                        name: m.toolCall.name,
                        arguments: JSON.stringify(m.toolCall.args ?? {})
                    },
                    id: m.toolCall.id
                }];
            }
        }
        // Tool → result message
        if (m.role === "tool") {
            base.tool_call_id = m.tool_call_id;
            base.name = m.name;
        }
        return base;
    });

    const formattedPayload = {
        ...params,
        messages: formattedMessages,
    };
    delete (formattedPayload as any).contents;

    console.log('[Assista X] Provider request payload:', formattedPayload);
    let providerResponse;
    if (provider === 'google') {
        providerResponse = await generateWithGoogle(formattedPayload, providerConfig, context);
    } else {
        providerResponse = await generateWithOpenAICompat(formattedPayload, providerConfig, provider, context);
    }
    console.log('[Assista X] Provider response:', providerResponse);
    return providerResponse;
}
