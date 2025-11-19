## Assista X – Architecture & Data Flow

This document explains how the current Assista X VS Code extension is structured and how data flows through it, mapped onto the conceptual pipeline you described (UI → Orchestrator → Context/Memory → LLM → Tools → Filesystem → Validation → User).

---

## 1. High‑Level Overview

- **Extension type**: VS Code extension with a webview‑based chat UI.
- **Main responsibilities**:
  - Provide a chat‑like interface for Odoo development assistance.
  - Maintain chat sessions and history.
  - Call configured LLM providers (Google / OpenAI‑compatible / OpenRouter / custom).
  - Allow the model to perform file operations via a controlled tool layer (`read_file`, `write_file`, `apply_patch`, `create_folder`).

Conceptual mapping:

1. **User Interface (IDE / Chat)** → `webview` (HTML + JS) managed by `AssistaXProvider`.
2. **Backend Orchestrator** → `AssistaXProvider` + `runAgent`.
3. **Context Manager / Memory** → `sessionManager` + `agent/sessionStore`.
4. **Context Retriever** → currently session history only (hooks for future RAG).
5. **LLM Layer (Gemini / OpenAI / OpenRouter / custom)** → `providerCaller` + `providers/openai` + `providers/google`.
6. **Function Executor / Tool Layer** → `toolRunner` + `tools/registry` + concrete tools.
7. **File System & Project Index** → VS Code workspace FS; no project index/RAG yet.
8. **Validation Engine** → not fully implemented yet; current validation is mainly TypeScript + ESLint + VS Code diagnostics.

---

## 2. User Interface (Webview Chat)

### 2.1. Activation & Webview Registration

- **File**: `src/extension.ts`

```5:18:src/extension.ts
import * as vscode from 'vscode';
import { AssistaXProvider } from './core/webview/AssistaXProvider.js';
import { registerAllCommands } from './core/commands/index.js';

export function activate(context: vscode.ExtensionContext) {
    const provider = new AssistaXProvider(context.extensionUri, context);

    const registration = vscode.window.registerWebviewViewProvider(
        AssistaXProvider.viewType,
        provider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );

    context.subscriptions.push(registration);

    const commandDisposables = registerAllCommands(context, provider);
    context.subscriptions.push(...commandDisposables);
}
```

- **Commands**: `assistaX.open`, `assistaX.newChat`, `assistaX.settings`, `assistaX.openHistory`.
- **View**: `assistaXView` webview in the activity bar.

### 2.2. Webview Provider & Message Handling

- **File**: `src/core/webview/AssistaXProvider.ts`
- Responsibilities:
  - Render the HTML/JS UI via `getHtmlForWebview`.
  - Route messages between the webview and backend controllers / agent.
  - Manage “settings” and “history” sub‑views.

Core wiring:

```6:18:src/core/webview/AssistaXProvider.ts
import * as vscode from 'vscode';
import { ChatMessage, ChatSession, getActiveSession, getAllSessions, startNewSession, switchActiveSession } from '../ai/sessionManager.js';
import { getHtmlForWebview } from './utils/webviewUtils.js';
import { SettingsController } from './settings/SettingsController.js';
import { HistoryController } from './history/HistoryController.js';
import { runAgent } from "../ai/agent/agent.js";
```

Handling a user chat message:

```227:239:src/core/webview/AssistaXProvider.ts
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
```

**Data flow** (UI tier):

1. Webview JS posts `{ command: 'userMessage', text }` to the extension.
2. `AssistaXProvider` calls `runAgent({ contents: text }, context)`.
3. Once a response is available, it posts `{ type: 'assistantMessage', text, html }` back to the webview.
4. It then triggers `syncActiveSession` to hydrate the UI with the up‑to‑date session history.

---

## 3. Backend Orchestrator (Agent)

### 3.1. Entry Point – `runAgent`

- **File**: `src/core/ai/agent/agent.ts`
- Role: orchestrate each request:
  - Optional direct tool execution.
  - Session loading/reset.
  - Prompt assembly.
  - Provider call + tool‑use loop.
  - Final session persistence.

```17:27:src/core/ai/agent/agent.ts
export async function runAgent(params: any = {}, context: vscode.ExtensionContext): Promise<any> {
    if (!context) throw new Error("Extension context is required.");

    if (params?.toolCall) {
        const toolCall: ToolCall = {
            name: params.toolCall.name,
            args: Array.isArray(params.toolCall.args) ? params.toolCall.args : []
        };
        debugLog(params, `Executing tool (explicit param): ${toolCall.name}`);
        return await executeToolCall(toolCall);
    }
```

