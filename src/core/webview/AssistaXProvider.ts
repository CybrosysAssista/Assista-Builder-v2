import * as vscode from 'vscode';
import { generateContent } from '../ai/agent.js';
import { ChatMessage, ChatSession, getActiveSession, getAllSessions, startNewSession, switchActiveSession } from '../ai/sessionManager.js';
import { getHtmlForWebview } from './utils/webviewUtils.js';

export class AssistaXProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'assistaXView';

    private _view?: vscode.WebviewView;
    private _pendingShowSettings = false;
    private _pendingHydration?: { sessionId: string; messages: ChatMessage[] };

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
            }
        });

        if (this._pendingShowSettings) {
            this._pendingShowSettings = false;
            this.postMessage('showSettings');
            this.handleLoadSettings();
        }

        void this.syncActiveSession();
        void this.flushPendingHydration();
    }

    public showSettings() {
        if (this._view) {
            this.postMessage('showSettings');
            this.handleLoadSettings();
        } else {
            this._pendingShowSettings = true;
        }
    }

    public async startNewChat(): Promise<void> {
        try {
            const session = await startNewSession(this._context);
            this._view?.show?.(true);
            await this.queueHydration(session.id, session.messages);
        } catch (error: any) {
            vscode.window.showErrorMessage(error?.message || 'Failed to start a new chat session.');
        }
    }

    public async showHistoryPicker(): Promise<void> {
        try {
            const sessions = await getAllSessions(this._context);
            const active = await getActiveSession(this._context);

            const items: Array<vscode.QuickPickItem & { session: ChatSession }> = [];

            if (active.messages.length === 0) {
                items.push({
                    label: 'New Chat',
                    description: 'Current chat',
                    detail: 'Start typing to save this conversation.',
                    session: active
                });
            }

            for (const session of sessions) {
                items.push({
                    label: this.formatSessionTitle(session),
                    description: session.id === active.id ? 'Current chat' : undefined,
                    detail: this.createPreview(session),
                    session
                });
            }

            if (!items.length) {
                vscode.window.showInformationMessage('No chat history available yet.');
                return;
            }

            const pick = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a chat session',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (!pick || pick.session.id === active.id) {
                return;
            }

            const switched = await switchActiveSession(this._context, pick.session.id);
            this._view?.show?.(true);
            await this.queueHydration(switched.id, switched.messages);
        } catch (error: any) {
            vscode.window.showErrorMessage(error?.message || 'Failed to load chat history.');
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
            return await vscode.commands.executeCommand<string>('markdown.api.render', markdown);
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
            void this.syncActiveSession();
        } catch (error: any) {
            const message = error?.message || String(error) || 'Unexpected error';
            await this.sendAssistantMessage(message, 'error');
        }
    }

    private async mapMessageForWebview(message: ChatMessage): Promise<{ role: string; content: string; html?: string; timestamp?: number }> {
        const base = {
            role: message.role,
            content: message.content,
            timestamp: message.timestamp
        };
        if (message.role === 'assistant') {
            const html = await this.renderMarkdownToHtml(message.content);
            return { ...base, html };
        }
        return base;
    }

    private async queueHydration(sessionId: string, messages: ChatMessage[]): Promise<void> {
        if (!this._view) {
            this._pendingHydration = { sessionId, messages: messages.map((msg) => ({ ...msg })) };
            return;
        }
        const formatted = await Promise.all(messages.map((msg) => this.mapMessageForWebview(msg)));
        this._view.webview.postMessage({
            type: 'sessionHydrated',
            payload: {
                sessionId,
                messages: formatted
            }
        });
    }

    private async flushPendingHydration(): Promise<void> {
        if (!this._view || !this._pendingHydration) {
            return;
        }
        const pending = this._pendingHydration;
        this._pendingHydration = undefined;
        await this.queueHydration(pending.sessionId, pending.messages);
    }

    private async syncActiveSession(): Promise<void> {
        try {
            const session = await getActiveSession(this._context);
            await this.queueHydration(session.id, session.messages);
        } catch (error) {
            console.warn('[AssistaX] Failed to load current chat session:', error);
        }
    }

    private formatSessionTitle(session: ChatSession): string {
        if (session.title && session.title.trim()) {
            return session.title;
        }
        const firstUserMessage = session.messages.find((msg) => msg.role === 'user');
        if (firstUserMessage) {
            const cleaned = firstUserMessage.content.replace(/\s+/g, ' ').trim();
            if (cleaned) {
                return cleaned.length > 50 ? `${cleaned.slice(0, 50)}…` : cleaned;
            }
        }
        return `Chat ${session.id.slice(0, 8)}`;
    }

    private createPreview(session: ChatSession): string {
        const lastMessage = [...session.messages].reverse()
            .find((message) => message.role === 'assistant' || message.role === 'user');
        if (!lastMessage || !lastMessage.content.trim()) {
            return '';
        }
        const singleLine = lastMessage.content.replace(/\s+/g, ' ').trim();
        if (singleLine.length <= 80) {
            return singleLine;
        }
        return `${singleLine.slice(0, 80)}…`;
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
