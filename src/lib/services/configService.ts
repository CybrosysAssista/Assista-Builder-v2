/**
 * Configuration management service
 */
import * as vscode from 'vscode';
import { ProviderConfig } from '../ai/index.js';

export interface AppSettings {
    activeProvider: string;
    providers: { [key: string]: ProviderConfig };
}

/**
 * Get active provider configuration
 */
export async function getActiveProviderConfig(
    context: vscode.ExtensionContext
): Promise<{ provider: string; config: ProviderConfig }> {
    const configSection = vscode.workspace.getConfiguration('assistaX');
    const activeProvider = configSection.get<string>('activeProvider');
    
    if (!activeProvider) {
        throw new Error('No active provider configured. Please go to Settings and select a provider.');
    }

    const providersConfig = configSection.get<any>('providers', {});
    const secretKey = `assistaX.apiKey.${activeProvider}`;
    const apiKey = await context.secrets.get(secretKey);
    
    if (!apiKey) {
        throw new Error(`API Key for ${activeProvider} is not configured. Please go to Settings.`);
    }

    const providerConfig: ProviderConfig = {
        apiKey,
        model: providersConfig[activeProvider]?.model || '',
        customUrl: providersConfig[activeProvider]?.customUrl,
    };

    if (!providerConfig.model) {
        throw new Error(`Model for ${activeProvider} not configured. Please go to Settings.`);
    }

    // Normalize Google model ids to v1beta-supported variants
    if (activeProvider === 'google') {
        const normalizeGoogleModelId = (m: string): string => {
            if (!m) return m;
            const map: Record<string, string> = {
                'gemini-1.5-flash-latest': 'gemini-1.5-flash-001',
                'gemini-1.5-flash': 'gemini-1.5-flash-001',
                'gemini-1.5-pro-latest': 'gemini-1.5-pro-001',
                'gemini-1.5-pro': 'gemini-1.5-pro-001',
            };
            return map[m] || m;
        };
        const normalized = normalizeGoogleModelId(providerConfig.model);
        if (normalized !== providerConfig.model) {
            console.warn(`[Assista X] Normalized Google model id '${providerConfig.model}' -> '${normalized}' for v1beta compatibility`);
            providerConfig.model = normalized;
        }
    }

    return { provider: activeProvider, config: providerConfig };
}