### 3.2. Session & Prompt Assembly

```29:48:src/core/ai/agent/agent.ts
    // 1️⃣ Load session as CHAT messages (for history only)
    let sessionHistory = await readSessionMessages(context);

    const cfg = params.config ?? {};

    if (cfg.resetSession) {
        await clearActiveSession(context);
        sessionHistory = [];
    }

    // 2️⃣ Build initial ProviderMessages (NO CHAT MESSAGES AFTER THIS)
    const providerMessages: ProviderMessage[] = [];

    // system prompts
    for (const s of await assemblePrompt(params, sessionHistory)) {
        providerMessages.push({
            role: s.role as any,
            content: s.content
        });
    }
```

- `assemblePrompt` (see §4) returns a sequence of `ChatMessage`s:
  - System prompts.
  - Optional custom system instruction.
  - Optional trimmed chat history.
  - New user message(s).
- These are converted to provider‑agnostic `ProviderMessage[]` for the LLM layer.

### 3.3. Provider Call & Tool‑Use Loop

```50:100:src/core/ai/agent/agent.ts
    // 3️⃣ First model call
    debugLog(params, "Sending to provider:", JSON.stringify(providerMessages, null, 2));
    let providerResponse = await callProvider(providerMessages, params, context);
    debugLog(params, "Provider response:", providerResponse);
    let lastAssistantResponse = providerResponse;

    const MAX_STEPS = 30;
    let step = 0;

    while (step++ < MAX_STEPS) {
        // Parse structured tool call
        const call = parseProviderToolCall(providerResponse);

        if (!call) break;

        debugLog(params, `STEP ${step}: Parsed tool call →`, call);

        // 1️⃣ Assistant function-call stub
        providerMessages.push({
            role: "assistant",
            content: "",
            toolCall: call
        });

        // 2️⃣ Execute tool
        debugLog(params, `Executing tool: ${call.name}`, "Args:", call.args);
        const toolResult = await executeToolCall(call);
        debugLog(params, "Tool result:", toolResult);

        // 3️⃣ Inject tool result
        const toolMessage = {
            role: "tool" as const,
            content: typeof toolResult.output === "string"
                ? toolResult.output
                : JSON.stringify(toolResult.output ?? { error: toolResult.error }),
            tool_call_id: call.id,
            name: call.name
        };
        debugLog(params, "Injecting tool result message:", toolMessage);
        providerMessages.push(toolMessage);

        // 4️⃣ Next LLM call
        debugLog(params, "ProviderMessages (before next call):", JSON.stringify(providerMessages, null, 2));
        providerResponse = await callProvider(providerMessages, params, context);
        lastAssistantResponse = providerResponse;
    }
```

**Data through each step in the loop**:

1. `providerResponse` (raw provider format) is parsed by `parseProviderToolCall` into a canonical `ToolCall`:
   - `name: string`
   - `args: any`
   - `id: string`
2. An assistant message with `toolCall` is appended to `providerMessages`.
3. `executeToolCall` runs the selected tool and returns `ToolResult`:
   - `{ success: boolean; output?: any; error?: string }`.
4. A `tool` message with `content` (JSON string) and `tool_call_id` is appended.
5. `callProvider` is invoked again with the extended `messages` array.

### 3.4. Final Persistence

```102:116:src/core/ai/agent/agent.ts
    // 9️⃣ Persist final assistant response to session (ONLY FINAL)
    const newUserMessages = normalizeMessages([
        { role: "user", content: params.contents }
    ]);

    const finalAssistantText = extractProviderContent(lastAssistantResponse);

    await persistAssistantReply(
        context,
        sessionHistory,
        newUserMessages,
        { role: "assistant", content: finalAssistantText }
    );

    return lastAssistantResponse;
}
```

**Result**:

- The user’s new message and the final assistant reply are appended to the active `ChatSession` and persisted.
- The full raw `lastAssistantResponse` (provider‑specific shape) is returned to the webview for display.

---

## 4. Context Manager / Memory Layer

### 4.1. System Prompts

- **File**: `src/core/ai/prompts/systemPrompts.ts`

