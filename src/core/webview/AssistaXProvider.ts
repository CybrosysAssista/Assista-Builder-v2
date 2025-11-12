import * as vscode from 'vscode';
import { generateContent } from '../ai/agent.js';
import { getHtmlForWebview } from './utils/webviewUtils.js';
import { SettingsController } from './settings/SettingsController.js';

export class AssistaXProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'assistaXView';

    private _view?: vscode.WebviewView;
    private _pendingShowSettings = false;
    private _settings?: SettingsController;

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

        // Instantiate settings controller for delegating settings logic
        this._settings = new SettingsController(this._context, (type: string, payload?: any) => {
            this.postMessage(type, payload);
        });

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
                await this._settings?.handleLoadSettings();
                return;
            }

            if (message.command === 'saveSettings') {
                await this._settings?.handleSaveSettings(message);
                return;
            }

            if (message.command === 'listModels') {
                await this._settings?.handleListModels(message);
                return;
            }
        });

        if (this._pendingShowSettings) {
            this._pendingShowSettings = false;
            this.postMessage('showSettings');
            this._settings?.handleLoadSettings();
        }
    }

    public showSettings() {
        if (this._view) {
            this.postMessage('showSettings');
            this._settings?.handleLoadSettings();
        } else {
            this._pendingShowSettings = true;
        }
    }

    private postMessage(type: string, payload?: any) {
        this._view?.webview.postMessage(payload ? { type, payload } : { type });
    }

    private async renderMarkdownToHtml(markdown: string): Promise<string | undefined> {
        if (!markdown.trim()) {
            return undefined;
        }
        try {
            const rendered = await vscode.commands.executeCommand<string>('markdown.api.render', markdown);
            return rendered;
        } catch (error) {
            console.warn('[AssistaX] Failed to render markdown via VS Code API:', error);
            return undefined;
        }
    }

    private async sendAssistantMessage(
        text: string,
        type: 'assistantMessage' | 'error' | 'systemMessage' = 'assistantMessage'
    ) {
        if (!this._view) {
            return;
        }

        if (type === 'assistantMessage') {
            const html = await this.renderMarkdownToHtml(text);
            this._view.webview.postMessage({ type, text, html });
            return;
        }

        this._view.webview.postMessage({ type, text });
    }

    private async handleUserMessage(text: string) {
        try {
            const response = await generateContent({ contents: text }, this._context);
            const reply = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
            await this.sendAssistantMessage(reply);
        } catch (error: any) {
            const message = error?.message || String(error) || 'Unexpected error';
            await this.sendAssistantMessage(message, 'error');
        }
    }

}
