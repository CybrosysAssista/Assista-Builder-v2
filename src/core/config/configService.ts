/**
 * Configuration management service
 */
import * as vscode from 'vscode';
import { ProviderConfig } from '../providers/types.js';

export interface AppSettings {
    activeProvider: string;
    providers: { [key: string]: ProviderConfig };
}

export interface RAGConfig {
    enabled: boolean;
    serverUrl: string;
    topK: number;
}

/**
 * Get active provider configuration
 */
export async function getActiveProviderConfig(
    context: vscode.ExtensionContext
): Promise<{ provider: string; config: ProviderConfig }> {
    const configSection = vscode.workspace.getConfiguration('assistaCoder');
    let activeProvider = configSection.get<string>('activeProvider') || '';
    // const googleKey = await context.secrets.get('assistaCoder.apiKey.google');
    const openrouterKey = await context.secrets.get('assistaCoder.apiKey.openrouter');

    if (!activeProvider) {
        // if (googleKey) {
        //     activeProvider = 'google';
        //     await configSection.update('activeProvider', activeProvider, vscode.ConfigurationTarget.Global);
        // } else
        if (openrouterKey) {
            activeProvider = 'openrouter';
            await configSection.update('activeProvider', activeProvider, vscode.ConfigurationTarget.Global);
        }
    }

    if (!activeProvider) {
        throw new Error('No provider configured. Open Settings to add an API key.');
    }

    const providersConfig = configSection.get<any>('providers', {});
    const secretKey = `assistaCoder.apiKey.${activeProvider}`;
    const apiKey = // activeProvider === 'google'
        // ? googleKey
        // :
        activeProvider === 'openrouter'
            ? openrouterKey
            : await context.secrets.get(secretKey);

    if (!apiKey) {
        throw new Error(`API Key for ${activeProvider} is not configured. Please go to Settings.`);
    }

    const defaultModels: Record<string, string> = {
        // google: 'gemini-1.5-pro-latest',
        openrouter: 'anthropic/claude-3.5-sonnet'
    };

    const providerConfig: ProviderConfig = {
        apiKey,
        model: providersConfig[activeProvider]?.model || defaultModels[activeProvider] || '',
        customUrl: providersConfig[activeProvider]?.customUrl,
    };

    if (!providerConfig.model) {
        throw new Error(`Model for ${activeProvider} not configured. Please go to Settings.`);
    }

    // Normalize Google model ids to v1beta-supported variants
    // if (activeProvider === 'google') {
    //     const normalizeGoogleModelId = (m: string): string => {
    //         if (!m) { return m; }
    //         const map: Record<string, string> = {
    //             'gemini-1.5-flash-latest': 'gemini-1.5-flash-001',
    //             'gemini-1.5-flash': 'gemini-1.5-flash-001',
    //             'gemini-1.5-pro-latest': 'gemini-1.5-pro-001',
    //             'gemini-1.5-pro': 'gemini-1.5-pro-001',
    //         };
    //         return map[m] || m;
    //     };
    //     const normalized = normalizeGoogleModelId(providerConfig.model);
    //     if (normalized !== providerConfig.model) {
    //         console.warn(`[Assista Coder] Normalized Google model id '${providerConfig.model}' -> '${normalized}' for v1beta compatibility`);
    //         providerConfig.model = normalized;
    //     }
    // }

    const existingProviderConfig = providersConfig[activeProvider] || {};
    if (existingProviderConfig.model !== providerConfig.model) {
        const nextProviders = {
            ...providersConfig,
            [activeProvider]: {
                ...existingProviderConfig,
                model: providerConfig.model
            }
        };
        await configSection.update('providers', nextProviders, vscode.ConfigurationTarget.Global);
    }

    return { provider: activeProvider, config: providerConfig };
}

/**
 * Get RAG configuration
 */
export function getRAGConfig(): RAGConfig {
    const configSection = vscode.workspace.getConfiguration('assistaCoder');
    const ragConfig = configSection.get<any>('rag', {});
    
    return {
        enabled: ragConfig.enabled !== undefined ? ragConfig.enabled : true,
        serverUrl: ragConfig.serverUrl || 'https://odoo-rag.cyllo.cloud',
        topK: ragConfig.topK || 5
    };
}