```1:27:src/core/ai/prompts/systemPrompts.ts
import type { ChatMessage } from '../sessionManager.js';

const SYSTEM_PROMPTS: ReadonlyArray<ChatMessage> = Object.freeze([
    {
        role: 'system',
        content: 'You are Assista X, an AI assistant specialized in Odoo development, functional workflows, module customization, debugging, architecture decisions, ORM usage, API integration, and best practices across Odoo versions. Help developers working on Odoo projects with precise, actionable, minimally verbose guidance.'
    },
    {
        role: 'system',
        content: 'Provide clear reasoning while staying concise. Prefer direct code examples using correct Odoo patterns. Validate missing information explicitly, warn about incorrect, unsafe, or deprecated approaches, and highlight version-specific differences when relevant.'
    },
    {
        role: 'system',
        content: 'Never guess unknown facts, never output destructive commands unless explicitly requested and safe, and never expose private data, secrets, or internal file paths unless provided by the user. Prioritize accuracy, reliability, and a professional tone.'
    },
    {
        role: 'system',
        content: `When you want the assistant to perform filesystem or repo actions, return EXACTLY a JSON object with a "toolCall" field:
{
  "toolCall": {
    "name": "read_file" | "write_file" | "apply_patch" | "create_folder",
    "args": [ ... ]
  }
}
Do not include extra text. If you only need to explain something, respond normally (no toolCall).`
    }
]);
```

### 4.2. Prompt Builder

- **File**: `src/core/ai/agent/promptBuilder.ts`

```25:55:src/core/ai/agent/promptBuilder.ts
export async function assemblePrompt(
    params: any,
    sessionHistory: ChatMessage[]
): Promise<ChatMessage[]> {
    const config = params.config ?? {};
    const hasExplicitMessages = Array.isArray(params.messages) && params.messages.length > 0;
    const useSessionHistory = !hasExplicitMessages && config.useSession !== false;
    const systemInstruction = typeof config.systemInstruction === 'string'
        ? config.systemInstruction.trim()
        : '';

    const newMessages = hasExplicitMessages
        ? normalizeMessages(params.messages)
        : normalizeMessages([{ role: 'user', content: params.contents }]);

    if (!newMessages.length) { throw new Error('runAgent requires at least one user message.'); }

    // Future: insert RAG/context here, e.g. await attachRagContext(...)
    const messages: ChatMessage[] = getSystemPrompts();
    if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
    }
    if (useSessionHistory && sessionHistory.length) {
        messages.push(...trimHistory(sessionHistory));
    }
    messages.push(...newMessages);

    return messages;
}
```

**Current context behavior**:

- Maintains:
  - System instructions.
  - Optional extra system instruction (`config.systemInstruction`).
  - Recent chat history (`trimHistory` → last `MAX_HISTORY_MESSAGES` user/assistant messages).
- **Planned extension**:
  - `// Future: insert RAG/context here` is where project context, Odoo documentation, or code snippets would be injected (the “Context Retriever” in your diagram).

### 4.3. Session Store & Persistence

- **Types**: `src/core/ai/sessions/types.ts`

```1:15:src/core/ai/sessions/types.ts
export type ChatRole = 'system' | 'user' | 'assistant';

export interface ChatMessage {
    role: ChatRole;
    content: string;
    timestamp?: number;
}

export interface ChatSession {
    id: string;
    title?: string;
    createdAt: number;
    updatedAt: number;
    messages: ChatMessage[];
}
```

- **Session Manager**: `src/core/ai/sessionManager.ts`

This module:

- Loads and caches sessions in memory.
- Creates new sessions with `randomUUID`.
- Trims history to `MAX_HISTORY_MESSAGES`.
- Persists sessions and active session ID to `globalState`.

Key functions:

```133:146:src/core/ai/sessionManager.ts
export async function getActiveSession(context: vscode.ExtensionContext): Promise<ChatSession> {
    const session = await getMutableActiveSession(context);
    return deepClone(session);
}

export async function readSessionMessages(context: vscode.ExtensionContext): Promise<ChatMessage[]> {
    const session = await getMutableActiveSession(context);
    return deepClone(session.messages);
}

export async function writeSessionMessages(
    context: vscode.ExtensionContext,
    history: ChatMessage[]
): Promise<void> {
    const state = await ensureLoaded(context);
    const session = await getMutableActiveSession(context);
    const sanitized = trimHistory(sanitizeMessages(history));
    session.messages = sanitized;
    session.updatedAt = sanitized.length ? Date.now() : session.updatedAt;
    session.title = deriveTitle(session.messages);
    await persist(context, state);
}
```

