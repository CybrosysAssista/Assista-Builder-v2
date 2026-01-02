import * as vscode from 'vscode';
import * as path from 'path';
import { ChatSession, getActiveSession, getAllSessions, startNewSession, switchActiveSession, readSessionMessages, writeSessionMessages, writeSessionMessagesById } from '../runtime/sessionManager.js';
import { ChatMessage } from '../runtime/sessions/types.js';
import { getHtmlForWebview } from './utils/webviewUtils.js';
import { SettingsController } from './settings/SettingsController.js';
import { HistoryController } from './history/HistoryController.js';
import { runAgent } from "../runtime/agent.js";
import { MentionController } from './mentions/MentionController.js';
import { OdooEnvironmentService } from '../utils/odooDetection.js';
import { questionManager } from '../utils/questionManager.js';
import { AssistaAuthService } from '../utils/assistaAuthService.js';
import { fetchAvailableModels, fetchExternalKey } from '../utils/apiUtils.js';
import { reviewManager } from '../utils/reviewManager.js';

export class AssistaCoderProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'assistaCoderView';

    private _view?: vscode.WebviewView;
    private _pendingShowSettings = false;
    private _pendingShowHistory = false;
    private _settings?: SettingsController;
    private _history?: HistoryController;
    private _mentions?: MentionController;
    private _pendingHydration?: { sessionId: string; messages: ChatMessage[] };
    private _abortControllers = new Map<string, AbortController>();
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext,
        private readonly _odooEnvService: OdooEnvironmentService
    ) { }


    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            // Allow scripts in the webview
            enableScripts: true,
            localResourceRoots: [
                this._extensionUri
            ]
        };

        webviewView.webview.html = getHtmlForWebview(webviewView.webview, this._extensionUri);

        // Fetch and send available models to webview
        this.fetchAndSendModels();

        // Register webview provider with question manager
        questionManager.registerWebviewProvider({
            postMessage: (type: string, payload?: any) => {
                this.postMessage(type, payload);
            }
        });

        // Register webview provider with review manager
        reviewManager.registerWebviewProvider({
            postMessage: (type: string, payload?: any) => {
                this.postMessage(type, payload);
            }
        });


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

        // Listen for authentication state changes and notify webview
        const authListener = vscode.authentication.onDidChangeSessions(async (e) => {
            if (e.provider.id === 'assista') {
                // Notify webview of authentication changes
                this.postMessage('authStateChanged', { provider: 'assista' });
            }
        });
        this._disposables.push(authListener);

        webviewView.webview.onDidReceiveMessage(async (message) => {
            if (!message) {
                return;
            }

            if (message.command === 'userMessage') {
                const text = typeof message.text === 'string' ? message.text.trim() : '';
                if (!text) {
                    return;
                }
                console.log("Hello",message)
                const mode = typeof message.mode === 'string' ? message.mode : 'agent';
                const model = typeof message.model === 'string' ? message.model : 'custom-api';
                await this.handleUserMessage(text, mode, model);
                return;
            }

            if (message.command === 'newChat') {
                await this.startNewChat();
                return;
            }

            if (message.command === 'cancel') {
                const sessionId = message.sessionId;
                if (sessionId) {
                    const controller = this._abortControllers.get(sessionId);
                    if (controller) {
                        controller.abort();
                        this._abortControllers.delete(sessionId);
                        // Send cancellation message to chat
                        await this.sendAssistantMessage('Request cancelled by user.', sessionId, 'systemMessage');
                    }
                }
                return;
            }

            if (message.command === 'loadSettings') {
                await this._settings?.handleLoadSettings();
                return;
            }

            if (message.command === 'getUserData') {
                try {
                    const userData = await AssistaAuthService.getUserData();
                    this.postMessage('userDataResponse', userData);
                } catch (error) {
                    console.error('[AssistaCoder] Failed to get user data:', error);
                    this.postMessage('userDataResponse', null);
                }
                return;
            }

            if (message.command === 'getUserGreeting') {
                try {
                    const greeting = await AssistaAuthService.getUserGreeting();
                    this.postMessage('userGreetingResponse', { greeting });
                } catch (error) {
                    console.error('[AssistaCoder] Failed to get user greeting:', error);
                    this.postMessage('userGreetingResponse', { greeting: 'Hey, User' });
                }
                return;
            }

            if (message.command === 'getUserDisplayName') {
                try {
                    const displayName = await AssistaAuthService.getUserDisplayName();
                    this.postMessage('userDisplayNameResponse', { displayName });
                } catch (error) {
                    console.error('[AssistaCoder] Failed to get user display name:', error);
                    this.postMessage('userDisplayNameResponse', { displayName: 'User' });
                }
                return;
            }

            if (message.command === 'getUserEmail') {
                try {
                    const email = await AssistaAuthService.getUserEmail();
                    this.postMessage('userEmailResponse', { email });
                } catch (error) {
                    console.error('[AssistaCoder] Failed to get user email:', error);
                    this.postMessage('userEmailResponse', { email: null });
                }
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

            if (message.command === 'fetchUsage') {
                await this._settings?.handleFetchUsage(message);
                return;
            }

            if (message.command === 'openExternalUrl') {
                const url = typeof message.url === 'string' ? message.url : '';
                if (url) {
                    try {
                        await vscode.env.openExternal(vscode.Uri.parse(url));
                    } catch (error) {
                        console.error('[AssistaCoder] Failed to open external URL:', error);
                    }
                }
                return;
            }

            if (message.command === 'openCustomApiSettings') {
                // Open settings and navigate to providers section
                this.postMessage('showSettings', { section: 'providers' });
                await this._settings?.handleLoadSettings();
                return;
            }

            if (message.command === 'openFile') {
                const filePath = typeof message.path === 'string' ? message.path : '';
                if (filePath) {
                    try {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (workspaceFolders) {
                            const fullPath = path.isAbsolute(filePath)
                                ? filePath
                                : path.join(workspaceFolders[0].uri.fsPath, filePath);
                            const uri = vscode.Uri.file(fullPath);
                            const doc = await vscode.workspace.openTextDocument(uri);
                            await vscode.window.showTextDocument(doc, { preview: true });
                        }
                    } catch (error) {
                        console.error('[AssistaCoder] Failed to open file:', error);
                        vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
                    }
                }
                return;
            }
            if (message.command === 'revealInExplorer') {
                const folderPath = typeof message.path === 'string' ? message.path : '';
                if (folderPath) {
                    try {
                        const workspaceFolders = vscode.workspace.workspaceFolders;
                        if (workspaceFolders) {
                            const fullPath = path.isAbsolute(folderPath)
                                ? folderPath
                                : path.join(workspaceFolders[0].uri.fsPath, folderPath);
                            const uri = vscode.Uri.file(fullPath);
                            await vscode.commands.executeCommand('revealInExplorer', uri);
                        }
                    } catch (error) {
                        console.error('[AssistaCoder] Failed to reveal in explorer:', error);
                    }
                }
                return;
            }
            if (await this._mentions?.handle(message)) { return; }

            // History page commands
            if (message.command === 'loadHistory') {
                await this._history?.handleLoadHistory(message);
                return;
            }
            if (message.command === 'deleteSession') {
                try { console.log('[AssistaCoder] deleteSession received for', message?.id); } catch { }
                try { vscode.window.showInformationMessage(`Deleting chat: ${String(message?.id || '')}`); } catch { }
                await this._history?.handleDeleteSession(message);
                return;
            }
            if (message.command === 'clearAllHistory') {
                await this._history?.handleClearAllHistory();
                return;
            }
            if (message.command === 'openSession') {
                // Switch active session and hydrate webview
                const id = typeof message.id === 'string' ? message.id : '';
                if (id) {
                    const switched = await switchActiveSession(this._context, id);
                    console.log('[AssistaCoder] Session opened from history:', switched);
                    this._view?.show?.(true);
                    await this.queueHydration(switched.id, switched.messages);
                    this.postMessage('historyOpened', { sessionId: switched.id });
                }
                return;
            }

            // Handle question answer from webview
            if (message.command === 'answerQuestion') {
                const questionId = typeof message.questionId === 'string' ? message.questionId : '';
                const answer = typeof message.answer === 'string' ? message.answer : '';
                const mode = typeof message.mode === 'string' ? message.mode : null;
                if (questionId && answer) {
                    const pending = questionManager.getPendingQuestion(questionId);
                    questionManager.handleAnswer(questionId, answer, mode);

                    if (pending) {
                        try {
                            const currentMessages = await readSessionMessages(this._context);

                            // Fix Issue 1: Find existing assistant message with this question (if any)
                            // to preserve chronological ordering and original timestamp
                            const questionMessageIndex = currentMessages.findIndex(
                                (msg) =>
                                    msg.role === 'assistant' &&
                                    msg.content === pending.question &&
                                    msg.suggestions &&
                                    JSON.stringify(msg.suggestions) === JSON.stringify(pending.suggestions) &&
                                    !msg.selection // Only update unanswered questions
                            );

                            const newMessages: ChatMessage[] = [...currentMessages];

                            if (questionMessageIndex >= 0) {
                                // Update existing question message with selection (preserve original timestamp)
                                newMessages[questionMessageIndex] = {
                                    ...newMessages[questionMessageIndex],
                                    selection: answer
                                };
                            } else {
                                // Question not in history yet, append it with selection
                                newMessages.push({
                                    role: 'assistant',
                                    content: pending.question,
                                    timestamp: Date.now(),
                                    suggestions: pending.suggestions,
                                    selection: answer
                                });
                            }

                            // Fix Issue 2: Don't store redundant user message
                            // The UI already skips user messages with selection property
                            await writeSessionMessages(this._context, newMessages);

                            // Immediately sync UI to show the question as answered
                            void this.syncActiveSession();
                        } catch (error) {
                            console.error('[AssistaCoder] Failed to save question/answer to history:', error);
                        }
                    }
                }
                return;
            }

            // Handle question cancellation from webview
            if (message.command === 'cancelQuestion') {
                const questionId = typeof message.questionId === 'string' ? message.questionId : '';
                if (questionId) {
                    questionManager.handleCancel(questionId);
                }
                return;
            }

            if (message.command === 'showError') {
                const text = typeof message.text === 'string' ? message.text : '';
                if (text) {
                    vscode.window.showErrorMessage(text);
                }
                return;
            }

            if (message.command === 'reviewResponse') {
                const answer = message.answer as 'accept' | 'reject';
                reviewManager.handleReviewResponse(answer);
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

        void this.syncActiveSession();
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
            // Show splash screen animation - no need to hydrate empty session
            // But pass the session ID so frontend state is synced
            this.postMessage('showWelcomeSplash', { sessionId: session.id }, session.id);
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

    private postMessage(type: string, payload?: any, sessionId?: string) {
        const messagePayload = payload ? { ...payload } : {};
        if (sessionId) {
            messagePayload.sessionId = sessionId;
        }
        this._view?.webview.postMessage({ type, payload: messagePayload });
    }

    private async sendAssistantMessage(
        text: string,
        sessionId: string,
        type: 'assistantMessage' | 'error' | 'systemMessage' = 'assistantMessage'
    ) {
        if (!this._view) {
            return;
        }

        if (type === 'assistantMessage') {
            // Send raw markdown for client-side rendering
            this.postMessage(type, { text, markdown: text }, sessionId);
            return;
        }

        this.postMessage(type, { text }, sessionId);
    }

    private async handleProgressMessage(msg: string, sessionId: string) {
        if (!this._view) {
            return;
        }

        // Check if this is a structured JSON streaming message
        try {
            const parsed = JSON.parse(msg);

            // Handle streaming messages
            if (parsed.type === 'stream_start' || parsed.type === 'stream_append' || parsed.type === 'stream_end') {
                this.postMessage('streamingChunk', parsed, sessionId);
                return;
            }

            // Handle tool execution messages
            if (parsed.type === 'tool_execution_start' || parsed.type === 'tool_execution_complete') {
                this.postMessage('toolExecution', parsed, sessionId);
                return;
            }
        } catch {
            // Not JSON - treat as plain text message
        }

        // Plain text message - send as markdown for client-side rendering
        this.sendAssistantMessage(msg, sessionId);
    }

    private async handleUserMessage(text: string, mode: string = 'agent', model: string = 'custom-api') {
        const activeSession = await getActiveSession(this._context);
        const sessionId = activeSession.id;

        // Cancel any existing request for THIS session only
        const existingController = this._abortControllers.get(sessionId);
        if (existingController) {
            existingController.abort();
        }

        // Create new AbortController for this request
        const abortController = new AbortController();
        this._abortControllers.set(sessionId, abortController);

        try {
            // Persist user message immediately so it's saved even if cancelled early
            const currentMessages = await readSessionMessages(this._context);
            currentMessages.push({
                role: 'user',
                content: text,
                timestamp: Date.now()
            });
            await writeSessionMessagesById(this._context, sessionId, currentMessages);

            const startTime = Date.now();
            let externalConfig = undefined;

            if (model !== 'custom-api') {
                const email = await AssistaAuthService.getUserEmail();
                if (!email) {
                    await this.sendAssistantMessage('You must be signed in to use this model. Please sign in from the settings or profile menu.', sessionId, 'error');
                    return;
                }

                try {
                    const keyData = await fetchExternalKey(email);
                    externalConfig = {
                        apiKey: keyData.apiKey,
                        model: model,
                        provider: 'openrouter'
                    };
                } catch (error) {
                    console.error('[AssistaCoder] Failed to fetch external key:', error);
                    await this.sendAssistantMessage('Failed to authenticate with Assista server. Please try again later or use a custom API key.', sessionId, 'error');
                    return;
                }
            }

            const response = await runAgent({
                contents: text,
                mode,
                model,
                externalConfig,
                abortSignal: abortController.signal,
                onProgress: (msg: string) => this.handleProgressMessage(msg, sessionId)
            }, this._context, this._odooEnvService, sessionId);

            // Check if request was cancelled
            if (abortController.signal.aborted) {
                return;
            }

            const elapsed = Date.now() - startTime;
            console.log(`[AssistaCoder] Total completion time taken in ${elapsed}ms`);
            const reply = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
            await this.sendAssistantMessage(reply, sessionId);
            void this.syncActiveSession();
        } catch (error: any) {
            // Don't show error if request was cancelled
            if (abortController.signal.aborted) {
                return;
            }
            const message = error?.message || String(error) || 'Unexpected error';

            // Save error message to session history so it persists
            try {
                const currentMessages = await readSessionMessages(this._context);
                currentMessages.push({
                    role: 'assistant',
                    content: message,
                    timestamp: Date.now(),
                    isError: true
                });
                await writeSessionMessagesById(this._context, sessionId, currentMessages);
            } catch (saveError) {
                console.error('[AssistaCoder] Failed to save error message to history:', saveError);
            }

            await this.sendAssistantMessage(message, sessionId, 'error');
        } finally {
            // Clear abort controller if this was the current request for this session
            if (this._abortControllers.get(sessionId) === abortController) {
                this._abortControllers.delete(sessionId);
            }
        }
    }

    private async mapMessageForWebview(
        message: ChatMessage
    ): Promise<{ role: string; content: string; markdown?: string; timestamp?: number; suggestions?: any; selection?: string; toolExecutions?: any[]; isError?: boolean }> {
        const base = {
            role: message.role,
            content: message.content,
            timestamp: message.timestamp,
            suggestions: message.suggestions,
            selection: message.selection,
            toolExecutions: message.toolExecutions,
            isError: message.isError
        };
        if ((message.role as any) === 'assistant' || (message.role as any) === 'tool') {
            // Send markdown for client-side rendering
            return { ...base, markdown: message.content };
        }
        return base;
    }

    private async queueHydration(sessionId: string, messages: ChatMessage[]): Promise<void> {
        if (!this._view) {
            this._pendingHydration = { sessionId, messages: messages.map((msg) => ({ ...msg })) };
            return;
        }
        const formatted = await Promise.all(messages.map((msg) => this.mapMessageForWebview(msg)));
        const isBusy = this._abortControllers.has(sessionId);
        this.postMessage('sessionHydrated', {
            sessionId,
            messages: formatted,
            isBusy
        }, sessionId);
    }

    private async flushPendingHydration(): Promise<void> {
        if (!this._view || !this._pendingHydration) {
            return;
        }
        const pending = this._pendingHydration;
        this._pendingHydration = undefined;
        // await this.queueHydration(pending.sessionId, pending.messages);
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
            console.warn('[AssistaCoder] Failed to load current chat session:', error);
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

    private async fetchAndSendModels(): Promise<void> {
        console.log('[AssistaCoder] fetchAndSendModels triggered');
        try {
            const models = await fetchAvailableModels();
            console.log(`[AssistaCoder] Successfully fetched ${models.length} models`);
            this.postMessage('availableModels', { models });
        } catch (error) {
            console.error('[AssistaCoder] Failed to fetch available models:', error);
            // Send empty models array to trigger fallback to custom API only
            this.postMessage('availableModels', { models: [], error: true });
        }
    }

    dispose(): void {
        // Clean up all disposables
        this._disposables.forEach(disposable => disposable.dispose());
        this._disposables = [];
    }
}
