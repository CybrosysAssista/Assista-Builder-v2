import * as vscode from 'vscode';
import * as path from 'path';
import { ChatMessage, ChatSession, getActiveSession, getAllSessions, startNewSession, switchActiveSession } from '../runtime/sessionManager.js';
import { getHtmlForWebview } from './utils/webviewUtils.js';
import { SettingsController } from './settings/SettingsController.js';
import { HistoryController } from './history/HistoryController.js';
import { runAgent } from "../runtime/agent.js";
import { MentionController } from './mentions/MentionController.js';

export class AssistaXProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'assistaXView';

    private _view?: vscode.WebviewView;
    private _pendingShowSettings = false;
    private _pendingShowHistory = false;
    private _settings?: SettingsController;
    private _history?: HistoryController;
    private _mentions?: MentionController;
    private _pendingHydration?: { sessionId: string; messages: ChatMessage[] };

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) { }

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

        // Instantiate controllers for delegating settings/history logic
        this._settings = new SettingsController(this._context, (type: string, payload?: any) => {
            this.postMessage(type, payload);
        });
        this._history = new HistoryController(this._context, (type: string, payload?: any) => {
            this.postMessage(type, payload);
        });
        this._mentions = new MentionController(this._context, (type: string, payload?: any) => {
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

            if (message.command === 'openExternalUrl') {
                const url = typeof message.url === 'string' ? message.url : '';
                if (url) {
                    try {
                        await vscode.env.openExternal(vscode.Uri.parse(url));
                    } catch (error) {
                        console.error('[AssistaX] Failed to open external URL:', error);
                    }
                }
                return;
            }
            // Delegate mention-related commands
            if (await this._mentions?.handle(message)) { return; }

            // History page commands
            if (message.command === 'loadHistory') {
                await this._history?.handleLoadHistory(message);
                return;
            }
            if (message.command === 'deleteSession') {
                try { console.log('[AssistaX] deleteSession received for', message?.id); } catch { }
                try { vscode.window.showInformationMessage(`Deleting chat: ${String(message?.id || '')}`); } catch { }
                await this._history?.handleDeleteSession(message);
                return;
            }
            if (message.command === 'openSession') {
                // Switch active session and hydrate webview
                const id = typeof message.id === 'string' ? message.id : '';
                if (id) {
                    const switched = await switchActiveSession(this._context, id);
                    this._view?.show?.(true);
                    await this.queueHydration(switched.id, switched.messages);
                    this.postMessage('historyOpened', { sessionId: switched.id });
                }
                return;
            }
        });

        if (this._pendingShowSettings) {
            this._pendingShowSettings = false;
            this.postMessage('showSettings');
            this._settings?.handleLoadSettings();
        }

        if (this._pendingShowHistory) {
            this._pendingShowHistory = false;
            this.postMessage('showHistory');
            this._history?.handleLoadHistory();
        }

        // Don't auto-sync session on load - let welcome screen stay visible
        // Sessions will be loaded only when user explicitly:
        // 1. Opens a session from history
        // 2. Sends a message (which triggers sync after message is sent)
        // void this.syncActiveSession();
        void this.flushPendingHydration();
    }

    public showSettings() {
        if (this._view) {
            this.postMessage('showSettings');
            this._settings?.handleLoadSettings();
        } else {
            this._pendingShowSettings = true;
        }
    }

    public showHistory() {
        if (this._view) {
            this.postMessage('showHistory');
            this._history?.handleLoadHistory();
        } else {
            this._pendingShowHistory = true;
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
            const startTime = Date.now();
            const response = await runAgent({ contents: text }, this._context);
            const elapsed = Date.now() - startTime;
            console.log(`[AssistaX] Total completion time taken in ${elapsed}ms`);
            const reply = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
            await this.sendAssistantMessage(reply);
            void this.syncActiveSession();
        } catch (error: any) {
            const message = error?.message || String(error) || 'Unexpected error';
            await this.sendAssistantMessage(message, 'error');
        }
    }

    private async mapMessageForWebview(
        message: ChatMessage
    ): Promise<{ role: string; content: string; html?: string; timestamp?: number }> {
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
            // Only hydrate if the session has messages
            // This prevents auto-loading empty sessions and keeps welcome screen visible
            if (session.messages && session.messages.length > 0) {
                await this.queueHydration(session.id, session.messages);
            }
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
        const lastMessage = [...session.messages].reverse().find(
            (message) => message.role === 'assistant' || message.role === 'user'
        );
        if (!lastMessage || !lastMessage.content.trim()) {
            return '';
        }
        const singleLine = lastMessage.content.replace(/\s+/g, ' ').trim();
        if (singleLine.length <= 80) {
            return singleLine;
        }
        return `${singleLine.slice(0, 80)}…`;
    }
}