- **Agent‑facing session store**: `src/core/ai/agent/sessionStore.ts`

```28:40:src/core/ai/agent/sessionStore.ts
export async function persistAssistantReply(
    context: vscode.ExtensionContext,
    previousHistory: ChatMessage[],
    newUserMessages: ChatMessage[],
    finalAssistant: { role: "assistant"; content: string }
): Promise<void> {
    const updatedHistory: ChatMessage[] = [
        ...previousHistory,
        ...newUserMessages,
        finalAssistant
    ];
    await writeSessionMessages(context, updatedHistory);
}
```

**Mapping to your diagram**:

- **Chat Memory (session store)**: `sessionManager` + `agent/sessionStore`.
- **Message History (last N turns)**: `MAX_HISTORY_MESSAGES` and `trimHistory`.
- **Project context / RAG**: not implemented yet; the hook is in `assemblePrompt`.

---

## 5. LLM Providers & Request/Response Flow

### 5.1. Provider Message Type

- **File**: `src/core/ai/types.ts`

```1:14:src/core/ai/types.ts
export type ProviderRole = "system" | "user" | "assistant" | "tool";

export interface ProviderMessage {
    role: ProviderRole;
    content: string;

    toolCall?: {
        name: string;
        args?: any[];
        id?: string;
    };
    tool_call_id?: string;
    name?: string;
}
```

### 5.2. Provider Caller (Routing & Formatting)

- **File**: `src/core/ai/agent/providerCaller.ts`

```23:84:src/core/ai/agent/providerCaller.ts
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
```

### 5.3. Provider Configuration & API Keys

- **File**: `src/core/services/configService.ts`
- Reads:
  - `assistaX.activeProvider`
  - `assistaX.providers` (per‑provider models and URLs)
  - Secrets like `assistaX.apiKey.google`, `assistaX.apiKey.openrouter`, etc.

Key behavior:

```49:60:src/core/services/configService.ts
    const providerConfig: ProviderConfig = {
        apiKey,
        model: providersConfig[activeProvider]?.model || defaultModels[activeProvider] || '',
        customUrl: providersConfig[activeProvider]?.customUrl,
    };

    if (!providerConfig.model) {
        throw new Error(`Model for ${activeProvider} not configured. Please go to Settings.`);
    }
```

For Google, model IDs are normalized for compatibility, and the normalized value is persisted back into the `assistaX.providers` setting if it changed.

### 5.4. OpenAI‑Compatible Providers

- **File**: `src/core/ai/providers/openai.ts`
- Supports:
  - `openai`
  - `anthropic` (via OpenRouter)
  - `openrouter`
  - `custom`

Core logic:

```17:25:src/core/ai/providers/openai.ts
export async function generateWithOpenAICompat(
    params: any,
    config: ProviderConfig,
    provider: string,
    context: vscode.ExtensionContext
): Promise<string> {
    const url = getApiUrl(provider, config);
    if (!url) { throw new Error(`URL for provider ${provider} not configured.`); }
```

Message building and JSON‑mode handling:

```26:66:src/core/ai/providers/openai.ts
    const systemPrompt = params.config?.systemInstruction || '';
    // Support either a full messages array or a single string prompt
    let messages: Array<{ role: string; content: string }> = [];
    if (Array.isArray(params?.messages) && params.messages.length) {
        messages = params.messages.map((m: any) => ({ role: m.role, content: String(m.content ?? '') }));
        // Prepend system if provided and not already present
        if (systemPrompt) {
            const hasSystem = messages.length && messages[0].role === 'system';
            if (!hasSystem) { messages.unshift({ role: 'system', content: systemPrompt }); }
        }
    } else {
        let userPrompt = params.contents;
        if (typeof userPrompt !== 'string') {
            userPrompt = JSON.stringify(userPrompt);
        }
        if (systemPrompt) {
            messages.push({ role: 'system', content: systemPrompt });
        }
        messages.push({ role: 'user', content: userPrompt });
    }

    const body: any = {
        model: config.model,
        messages,
    };
    ...
    if (reqCfg?.responseMimeType === 'application/json') {
        body.response_format = { type: 'json_object' };
        const hasJsonInstruction = messages.some(
            m => (m as any).role === 'system' && typeof (m as any).content === 'string' && (m as any).content.includes('MUST respond in valid JSON')
        );
        if (!hasJsonInstruction) {
            messages[messages.length - 1].content += '\n\nYou MUST respond in valid JSON format, without any markdown formatting or extra text.';
        }
    }
```

