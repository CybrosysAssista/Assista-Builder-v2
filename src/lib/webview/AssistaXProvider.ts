import * as vscode from 'vscode';
import { generateContent } from '../ai/index.js';
import { getHtmlForWebview } from './utils/webviewUtils.js';

export class AssistaXProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'assistaXView';

    private _view?: vscode.WebviewView;
    private _pendingShowSettings = false;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {}

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = getHtmlForWebview(webviewView.webview, this._extensionUri);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (!message) {
                return;
            }

            if (message.command === 'userMessage') {
                const text = typeof message.text === 'string' ? message.text.trim() : '';
                if (!text) {
                    return;
                }
                await this.handleUserMessage(text);
                return;
            }

            if (message.command === 'cancel') {
                return;
            }

            if (message.command === 'loadSettings') {
                await this.handleLoadSettings();
                return;
            }

            if (message.command === 'saveSettings') {
                await this.handleSaveSettings(message);
                return;
            }
        });

        if (this._pendingShowSettings) {
            this._pendingShowSettings = false;
            this.postMessage('showSettings');
            this.handleLoadSettings();
        }
    }

    public showSettings() {
        if (this._view) {
            this.postMessage('showSettings');
            this.handleLoadSettings();
        } else {
            this._pendingShowSettings = true;
        }
    }

    private postMessage(type: string, payload?: any) {
        this._view?.webview.postMessage(payload ? { type, payload } : { type });
    }

    sendAssistantMessage(text: string, type: 'assistantMessage' | 'error' | 'systemMessage' = 'assistantMessage') {
        this._view?.webview.postMessage({ type, text });
    }

    private async handleUserMessage(text: string) {
        try {
            const response = await generateContent({ contents: text }, this._context);
            const reply = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
            this.sendAssistantMessage(reply);
        } catch (error: any) {
            const message = error?.message || String(error) || 'Unexpected error';
            this.sendAssistantMessage(message, 'error');
        }
    }

    private async handleLoadSettings() {
        const config = vscode.workspace.getConfiguration('assistaX');
        const providers = config.get<any>('providers', {});
        const activeProvider = config.get<string>('activeProvider') || 'google';
        const googleModel = providers?.google?.model || '';
        const openrouterModel = providers?.openrouter?.model || '';

        const hasGoogleKey = !!(await this._context.secrets.get('assistaX.apiKey.google'));
        const hasOpenrouterKey = !!(await this._context.secrets.get('assistaX.apiKey.openrouter'));

        this.postMessage('settingsData', {
            activeProvider,
            googleModel,
            openrouterModel,
            hasGoogleKey,
            hasOpenrouterKey
        });
    }

    private async handleSaveSettings(message: any) {
        try {
            const activeProvider = typeof message.activeProvider === 'string' ? message.activeProvider : 'google';
            const googleKey = typeof message.googleKey === 'string' ? message.googleKey.trim() : '';
            const openrouterKey = typeof message.openrouterKey === 'string' ? message.openrouterKey.trim() : '';
            const googleModel = typeof message.googleModel === 'string' ? message.googleModel.trim() : '';
            const openrouterModel = typeof message.openrouterModel === 'string' ? message.openrouterModel.trim() : '';

            const config = vscode.workspace.getConfiguration('assistaX');
            const providers = config.get<any>('providers', {});
            const nextProviders: any = { ...providers };

            nextProviders.google = { ...(nextProviders.google || {}) };
            nextProviders.openrouter = { ...(nextProviders.openrouter || {}) };

            if (googleModel) {
                nextProviders.google.model = googleModel;
            }
            if (openrouterModel) {
                nextProviders.openrouter.model = openrouterModel;
            }

            await config.update('providers', nextProviders, vscode.ConfigurationTarget.Global);

            if (activeProvider === 'google' || activeProvider === 'openrouter') {
                await config.update('activeProvider', activeProvider, vscode.ConfigurationTarget.Global);
            }

            if (googleKey) {
                await this._context.secrets.store('assistaX.apiKey.google', googleKey);
            }
            if (openrouterKey) {
                await this._context.secrets.store('assistaX.apiKey.openrouter', openrouterKey);
            }

            const hasGoogleKey = !!(await this._context.secrets.get('assistaX.apiKey.google'));
            const hasOpenrouterKey = !!(await this._context.secrets.get('assistaX.apiKey.openrouter'));

            this.postMessage('settingsSaved', {
                success: true,
                hasGoogleKey,
                hasOpenrouterKey
            });
        } catch (error: any) {
            this.postMessage('settingsSaved', {
                success: false,
                error: error?.message || String(error) || 'Failed to save settings.'
            });
        }
    }
}
