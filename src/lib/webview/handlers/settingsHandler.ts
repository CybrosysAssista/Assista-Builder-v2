/**
 * Handler for settings-related webview messages
 */
import * as vscode from 'vscode';
import { MessageHandler } from './contextHandler.js';

export class SettingsHandler implements MessageHandler {
    constructor(private readonly context: vscode.ExtensionContext) {}

    async handle(message: any, provider: { sendMessage: (msg: any) => void; _view?: vscode.WebviewView }): Promise<boolean> {
        // Load settings
        if (message.command === 'loadSettings') {
            const config = vscode.workspace.getConfiguration('assistaX');
            const providers = config.get<any>('providers', {
                google: { apiKey: '', model: '' },
                openai: { apiKey: '', model: '' },
                anthropic: { apiKey: '', model: '' },
                openrouter: { apiKey: '', model: '', customUrl: '' },
                custom: { apiKey: '', model: '', customUrl: '' }
            });
            const activeProvider = config.get<string>('activeProvider', 'openrouter');
            
            // Inject API keys from Secret Storage
            const providerKeys = ['google', 'openai', 'anthropic', 'openrouter', 'custom'];
            for (const p of providerKeys) {
                const secretKey = `assistaX.apiKey.${p}`;
                const secret = await this.context.secrets.get(secretKey);
                if (!providers[p]) { providers[p] = {}; }
                providers[p].apiKey = secret || providers[p].apiKey || '';
            }
            
            provider._view?.webview.postMessage({
                command: 'loadSettings',
                settings: { activeProvider, providers }
            });
            return true;
        }

        // Save settings
        if (message.command === 'saveSettings') {
            const { activeProvider, providers } = message.settings || {};
            if (!activeProvider) {
                provider._view?.webview.postMessage({ command: 'saveError', error: 'No provider selected' });
                return true;
            }
            
            const config = vscode.workspace.getConfiguration('assistaX');
            try {
                const providerKeys = ['google', 'openai', 'anthropic', 'openrouter', 'custom'];
                const toSave: any = {};
                
                for (const p of providerKeys) {
                    const src = (providers && providers[p]) || {};
                    const secretKey = `assistaX.apiKey.${p}`;
                    const apiKeyVal = src.apiKey || '';
                    
                    if (apiKeyVal) {
                        await this.context.secrets.store(secretKey, apiKeyVal);
                    } else {
                        await this.context.secrets.delete(secretKey);
                    }
                    
                    const { apiKey, ...rest } = src;
                    toSave[p] = rest;
                }

                await config.update('activeProvider', activeProvider, vscode.ConfigurationTarget.Global);
                await config.update('providers', toSave, vscode.ConfigurationTarget.Global);
                provider._view?.webview.postMessage({ command: 'saveSuccess' });
            } catch (e) {
                console.error('Save settings error:', e);
                provider._view?.webview.postMessage({ command: 'saveError', error: (e as Error).message });
            }
            return true;
        }

        return false;
    }
}