Resilient request with retries and timeout:

```83:136:src/core/ai/providers/openai.ts
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
    };
    ...
    const maxRetries = 10;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 60_000);
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
                signal: controller.signal,
            });
            clearTimeout(timeout);
            ...
            const data = await response.json() as any;
            const text = (data as any)?.choices?.[0]?.message?.content?.trim?.() || '';
            return text;
        } catch (e: any) {
            clearTimeout(timeout);
            lastErr = e;
            // Retry on abort/network error except last attempt
            if (attempt < maxRetries) {
                const backoff = Math.pow(2, attempt - 1) * 1000;
                await new Promise(r => setTimeout(r, backoff));
                continue;
            }
        }
    }
    throw new Error(`Request failed after ${maxRetries} attempts: ${lastErr?.message || lastErr}`);
}
```

### 5.5. Google Gemini Provider

- **File**: `src/core/ai/providers/google.ts`

```7:41:src/core/ai/providers/google.ts
export async function generateWithGoogle(
    params: any,
    config: ProviderConfig,
    _context: vscode.ExtensionContext
): Promise<string> {
    const maxRetries = 10;
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const { GoogleGenerativeAI } = await import('@google/generative-ai');
            const genAI = new GoogleGenerativeAI(config.apiKey);
            const model = genAI.getGenerativeModel({ model: config.model });

            const systemPrompt = params.config?.systemInstruction || '';
            const promptParts: string[] = [];
            if (Array.isArray(params?.messages) && params.messages.length) {
                if (systemPrompt) { promptParts.push(systemPrompt); }
                // Flatten messages into a single textual context for Gemini simple generateContent
                const combined = params.messages.map((m: any) => {
                    const role = String(m.role || '').toUpperCase();
                    return `[${role}] ${String(m.content ?? '')}`;
                }).join('\n');
                promptParts.push(combined);
            } else {
                let userPrompt = params.contents;
                if (typeof userPrompt !== 'string') { userPrompt = JSON.stringify(userPrompt); }
                if (systemPrompt) { promptParts.push(systemPrompt); }
                promptParts.push(userPrompt);
            }

            const result = await model.generateContent(promptParts);
            const response = await result.response;
            const text = response.text();
            return text ? text.trim() : '';
        } catch (error) {
            lastError = error as Error;
            console.warn(`Google API attempt ${attempt} failed:`, error);

            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 1000; // 1s, 2s, 4s backoff
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
```

**Note**: Tool‑calling for Gemini is supported **in the caller/parser**, but `generateWithGoogle` currently flattens messages rather than using structured function‑calling; extending this to use Gemini’s full function‑calling API would mirror the OpenAI‑style flow more closely.

### 5.6. Provider Response Normalization

- **Extracting assistant content**: `extractProviderContent` in `providerCaller.ts`:

```7:20:src/core/ai/agent/providerCaller.ts
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
```

---

## 6. Tool Layer (Function Executor)

### 6.1. Tool Registry

- **File**: `src/core/tools/registry.ts`

```1:43:src/core/tools/registry.ts
import { z } from "zod";
import { readFileTool } from "./readFileTool.js";
import { writeFileTool } from "./writeFileTool.js";
import { applyPatchTool } from "./applyPatchTool.js";
import { createFolderTool } from "./createFolderTool.js";

export type ToolFn = (...args: any[]) => Promise<any> | any;

export interface ToolRegistration {
    fn: ToolFn;
    schema?: z.ZodTypeAny;
}

export const TOOL_REGISTRY: Record<string, ToolRegistration> = {
  read_file: {
    fn: readFileTool,
    schema: z.object({
      path: z.string(),
      encoding: z.string().optional()
    })
  },
  write_file: {
    fn: writeFileTool,
    schema: z.object({
      path: z.string(),
      content: z.string()
    })
  },
  apply_patch: {
    fn: applyPatchTool,
    schema: z.object({
      path: z.string(),
      patch: z.string()
    })
  },
  create_folder: {
    fn: createFolderTool,
    schema: z.object({
      path: z.string()
    })
  },
};
```

### 6.2. Tool Runner & Validation

- **File**: `src/core/ai/agent/toolRunner.ts`

`ToolCall` and validation:

