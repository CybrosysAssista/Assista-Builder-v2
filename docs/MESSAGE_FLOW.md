# Message Flow: User and Assistant Messages

This document describes the complete flow of how user messages and assistant responses are saved into sessions and how they are rendered back when selecting a session from history.

## Table of Contents
1. [User Message Flow](#user-message-flow)
2. [Assistant Message Flow](#assistant-message-flow)
3. [Session Rendering from History](#session-rendering-from-history)
4. [Data Structures](#data-structures)

---

## User Message Flow

### 1. User Input in Webview

**Location:** `src/core/webview/chat/chat.js`

When a user types a message and submits it:

```589:589:src/core/webview/chat/chat.js
        vscode.postMessage({ command: "userMessage", text, mode: selectedMode, model: selectedModel });
```

The webview sends a message to the extension host with:
- `command`: `"userMessage"`
- `text`: The user's message content
- `mode`: The selected mode (e.g., 'agent' or 'chat')
- `model`: The selected model

### 2. Extension Host Receives User Message

**Location:** `src/core/webview/AssistaXProvider.ts`

The `AssistaXProvider` receives the message in the `onDidReceiveMessage` handler:

```67:74:src/core/webview/AssistaXProvider.ts
            if (message.command === 'userMessage') {
                const text = typeof message.text === 'string' ? message.text.trim() : '';
                if (!text) {
                    return;
                }
                const mode = typeof message.mode === 'string' ? message.mode : 'agent';
                await this.handleUserMessage(text, mode);
                return;
            }
```

### 3. Processing User Message

**Location:** `src/core/webview/AssistaXProvider.ts`

The `handleUserMessage` method processes the user's message:

```385:427:src/core/webview/AssistaXProvider.ts
    private async handleUserMessage(text: string, mode: string = 'agent') {
        // Cancel any existing request
        if (this._abortController) {
            this._abortController.abort();
        }

        // Create new AbortController for this request
        this._abortController = new AbortController();
        const abortController = this._abortController;

        try {
            const startTime = Date.now();
            const response = await runAgent({
                contents: text,
                mode,
                abortSignal: abortController.signal,
                onProgress: (msg: string) => this.handleProgressMessage(msg)
            }, this._context, this._odooEnvService);

            // Check if request was cancelled
            if (abortController.signal.aborted) {
                return;
            }

            const elapsed = Date.now() - startTime;
            console.log(`[AssistaX] Total completion time taken in ${elapsed}ms`);
            const reply = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
            await this.sendAssistantMessage(reply);
            // void this.syncActiveSession();
        } catch (error: any) {
            // Don't show error if request was cancelled
            if (abortController.signal.aborted) {
                return;
            }
            const message = error?.message || String(error) || 'Unexpected error';
            await this.sendAssistantMessage(message, 'error');
        } finally {
            // Clear abort controller if this was the current request
            if (this._abortController === abortController) {
                this._abortController = undefined;
            }
        }
    }
```

This method calls `runAgent` which handles the agent execution and message persistence.

### 4. Agent Execution and Message Persistence

**Location:** `src/core/runtime/agent.ts`

The `runAgent` function:
1. Reads existing session messages
2. Converts them to internal format
3. Calls the orchestrator
4. The orchestrator handles saving both user and assistant messages

```80:150:src/core/runtime/agent.ts
export async function runAgent(
  params: any = {},
  context: vscode.ExtensionContext,
  odooEnvService: OdooEnvironmentService
): Promise<string> {
  const onProgress = params.onProgress as ((msg: string) => void) | undefined;
  const abortSignal = params.abortSignal as AbortSignal | undefined;
  
  // Check if already cancelled
  if (abortSignal?.aborted) {
    throw new Error('Request cancelled');
  }
  if (!context) { throw new Error("Extension context is required."); }

  const cfg = params.config ?? {};
  let sessionHistory = await readSessionMessages(context);

  if (cfg.resetSession) {
    await clearActiveSession(context);
    sessionHistory = [];
  }

  // Get provider configuration
  const { provider: providerName, config: providerConfig } = await getActiveProviderConfig(context);
  const configSection = vscode.workspace.getConfiguration('assistaX');
  const customInstructions = configSection.get<string>('systemPrompt.customInstructions', '');

  // Create provider adapter
  const adapter = createProvider(providerName, providerConfig, context);

  // Convert session history to internal format
  const internalHistory = convertSessionToInternal(sessionHistory);

  // Get environment and system instruction with mode
  const mode = params.mode || 'agent';
  const environment = await odooEnvService.getEnvironment();
  const systemInstruction = getSystemInstruction(customInstructions, mode, environment);
  // console.log('environment', environment);
  // console.log('systemInstruction', systemInstruction);
  // Run orchestrator
  const userContent = typeof params.contents === 'string' ? params.contents : String(params.contents || '');

  const requestPayload = {
    contents: userContent,
    config: {
      ...params.config,
      systemInstruction,
      mode: params.mode || 'agent',
    },
    reset: cfg.resetSession,
  };

  // Persist user message immediately so it exists before tools run

  // Log request before calling orchestrator
  // console.log('[Assista X] Request to orchestrator:',requestPayload);
  // console.log('[Assista X] context:',context);
  // console.log('[Assista X] adapter:',adapter);
  // console.log('[Assista X] Internal history:',internalHistory);

  const response = await runAgentOrchestrator(
    requestPayload,
    context,
    adapter,
    internalHistory,
    abortSignal,
    onProgress
  );

  return response;
}
```

### 5. Orchestrator Adds User Message

**Location:** `src/core/agent/orchestrator.ts`

The orchestrator adds the user message to the internal messages array:

```35:39:src/core/agent/orchestrator.ts
  // Add user message
  internalMessages.push({
    role: 'user',
    content: [{ type: 'text', text: params.contents }],
  });
```

---

## Assistant Message Flow

### 1. Orchestrator Processes Response

**Location:** `src/core/agent/orchestrator.ts`

The orchestrator processes the streaming response from the provider and builds the assistant message:

```66:147:src/core/agent/orchestrator.ts
    // Create message stream
    const stream = adapter.createMessageStream(providerRequest, { ...params.config, abortSignal });

    const toolCalls: Array<{ id: string; name: string; args: string }> = [];
    let streamedText = "";
    let isStreaming = false;
    
    // Process stream
    for await (const event of stream) {
      // Check if cancelled
      if (abortSignal?.aborted) {
        throw new Error('Request cancelled');
      }
      
      switch (event.type) {
        case 'text':
        case 'reasoning':
          streamedText += event.text;
          finalResponse += event.text;
          onProgress?.(JSON.stringify({
            type: isStreaming ? 'stream_append' : 'stream_start',
            text: event.text
          }));
          isStreaming = true;
          break;

        case 'tool_call':
          if (isStreaming) {
            onProgress?.(JSON.stringify({ type: 'stream_end' }));
            isStreaming = false;
          }
          toolCalls.push({
            id: event.id,
            name: event.name,
            args: event.args
          });
          break;

        case 'usage':
          // Log usage if needed
          console.log(`[Assista X] Usage: ${event.inputTokens} input, ${event.outputTokens} output tokens`);
          break;

        case 'error':
          throw new Error(event.error);

        case 'end':
          // Stream ended - mark streaming as complete
          if (isStreaming) {
            onProgress?.(JSON.stringify({ type: 'stream_end' }));
            isStreaming = false;
          }
          break;
      }
    }
    
    console.log('[Assista X] Final Streamed Text:', streamedText);
    console.log('[Assista X] Tool Calls:', toolCalls);

    // Build assistant message with both text and tool calls
    const assistantContent: any[] = [];
    
    // Add text content if present
    if (streamedText.trim()) {
      assistantContent.push({ type: 'text', text: streamedText });
    }
    
    // Add tool use blocks
    for (const toolCall of toolCalls) {
      assistantContent.push({
        type: 'tool_use',
        id: toolCall.id,
        name: toolCall.name,
        input: safeParseJson(toolCall.args),
      });
    }
    
    // Push single assistant message with all content
    if (assistantContent.length > 0) {
      internalMessages.push({
        role: 'assistant',
        content: assistantContent,
        timestamp: Date.now()
      });
    }
```

### 2. Conversion to Session Format

**Location:** `src/core/agent/orchestrator.ts`

After processing (and tool execution if any), the orchestrator converts internal messages to session format and saves them:

```239:256:src/core/agent/orchestrator.ts
    // No tool calls - we have final response
    // Note: Type assertion needed because TypeScript language server may cache old signature
    // The function signature in agent.ts does accept an optional second parameter
    console.log('[AssistaX] Converting to session - toolExecutions map size:', toolExecutions.size);
    if (toolExecutions.size > 0) {
      console.log('[AssistaX] Tool executions in map:', Array.from(toolExecutions.entries()));
    }
    const sessionMessages = (convertInternalToSession as (
      messages: typeof internalMessages,
      executions?: Map<string, ToolExecution>
    ) => ReturnType<typeof convertInternalToSession>)(internalMessages, toolExecutions.size > 0 ? toolExecutions : undefined);
    console.log('[AssistaX] Session messages after conversion:', JSON.stringify(sessionMessages.map(m => ({
      role: m.role,
      content: m.content.substring(0, 50) + '...',
      toolExecutions: m.toolExecutions
    })), null, 2));
    await writeSessionMessages(context, sessionMessages);
    return finalResponse.trim();
```

**Location:** `src/core/runtime/agent.ts`

The `convertInternalToSession` function converts internal message format to session format:

```29:78:src/core/runtime/agent.ts
export function convertInternalToSession(
  internalMessages: InternalMessage[],
  toolExecutions?: Map<string, ToolExecution>
): ChatMessage[] {
  console.log('[AssistaX] convertInternalToSession called with toolExecutions:', toolExecutions ? `Map(${toolExecutions.size})` : 'undefined');
  return internalMessages
    .filter(msg => msg.role === 'user' || msg.role === 'assistant')
    .map(msg => {
      let content = '';
      const toolExecs: ToolExecution[] = [];
      
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else {
        // Extract text from blocks
        const textBlocks = msg.content.filter(block => block.type === 'text');
        content = textBlocks.map(block => (block as any).text).join('\n');
        
        // Extract tool executions for assistant messages
        if (msg.role === 'assistant' && toolExecutions) {
          console.log('[AssistaX] Processing assistant message, looking for tool_use blocks');
          for (const block of msg.content) {
            if (block.type === 'tool_use' && block.id) {
              console.log('[AssistaX] Found tool_use block with id:', block.id, 'tool name:', (block as any).name);
              const toolExec = toolExecutions.get(block.id);
              if (toolExec) {
                console.log('[AssistaX] Found matching tool execution:', toolExec);
                toolExecs.push(toolExec);
              } else {
                console.log('[AssistaX] No matching tool execution found for id:', block.id);
              }
            }
          }
        }
      }
      
      const result: ChatMessage = {
        role: msg.role as ChatRole,
        content,
        timestamp: msg.timestamp,
      };
      
      if (toolExecs.length > 0) {
        result.toolExecutions = toolExecs;
        console.log('[AssistaX] Attached toolExecutions to message:', toolExecs.length, 'executions');
      }
      
      return result;
    });
}
```

### 3. Writing Messages to Session

**Location:** `src/core/runtime/sessionManager.ts`

The `writeSessionMessages` function saves messages to the active session:

```146:157:src/core/runtime/sessionManager.ts
export async function writeSessionMessages(
    context: vscode.ExtensionContext,
    history: ChatMessage[]
): Promise<void> {
    const state = await ensureLoaded(context);
    const session = await getMutableActiveSession(context);
    const sanitized = (sanitizeMessages(history));
    session.messages = sanitized;
    session.updatedAt = sanitized.length ? Date.now() : session.updatedAt;
    session.title = deriveTitle(session.messages);
    await persist(context, state);
}
```

The `sanitizeMessages` function ensures messages are valid:

```39:50:src/core/runtime/sessionManager.ts
function sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages
        .filter((message) => typeof message.content === 'string' && message.content.trim().length > 0)
        .map((message) => ({
            role: message.role,
            content: message.content,
            timestamp: typeof message.timestamp === 'number' ? message.timestamp : Date.now(),
            suggestions: message.suggestions,
            selection: message.selection,
            toolExecutions: message.toolExecutions
        }));
}
```

### 4. Persisting to Storage

**Location:** `src/core/runtime/sessionManager.ts`

The `persist` function saves sessions to VS Code's global state:

```71:87:src/core/runtime/sessionManager.ts
async function persist(context: vscode.ExtensionContext, state: SessionState): Promise<void> {
    const sessionsWithMessages = state.sessions.filter((session) => session.messages.length > 0);
    for (const session of sessionsWithMessages) {
        if (!session.title || !session.title.trim()) {
            session.title = deriveTitle(session.messages);
        }
    }

    // Always persist the active session ID, even if the session is empty
    // This is crucial for new chat sessions that haven't received messages yet
    const activeId = state.activeSessionId;

    await Promise.all([
        writePersistedSessions(context, deepClone(sessionsWithMessages)),
        writeActiveSessionId(context, activeId)
    ]);
}
```

**Location:** `src/core/runtime/sessions/storage.ts`

The `writePersistedSessions` function writes to VS Code's global state:

```65:95:src/core/runtime/sessions/storage.ts
export async function writePersistedSessions(
    context: vscode.ExtensionContext,
    sessions: ChatSession[]
): Promise<void> {
    const serializable = sessions.map((session) => ({
        id: session.id,
        title: session.title ?? undefined,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        messages: session.messages.map((message) => {
            const result: any = {
                role: message.role,
                content: message.content,
                timestamp: message.timestamp
            };
            // Preserve suggestions and selection if they exist
            if (message.suggestions && Array.isArray(message.suggestions)) {
                result.suggestions = message.suggestions;
            }
            if (typeof message.selection === 'string') {
                result.selection = message.selection;
            }
            // Preserve toolExecutions if they exist
            if (message.toolExecutions && Array.isArray(message.toolExecutions)) {
                result.toolExecutions = message.toolExecutions;
            }
            return result;
        })
    }));
    await context.globalState.update(STORAGE_KEY, serializable);
}
```

---

## Session Rendering from History

### 1. User Selects Session from History

**Location:** `src/core/webview/AssistaXProvider.ts`

When a user clicks on a session in the history:

```148:159:src/core/webview/AssistaXProvider.ts
            if (message.command === 'openSession') {
                // Switch active session and hydrate webview
                const id = typeof message.id === 'string' ? message.id : '';
                if (id) {
                    const switched = await switchActiveSession(this._context, id);
                    console.log('[AssistaX] Session opened from history:', switched);
                    this._view?.show?.(true);
                    await this.queueHydration(switched.id, switched.messages);
                    this.postMessage('historyOpened', { sessionId: switched.id });
                }
                return;
            }
```

### 2. Switching Active Session

**Location:** `src/core/runtime/sessionManager.ts`

The `switchActiveSession` function changes the active session:

```184:196:src/core/runtime/sessionManager.ts
export async function switchActiveSession(
    context: vscode.ExtensionContext,
    sessionId: string
): Promise<ChatSession> {
    const state = await ensureLoaded(context);
    const target = state.sessions.find((session) => session.id === sessionId);
    if (!target) {
        throw new Error(`Chat session "${sessionId}" not found.`);
    }
    state.activeSessionId = sessionId;
    await persist(context, state);
    return deepClone(target);
}
```

### 3. Hydrating Webview with Session Messages

**Location:** `src/core/webview/AssistaXProvider.ts`

The `queueHydration` method prepares messages for the webview:

```447:460:src/core/webview/AssistaXProvider.ts
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
```

The `mapMessageForWebview` method formats messages for display:

```429:445:src/core/webview/AssistaXProvider.ts
    private async mapMessageForWebview(
        message: ChatMessage
    ): Promise<{ role: string; content: string; markdown?: string; timestamp?: number; suggestions?: any; selection?: string; toolExecutions?: any[] }> {
        const base = {
            role: message.role,
            content: message.content,
            timestamp: message.timestamp,
            suggestions: message.suggestions,
            selection: message.selection,
            toolExecutions: message.toolExecutions
        };
        if (message.role === 'assistant') {
            // Send markdown for client-side rendering
            return { ...base, markdown: message.content };
        }
        return base;
    }
```

### 4. Webview Receives Hydration Message

**Location:** `src/core/webview/ui/main.js`

The webview receives the `sessionHydrated` message:

```129:133:src/core/webview/ui/main.js
        case 'sessionHydrated': {
            const payload = message.payload || {};
            chat.renderSession(payload.sessionId, Array.isArray(payload.messages) ? payload.messages : []);
            break;
        }
```

### 5. Rendering Messages in Chat UI

**Location:** `src/core/webview/chat/chat.js`

The `renderSession` function renders all messages:

```450:532:src/core/webview/chat/chat.js
    function renderSession(sessionId, messages) {
        if (!messagesEl) {
            return;
        }

        messagesEl.innerHTML = "";
        activeSessionId = sessionId;
        currentMessages = Array.isArray(messages) ? messages : [];

        // Reset streaming state
        streamingMessageBubble = null;
        streamingTextBuffer = '';
        streamingRow = null;
        if (streamingRenderTimeout) {
            cancelAnimationFrame(streamingRenderTimeout);
            streamingRenderTimeout = null;
        }

        // optimisticUserMessage logic REMOVED

        if (Array.isArray(messages)) {
            messages.forEach((message) => {
                if (message.suggestions && message.suggestions.length > 0) {
                    showQuestion(
                        null, // No active questionId for history
                        message.content,
                        message.suggestions,
                        message.selection
                    );
                } else if (message.role === "user" && message.selection) {
                    // Skip user messages that are just selections for questions
                    // as they are already displayed in the question UI
                    return;
                } else {
                    const role =
                        message.role === "assistant"
                            ? "ai"
                            : message.role === "system"
                                ? "system"
                                : "user";
                    appendMessage(
                        String(message.content ?? ""),
                        role,
                        typeof message.html === "string" ? message.html : undefined,
                        typeof message.markdown === "string" ? message.markdown : undefined
                    );
                    
                    // Show tool executions if present (for restored sessions)
                    if (message.toolExecutions && Array.isArray(message.toolExecutions)) {
                        message.toolExecutions.forEach((toolExec) => {
                            // Show tool execution with completed status (since it's from history)
                            showToolExecution({
                                toolId: toolExec.toolId,
                                toolName: toolExec.toolName,
                                filename: toolExec.filename,
                                status: toolExec.status
                            });
                        });
                    }
                }
            });
        }

        if (!messages || !messages.length) {
            if (welcomeEl) {
                // Trigger splash animation every time welcome screen is shown
                if (typeof window.showSplashAnimation === 'function') {
                    window.showSplashAnimation();
                } else {
                    // Fallback if animation not available
                    welcomeEl.style.display = "";
                    welcomeEl.classList.add("active");
                    welcomeEl.setAttribute("aria-hidden", "false");
                }
            }
        } else {
            showChatArea();
        }

        toggleBusy(false);

        persistState();
    }
```

For each message:
- If it has suggestions, it's rendered as a question UI
- User messages with selections are skipped (already shown in question UI)
- Other messages are rendered using `appendMessage` with their role, content, and markdown (for assistant messages)

---

## Data Structures

### ChatMessage

**Location:** `src/core/runtime/sessions/types.ts`

```11:18:src/core/runtime/sessions/types.ts
export interface ChatMessage {
    role: ChatRole;
    content: string;
    timestamp?: number;
    suggestions?: Array<{ text: string; mode?: string | null }>;
    selection?: string;
    toolExecutions?: ToolExecution[];
}
```

### ChatSession

**Location:** `src/core/runtime/sessions/types.ts`

```20:26:src/core/runtime/sessions/types.ts
export interface ChatSession {
    id: string;
    title?: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
}
```

### ChatRole

**Location:** `src/core/runtime/sessions/types.ts`

```1:1:src/core/runtime/sessions/types.ts
export type ChatRole = 'system' | 'user' | 'assistant';
```

---

## Summary Flow Diagram

```
USER MESSAGE FLOW:
1. User types message → chat.js sends 'userMessage' command
2. AssistaXProvider.handleUserMessage() receives it
3. runAgent() is called
4. runAgentOrchestrator() adds user message to internalMessages
5. After processing, convertInternalToSession() converts to ChatMessage[]
6. writeSessionMessages() saves to active session
7. persist() writes to VS Code globalState

ASSISTANT MESSAGE FLOW:
1. Orchestrator processes streaming response
2. Builds assistant message with text content
3. Adds to internalMessages array
4. convertInternalToSession() extracts text content
5. writeSessionMessages() saves both user and assistant messages
6. persist() writes to VS Code globalState

SESSION RENDERING FLOW:
1. User clicks session in history → 'openSession' command
2. switchActiveSession() changes active session
3. queueHydration() maps messages for webview
4. Sends 'sessionHydrated' message to webview
5. main.js receives message → calls chat.renderSession()
6. renderSession() clears UI and renders all messages
7. Each message is appended with appendMessage()
```

---

## Key Points

1. **User messages** are added to the internal messages array in the orchestrator before processing
2. **Assistant messages** are added after the provider response is received and processed
3. **Both messages** are saved together in a single `writeSessionMessages()` call after the assistant response is complete
4. **Session rendering** happens by:
   - Switching the active session
   - Hydrating the webview with all messages from that session
   - Rendering each message in order using the `renderSession()` function
5. **Messages are stored** in VS Code's `globalState` using the key `'assistaX.chat.sessions'`
6. **The active session ID** is stored separately using the key `'assistaX.chat.activeSessionId'`