```10:33:src/core/ai/agent/toolRunner.ts
export interface ToolCall {
    name: string;
    args?: any[];
    id?: string;
}

export function validateToolCall(call: ToolCall): string | null {
    if (!call || typeof call.name !== 'string') {
        return 'Invalid toolCall: "name" must be a string.';
    }
    if (call.args && !Array.isArray(call.args)) {
        return 'Invalid toolCall: "args" must be an array if present.';
    }
    const tool = TOOL_REGISTRY[call.name];
    if (!tool || typeof tool.fn !== "function") {
        return `Unknown tool requested by assistant: ${call.name}. Available tools: ${Object.keys(TOOL_REGISTRY).join(', ')}`;
    }
    const argsContainUndefined = (call.args ?? []).some(a => a === undefined);
    if (argsContainUndefined) {
        return 'Invalid toolCall args: contains undefined values.';
    }
    return null;
}
```

Execution:

```35:85:src/core/ai/agent/toolRunner.ts
export async function executeToolCall(call: ToolCall): Promise<ToolResult> {
    const tool = TOOL_REGISTRY[call.name];
    if (!tool) {
        return {
            success: false,
            error: `Unknown tool: ${call.name}`
        };
    }

    // 1️⃣ Validate args
    let args = call.args ?? [];
    // If provider sent object → convert to array (OpenAI sends objects)
    if (!Array.isArray(args) && typeof args === "object") {
        args = [args];
    }

    // 2️⃣ Schema validation (if defined)
    if (tool.schema) {
        try {
            args = [tool.schema.parse(args[0])]; // schema forces object-mode
        } catch (err: any) {
            return {
                success: false,
                error: `Invalid arguments for ${call.name}: ${err.message}`
            };
        }
    }

    // 3️⃣ Execute tool safely
    try {
        let result = await tool.fn.apply(null, args);

        // ensure JSON-safe output
        if (typeof result === "function") {
            throw new Error("Tool returned a function — invalid output");
        }
        if (typeof result === "bigint") {
            result = result.toString();
        }

        const MAX_SIZE = 200_000; // 200 KB text limit for model safety
        let outputString = JSON.stringify(result);
        if (outputString.length > MAX_SIZE) {
            outputString = outputString.slice(0, MAX_SIZE) + "...[TRUNCATED]";
        }

        return {
            success: true,
            output: JSON.parse(outputString)
        };
    } catch (err: any) {
        return {
            success: false,
            error: err?.message ?? String(err)
        };
    }
}
```

### 6.3. Concrete Tools

- **Read file**: `src/core/tools/readFileTool.ts`

```1:13:src/core/tools/readFileTool.ts
// src/core/tools/readFileTool.ts
import * as vscode from "vscode";

export async function readFileTool(path: string): Promise<string> {
  const fileUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, path);

  try {
    const data = await vscode.workspace.fs.readFile(fileUri);
    return Buffer.from(data).toString("utf8");
  } catch (err) {
    throw new Error(`read_file failed: File not found at ${path}`);
  }
}
```

- **Write file**: `src/core/tools/writeFileTool.ts`

```1:12:src/core/tools/writeFileTool.ts
// src/core/tools/writeFileTool.ts
import * as vscode from "vscode";

export async function writeFileTool(
  path: string,
  content: string
): Promise<string> {
  const fileUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, path);

  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, "utf8"));
  return `write_file: successfully wrote ${path}`;
}
```

- **Create folder**: `src/core/tools/createFolderTool.ts`

```1:12:src/core/tools/createFolderTool.ts
// src/core/tools/createFolderTool.ts
import * as vscode from "vscode";

export async function createFolderTool(path: string): Promise<string> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) throw new Error("No workspace open");

  const folderUri = vscode.Uri.joinPath(workspace.uri, path);
  await vscode.workspace.fs.createDirectory(folderUri);

  return `create_folder: created ${path}`;
}
```

- **Apply patch**: `src/core/tools/applyPatchTool.ts`

```1:29:src/core/tools/applyPatchTool.ts
// src/core/tools/applyPatchTool.ts
import * as vscode from "vscode";
import { applyPatch } from "diff";

export async function applyPatchTool(
  path: string,
  patch: string
): Promise<string> {
  const workspace = vscode.workspace.workspaceFolders?.[0];
  if (!workspace) { throw new Error("No workspace open"); }

  const fileUri = vscode.Uri.joinPath(workspace.uri, path);

  let original = "";
  try {
    const data = await vscode.workspace.fs.readFile(fileUri);
    original = Buffer.from(data).toString("utf8");
  } catch {
    throw new Error(`apply_patch failed: file does not exist → ${path}`);
  }

  const updated = applyPatch(original, patch);
  if (updated === false) {
    throw new Error(`apply_patch failed: patch rejected for ${path}`);
  }

  await vscode.workspace.fs.writeFile(fileUri, Buffer.from(updated, "utf8"));
  return `apply_patch: updated ${path}`;
}
```

**Mapping to your diagram**:

- **Function Executor / Tool Layer**: `executeToolCall` + `TOOL_REGISTRY` + the tool implementations.
- Tools operate **within the workspace** via the VS Code FS API — safe, scoped access.

---

## 7. File System & (Future) Project Index

### 7.1. Current State

- The extension interacts with files only through the **tool layer**:
  - `read_file` → read text from a file in the root workspace.
  - `write_file` → create/overwrite a file.
  - `apply_patch` → modify a file using a diff.
  - `create_folder` → create a directory.
- There is **no explicit project index or RAG store**; any “project awareness” comes from:
  - Chat history that includes file snippets.
  - File contents that the LLM explicitly requests via `read_file`.

### 7.2. Planned Extension (RAG / Project Map)

The conceptual layer:

- **Context Retriever**:
  - File tree / project map.
  - RAG retrieval for Odoo docs / code examples.

This is not yet implemented, but the natural place to integrate it is:

- In `assemblePrompt` (before returning the `messages` array):
  - Run heuristics + vector search to decide which files/snippets to include.
  - Append them as `system` or `assistant` context messages.

---

## 8. Validation Engine (Planned)

### 8.1. Current Validation

Right now, validation happens at the **development tooling** level:

- `npm run compile` → TypeScript typechecking (`tsc`).
- `npm run lint` → ESLint with TypeScript rules.
- `npm test` → runs the extension in a test VS Code instance via `vscode-test`.

There is **no runtime Odoo validation** yet:

- No `odoo-bin -i <module>` invocation.
- No Python linter (e.g. flake8/pylint) integrated into the extension’s tool layer.

### 8.2. Future Direction

To realize your conceptual **Validation Engine**:

- Add new tools, for example:
  - `validate_odoo_module` → runs `odoo-bin -i <module>` in a terminal.
  - `lint_python_module` → runs `flake8` or `pylint` on a module path.
- Register them in `TOOL_REGISTRY` with safe schemas and execution constraints.
- Extend the system prompt to instruct the LLM to:
  - Call these tools after code changes.
  - Report back summarized validation results and errors.

---

## 9. End‑to‑End Request / Response Examples

### 9.1. Simple Chat (No Tools)

1. **User** types:  
   `"Explain how to create an Odoo model."`
2. **Webview** sends `{ command: 'userMessage', text }` → `AssistaXProvider.handleUserMessage`.
3. **Agent** (`runAgent`):
   - Loads session history.
   - Builds `ChatMessage[]` with system prompts + history + this user message.
   - Converts to `ProviderMessage[]`.
   - Calls `callProvider`.
4. **Provider** returns a text answer (no tool calls).
5. `parseProviderToolCall` returns `null` → loop exits.
6. `extractProviderContent` gets plain text.
7. `persistAssistantReply` stores `[history + user + assistant]`.
8. Webview receives the answer and renders it as chat.

### 9.2. Tool‑Driven Edit (Read / Patch)

1. **User** types:  
   `"Add hostel_id field to student model in addons/school/models/student.py"`
2. LLM decides it needs the file:
   - Responds with **JSON only**:
     ```json
     {
       "toolCall": {
         "name": "read_file",
         "args": [{ "path": "addons/school/models/student.py" }]
       }
     }
     ```
3. `parseProviderToolCall` returns a `ToolCall`:
   - `{ name: "read_file", args: [{ path: "addons/school/models/student.py" }], id: "tool_xxx" }`
4. `executeToolCall` runs `readFileTool`, which:
   - Reads the file from the workspace.
   - Returns its contents as `output`.
5. A `tool` message with the file contents is appended and `callProvider` is invoked again.
6. LLM now has the file content in context; it computes a diff and responds with another tool call:
   - `name: "apply_patch"`, `args: [{ path, patch }]`.
7. `executeToolCall` applies the patch using `applyPatchTool`.
8. After the final model turn, the agent:
   - Extracts the final assistant text.
   - Persists the conversation.
   - Returns to the webview, which shows the result (and the user can inspect the modified file in the IDE).

---

## 10. Summary of Current Capabilities vs. Concept

| Layer (Concept)                    | Implemented in Code?                    | Notes                                                                 |
|-----------------------------------|-----------------------------------------|-----------------------------------------------------------------------|
| User Interface (IDE / Chat)       | ✅ `AssistaXProvider` + webview UI      | Rich chat UI with settings/history.                                   |
| Backend Orchestrator              | ✅ `runAgent` + `AssistaXProvider`      | Handles sessions, prompts, provider calls, tool loops.                |
| Context Manager / Memory          | ✅ Session store & history              | System prompts + last N turns; hook for further context.              |
| Context Retriever (RAG)           | ⚠️ Not yet                              | Scaffolding comment in `assemblePrompt` for future RAG integration.   |
| LLM Layer (Gemini / OpenAI, etc.) | ✅ Providers + config + retries         | Google + OpenAI‑compatible with robust error handling.                |
| Function Executor / Tools         | ✅ Tool registry & runner               | `read_file`, `write_file`, `apply_patch`, `create_folder`.           |
| File System & Project Index       | ✅ FS tools / ⚠️ No index/RAG           | FS access via VS Code; no indexing or embeddings yet.                 |
| Validation Engine                 | ⚠️ Only TS/lint/tests                   | No Odoo runtime validation or Python tooling in the agent yet.        |

This document is meant to be a living reference. As you add RAG, Odoo‑specific validation tools, or more complex orchestration, you can:

- Add new subsections under the relevant layers.
- Link to new files and functions using the same code‑reference style used here.

---

## 11. High‑Level Flowchart

```mermaid
flowchart TD
    UI[User Interface / Webview Chat<br/>VS Code Webview (chat.js, history.js, settings.js)] -->|userMessage| ORCH[Backend Orchestrator<br/>AssistaXProvider.handleUserMessage → runAgent]

    subgraph SESS[Context & Memory Layer]
        PROMPTS[System Prompts<br/>systemPrompts.ts]
        SESSMGR[Session Manager<br/>sessionManager.ts + agent/sessionStore.ts]
    end

    ORCH -->|load history, build prompt| SESS
    SESS -->|ChatMessage[]| PROMPTBUILDER[Prompt Builder<br/>assemblePrompt]
    PROMPTBUILDER -->|ProviderMessage[]| CALLPROV[Provider Caller<br/>callProvider]

    subgraph LLM[LLM Providers]
        GOOGLE[Google Gemini<br/>generateWithGoogle]
        OPENAI[OpenAI‑compatible<br/>generateWithOpenAICompat]
    end

    CALLPROV -->|formatted payload| LLM
    LLM -->|providerResponse| PARSER[Tool Call Parser<br/>parseProviderToolCall]

    PARSER -->|ToolCall or none| DECIDE{Tool call present?}
    DECIDE -->|no| FINAL[Final Assistant Response<br/>extractProviderContent → persistAssistantReply]
    DECIDE -->|yes| TOOLMSG[Assistant Tool Stub<br/>ProviderMessage with toolCall]
    TOOLMSG --> TOOLRUN[Tool Runner<br/>executeToolCall]

    subgraph TOOLS[Tool Layer / Function Executor]
        REG[Tool Registry<br/>TOOL_REGISTRY]
        READ[read_file<br/>readFileTool]
        WRITE[write_file<br/>writeFileTool]
        PATCH[apply_patch<br/>applyPatchTool]
        MKDIR[create_folder<br/>createFolderTool]
    end

    TOOLRUN -->|dispatch| REG
    REG -->|invoke| READ
    REG -->|invoke| WRITE
    REG -->|invoke| PATCH
    REG -->|invoke| MKDIR

    subgraph FS[File System (Workspace)]
        FILES[Workspace Files & Folders]
    end

    READ --> FILES
    WRITE --> FILES
    PATCH --> FILES
    MKDIR --> FILES

    TOOLRUN -->|ToolResult (JSON)| TOOLRESP[Tool Message<br/>ProviderMessage role=tool]
    TOOLRESP --> CALLPROV

    FINAL -->|assistant text + raw response| UI

    %% Future layers
    subgraph FUTURE[Planned Extensions]
        RAG[Context Retriever / RAG<br/>(project index, Odoo docs)]
        VALID[Validation Engine<br/>(odoo-bin, flake8/pylint)]
    end

    RAG -. inject context .-> PROMPTBUILDER
    VALID -. new tools (validate_odoo_module, etc.) .-> TOOLS
```

