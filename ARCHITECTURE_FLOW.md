# Assista X - Complete Message Flow Architecture

## Overview

This document explains the complete flow of a user message from input to response, including all function calls, data transformations, and architectural components.

---

## Table of Contents

1. [High-Level Flow Diagram](#high-level-flow-diagram)
2. [Detailed Step-by-Step Flow](#detailed-step-by-step-flow)
3. [Data Structures at Each Stage](#data-structures-at-each-stage)
4. [Function Call Chain](#function-call-chain)
5. [Tool Execution Flow](#tool-execution-flow)
6. [Provider Adapter Pattern](#provider-adapter-pattern)

---

## High-Level Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER INTERFACE (Webview)                     │
│  User types message → JavaScript sends 'userMessage' command    │
└───────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              AssistaXProvider.handleUserMessage()                │
│  • Receives message from webview                                 │
│  • Calls runAgent() with user text                               │
└───────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  agent.ts - runAgent()                           │
│  • Reads session history from storage                            │
│  • Gets active provider configuration                            │
│  • Creates provider adapter (factory pattern)                    │
│  • Converts session messages to InternalMessage format           │
│  • Gets system instruction                                        │
│  • Calls orchestrator.runAgent()                                 │
└───────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              orchestrator.ts - runAgent()                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Initialize:                                              │  │
│  │  • Add user message to internalMessages                   │  │
│  │  • Reset session if requested                             │  │
│  │                                                            │  │
│  │  WHILE LOOP (max 8 iterations)                            │  │
│  │                                                            │  │
│  │  1. Build Request: adapter.buildRequest()                 │  │
│  │     • Converts InternalMessage → Provider format         │  │
│  │     • Converts ToolDefinition → Provider tool schema     │  │
│  │                                                            │  │
│  │  2. Create Stream: adapter.createMessageStream()         │  │
│  │     • Sends request to provider API                       │  │
│  │     • Yields NormalizedEvent objects                      │  │
│  │                                                            │  │
│  │  3. Process Stream Events:                                │  │
│  │     • 'text' → Accumulate in finalResponse, add to       │  │
│  │       assistantContent                                     │  │
│  │     • 'reasoning' → Accumulate in finalResponse, add to  │  │
│  │       assistantContent (if supported)                      │  │
│  │     • 'tool_call' → Collect tool calls, add to            │  │
│  │       assistantContent                                     │  │
│  │     • 'usage' → Log token usage                           │  │
│  │     • 'error' → Throw error                                │  │
│  │     • 'end' → Stream complete                             │  │
│  │                                                            │  │
│  │  4. Add assistant content to internalMessages             │  │
│  │                                                            │  │
│  │  5. IF tool calls exist:                                  │  │
│  │     • Execute each tool: executeToolByName()              │  │
│  │     • Add tool results to internalMessages               │  │
│  │     • Continue loop (send results back to model)          │  │
│  │                                                            │  │
│  │  6. IF no tool calls:                                     │  │
│  │     • Return finalResponse                                │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Provider Adapter (Gemini/OpenAI)                    │
│  • buildRequest(): Converts internal format to provider format │
│  • createMessageStream(): Streams API responses                  │
│  • Converts provider events to NormalizedEvent                   │
└───────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Tool Execution Layer                          │
│  • findToolByName(): Locates tool definition                    │
│  • validateToolArgs(): Validates against JSON schema            │
│  • executeToolWithLock(): Executes with file locking            │
│  • Returns ToolResult { status, result/error }                  │
└───────────────────────────┬─────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│              Response Flow Back                                  │
│  • Orchestrator returns final response string                   │
│  • agent.ts converts InternalMessage → ChatMessage              │
│  • Session saved to storage                                      │
│  • AssistaXProvider sends response to webview                   │
│  • Webview displays markdown-rendered response                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Detailed Step-by-Step Flow

### Stage 1: User Input (Webview UI)

**Location:** `src/core/webview/ui/main.js` (or similar frontend code)

**Action:**
- User types message in chat input
- JavaScript event handler captures input
- Sends message via `webview.postMessage()`

**Data Structure:**
```javascript
{
  command: 'userMessage',
  text: "Read the file src/index.ts"
}
```

---

### Stage 2: Webview Message Handler

**Location:** `src/core/webview/AssistaXProvider.ts`

**Function:** `webviewView.webview.onDidReceiveMessage()`

**Action:**
- Receives message from webview
- Validates message command
- Calls `handleUserMessage(text)`

**Code:**
```typescript
if (message.command === 'userMessage') {
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    if (!text) return;
    await this.handleUserMessage(text);
}
```

---

### Stage 3: Handle User Message

**Location:** `src/core/webview/AssistaXProvider.ts`

**Function:** `handleUserMessage(text: string)`

**Action:**
- Calls `runAgent()` with user text
- Measures execution time
- Sends response to webview via `sendAssistantMessage()`
- Handles errors

**Data Flow:**
```
Input:  "Read the file src/index.ts"
  ↓
runAgent({ contents: "Read the file src/index.ts" }, context)
  ↓
Output: "Here is the content of src/index.ts:\n\n..."
```

**Code:**
```typescript
private async handleUserMessage(text: string) {
    try {
        const startTime = Date.now();
        const response = await runAgent({ contents: text }, this._context);
        const elapsed = Date.now() - startTime;
        console.log(`[AssistaX] Total completion time: ${elapsed}ms`);
        const reply = typeof response === 'string' ? response : JSON.stringify(response, null, 2);
        await this.sendAssistantMessage(reply);
        void this.syncActiveSession();
    } catch (error: any) {
        const message = error?.message || String(error) || 'Unexpected error';
        await this.sendAssistantMessage(message, 'error');
    }
}
```

---

### Stage 4: Agent Entry Point

**Location:** `src/core/ai/agent/agent.ts`

**Function:** `runAgent(params, context)`

**Actions:**
1. **Read Session History:**
   ```typescript
   let sessionHistory = await readSessionMessages(context);
   ```
   - Reads `ChatMessage[]` from VS Code storage
   - Format: `{ role: 'user'|'assistant', content: string, timestamp: number }[]`

2. **Get Provider Configuration:**
   ```typescript
   const { provider: providerName, config: providerConfig } = 
       await getActiveProviderConfig(context);
   ```
   - Reads from VS Code settings
   - Returns: `{ provider: 'google'|'openai'|..., config: { apiKey, model, ... } }`

3. **Get System Instruction:**
   ```typescript
   const customInstructions = configSection.get<string>('systemPrompt.customInstructions', '');
   const systemInstruction = getSystemInstruction(customInstructions);
   ```
   - Combines default system prompt with user custom instructions

4. **Create Provider Adapter:**
   ```typescript
   const adapter = createProvider(providerName, providerConfig, context);
   ```
   - Factory pattern creates appropriate adapter:
     - `'google'` → `GeminiAdapter`
     - `'openai'|'openrouter'|'anthropic'|'custom'` → `OpenAIAdapter`

5. **Convert Session to Internal Format:**
   ```typescript
   const internalHistory = convertSessionToInternal(sessionHistory);
   ```
   - Converts `ChatMessage[]` → `InternalMessage[]`
   - Internal format uses content blocks (Anthropic-like)

6. **Call Orchestrator:**
   ```typescript
   const response = await runAgentOrchestrator(
       { contents: userContent, config: { ...params.config, systemInstruction }, reset: cfg.resetSession },
       context,
       adapter,
       internalHistory
   );
   ```
   - Orchestrator adds user message to internalMessages
   - Orchestrator manages the conversation loop and tool execution
   - Returns final response string

7. **Save Session:**
   ```typescript
   const updatedInternalHistory: InternalMessage[] = [
       ...internalHistory,
       { role: 'user', content: [{ type: 'text', text: userContent }], timestamp: Date.now() },
       { role: 'assistant', content: [{ type: 'text', text: response }], timestamp: Date.now() }
   ];
   const updatedSessionHistory = convertInternalToSession(updatedInternalHistory);
   await writeSessionMessages(context, updatedSessionHistory);
   ```
   - Note: The orchestrator already manages internalMessages during execution
   - This step reconstructs the full history for persistence

**Data Transformation:**
```
ChatMessage[] (Session Format)
  ↓ convertSessionToInternal()
InternalMessage[] (Internal Format)
  ↓ runAgentOrchestrator()
string (Final Response)
  ↓ convertInternalToSession()
ChatMessage[] (Session Format)
  ↓ writeSessionMessages()
Persisted to VS Code Storage
```

---

### Stage 5: Orchestrator Core Loop

**Location:** `src/core/agent/orchestrator.ts`

**Function:** `runAgent(params, context, adapter, sessionHistory)`

**Key Components:**

#### 5.1 Initialize Loop
```typescript
const systemInstruction = params.config?.systemInstruction || '';
let internalMessages: InternalMessage[] = [...sessionHistory];

// Reset session if requested
if (params.reset) {
    internalMessages = [];
}

// Add user message
internalMessages.push({
    role: 'user',
    content: [{ type: 'text', text: params.contents }],
});

const tools = ALL_TOOLS; // All available tools from registry
let iterations = 0;
let finalResponse = '';
```

#### 5.2 Main Loop (while true)
```typescript
while (true) {
    if (++iterations > MAX_TOOL_ITERATIONS) {
        throw new Error(`Too many tool iterations (${MAX_TOOL_ITERATIONS}). Possible infinite loop.`);
    }
    
    // Build request
    const providerRequest = await adapter.buildRequest(
        systemInstruction,
        internalMessages,
        tools,
        params.config
    );
    
    // Create message stream
    const stream = adapter.createMessageStream(providerRequest, params.config);
    
    // Process stream events...
}
```

#### 5.3 Build Request
**Function:** `adapter.buildRequest(systemInstruction, messages, tools, options)`

**For Gemini Adapter:**
1. Converts `InternalMessage[]` → Gemini `Content[]` format
2. Converts `ToolDefinition[]` → Gemini `functionDeclarations`
3. Returns:
   ```typescript
   {
       model: "gemini-pro",
       contents: Content[], // Gemini format
       config: {
           systemInstruction: "...",
           tools: [{ functionDeclarations: [...] }]
       }
   }
   ```

**For OpenAI Adapter:**
1. Converts `InternalMessage[]` → OpenAI chat messages
2. Uses `ToolDefinition[]` directly (OpenAI format is canonical)
3. Returns:
   ```typescript
   {
       url: "https://api.openai.com/v1/chat/completions",
       headers: { "Authorization": "Bearer ...", ... },
       body: {
           model: "gpt-4",
           messages: [...],
           tools: [...],
           stream: true
       }
   }
   ```

#### 5.4 Create Message Stream
**Function:** `adapter.createMessageStream(request, options)`

**Returns:** `AsyncIterable<NormalizedEvent>`

**Event Types:**
- `{ type: 'text', text: string }` - Text chunk from model
- `{ type: 'reasoning', text: string }` - Reasoning/thinking text (if supported by provider)
- `{ type: 'tool_call', id: string, name: string, args: string }` - Tool call request
- `{ type: 'usage', inputTokens: number, outputTokens: number }` - Token usage
- `{ type: 'error', error: string, message: string }` - Error occurred
- `{ type: 'end' }` - Stream complete

#### 5.5 Process Stream Events
```typescript
const toolCalls: Array<{ id: string; name: string; args: string }> = [];
let assistantContent: InternalMessage['content'] = [];

for await (const event of stream) {
    switch (event.type) {
        case 'text':
            finalResponse += event.text;
            assistantContent.push({ type: 'text', text: event.text });
            break;
            
        case 'reasoning':
            // Include reasoning in response
            finalResponse += event.text;
            assistantContent.push({ type: 'reasoning', text: event.text });
            break;
            
        case 'tool_call':
            toolCalls.push({
                id: event.id,
                name: event.name,
                args: event.args, // JSON string
            });
            assistantContent.push({
                type: 'tool_use',
                id: event.id,
                name: event.name,
                input: safeParseJson(event.args),
            });
            break;
            
        case 'usage':
            console.log(`[Assista X] Usage: ${event.inputTokens} input, ${event.outputTokens} output tokens`);
            break;
            
        case 'error':
            throw new Error(event.error);
            
        case 'end':
            break;
    }
}

// Add assistant content to messages after stream processing
if (assistantContent.length > 0) {
    internalMessages.push({
        role: 'assistant',
        content: assistantContent,
    });
}
```

#### 5.6 Handle Tool Calls
```typescript
if (toolCalls.length > 0) {
    // Execute all tool calls
    for (const toolCall of toolCalls) {
        const args = safeParseJson(toolCall.args);
        const tool = findToolByName(toolCall.name);
        
        if (!tool) {
            // Add error as tool result
            internalMessages.push({
                role: 'tool',
                content: [{
                    type: 'tool_result',
                    tool_use_id: toolCall.id,
                    content: JSON.stringify({
                        status: 'error',
                        error: { message: `Unknown tool: ${toolCall.name}`, code: 'UNKNOWN_TOOL' }
                    }),
                }],
            });
            continue;
        }
        
        // Execute tool
        const toolResult = await executeToolByName(toolCall.name, args);
        
        // Add tool result to conversation
        const resultContent = toolResult.status === 'success'
            ? JSON.stringify(toolResult.result)
            : JSON.stringify(toolResult.error || { message: 'Unknown error' });
        
        internalMessages.push({
            role: 'tool',
            content: [{
                type: 'tool_result',
                tool_use_id: toolCall.id,
                content: resultContent,
            }],
        });
    }
    
    // Reset final response for next iteration
    finalResponse = '';
    // Continue loop to send tool results back to model
    continue;
}
```

#### 5.7 Return Final Response
```typescript
// No tool calls - we have final response
return finalResponse.trim();
```

---

### Stage 6: Tool Execution

**Location:** `src/core/tools/executor.ts`

**Function:** `executeToolByName(name, args)`

**Flow:**
1. **Find Tool:**
   ```typescript
   const tool = findToolByName(name);
   // Searches ALL_TOOLS array for matching name
   ```

2. **Validate Arguments:**
   ```typescript
   const validation = validateToolArgs(tool, args);
   // Uses ajv to validate args against tool.jsonSchema
   ```

3. **Execute with Locking:**
   ```typescript
   return await executeToolWithLock(tool, args);
   // For write operations, acquires file lock
   // Executes tool.execute(args)
   ```

**Tool Execution Example (read_file):**
```typescript
// Tool Definition
{
    name: 'read_file',
    description: 'Read one or more files...',
    jsonSchema: {
        type: 'object',
        properties: {
            files: { type: 'array', items: { ... } }
        },
        required: ['files']
    },
    execute: async (args) => {
        // Validate workspace paths
        // Read files from filesystem
        // Return { status: 'success', result: [...] }
    }
}
```

**Tool Result Format:**
```typescript
{
    status: 'success' | 'error',
    result?: any,           // On success
    error?: {               // On error
        message: string,
        code?: string
    }
}
```

---

### Stage 7: Provider Adapter Details

#### Gemini Adapter

**Location:** `src/core/providers/gemini-adapter.ts`

**buildRequest():**
1. Dynamically imports `@google/genai`
2. Converts `InternalMessage[]` → Gemini `Content[]` via `convertInternalMessagesToGemini()`
   - Builds `toolIdToName` mapping to track tool_use_id → tool name relationships
   - This mapping is used when converting tool_result blocks back to Gemini format
3. Converts tools to `functionDeclarations` format
4. Returns request payload (includes `toolIdToName` mapping for response processing)

**createMessageStream():**
1. Calls `this.client.models.generateContentStream(requestPayload)`
2. Iterates streaming chunks
3. Yields `NormalizedEvent` objects:
   - `functionCall` parts → `{ type: 'tool_call', ... }`
   - `text` parts → `{ type: 'text', ... }`
   - Usage metadata → `{ type: 'usage', ... }` (yielded at end of stream)
4. Handles retries (up to 5 attempts with exponential backoff)

#### OpenAI Adapter

**Location:** `src/core/providers/openai-adapter.ts`

**buildRequest():**
1. Converts `InternalMessage[]` → OpenAI chat messages via `convertInternalToOpenAI()`
2. Uses tools directly (OpenAI format is canonical)
3. Builds fetch request with headers

**createMessageStream():**
1. Sends POST request to OpenAI API endpoint
2. Reads Server-Sent Events (SSE) stream
3. Parses JSON chunks from `data: {...}` lines
4. Yields `NormalizedEvent` objects:
   - `delta.tool_calls` → `{ type: 'tool_call', ... }` (accumulated across chunks)
   - `delta.content` → `{ type: 'text', ... }`
   - `usage` → `{ type: 'usage', ... }`
5. Handles retries (up to 10 attempts with exponential backoff) and errors
6. Finalizes tool calls at end of stream

---

## Data Structures at Each Stage

### Stage 1: Webview Message
```typescript
{
    command: 'userMessage',
    text: string
}
```

### Stage 2: Session History (ChatMessage)
```typescript
ChatMessage[] = [
    {
        role: 'user' | 'assistant',
        content: string,
        timestamp: number
    }
]
```

### Stage 3: Internal Message Format
```typescript
InternalMessage[] = [
    {
        role: 'user' | 'assistant' | 'tool',
        content: InternalBlock[] | string,
        timestamp?: number
    }
]

InternalBlock = 
    | { type: 'text', text: string }
    | { type: 'reasoning', text: string }
    | { type: 'tool_use', id?: string, name: string, input: any }
    | { type: 'tool_result', tool_use_id: string, content: any }
    | { type: 'grounding', sources: Array<{ title: string; url?: string }> }
```

### Stage 4: Provider Request (Gemini)
```typescript
{
    model: string,
    contents: Content[],
    config: {
        systemInstruction?: string,
        tools?: [{ functionDeclarations: [...] }]
    }
}

Content = {
    role: 'user' | 'model' | 'tool',
    parts: Part[]
}

Part = 
    | { text: string }
    | { functionCall: { name: string, args: Record<string, unknown> } }
    | { functionResponse: { name: string, response: {...} } }
```

### Stage 5: Provider Request (OpenAI)
```typescript
{
    url: string,
    headers: Record<string, string>,
    body: {
        model: string,
        messages: Array<{
            role: 'system' | 'user' | 'assistant' | 'tool',
            content: string | null,
            tool_calls?: Array<{...}>,
            tool_call_id?: string
        }>,
        tools?: Array<{
            type: 'function',
            function: {
                name: string,
                description: string,
                parameters: JSONSchema
            }
        }>,
        stream: true
    }
}
```

### Stage 6: Normalized Event
```typescript
NormalizedEvent =
    | { type: 'text', text: string }
    | { type: 'reasoning', text: string }  // Reasoning/thinking blocks (provider-dependent)
    | { type: 'tool_call', id: string, name: string, args: string }
    | { type: 'usage', inputTokens: number, outputTokens: number, cost?: number }
    | { type: 'error', error: string, message: string }
    | { type: 'end' }
```

### Stage 7: Tool Definition
```typescript
ToolDefinition = {
    name: string,
    description: string,
    jsonSchema: {
        type: 'object',
        properties: Record<string, any>,
        required?: string[],
        additionalProperties?: boolean
    },
    execute: (args: any) => Promise<ToolResult>
}

ToolResult = {
    status: 'success' | 'error',
    result?: any,
    error?: {
        message: string,
        code?: string
    }
}
```

---

## Function Call Chain

```
1. User types message
   ↓
2. Webview JavaScript
   webview.postMessage({ command: 'userMessage', text: "..." })
   ↓
3. AssistaXProvider.onDidReceiveMessage()
   ↓
4. AssistaXProvider.handleUserMessage(text)
   ↓
5. agent.runAgent({ contents: text }, context)
   ├─ readSessionMessages(context)
   ├─ getActiveProviderConfig(context)
   ├─ getSystemInstruction(customInstructions)
   ├─ createProvider(providerName, config, context)
   │   └─ new GeminiAdapter() or new OpenAIAdapter()
   ├─ convertSessionToInternal(sessionHistory)
   └─ orchestrator.runAgent(params, context, adapter, internalHistory)
       │
       ├─ [LOOP START] iterations < MAX_TOOL_ITERATIONS
       │   │
       │   ├─ adapter.buildRequest(systemInstruction, internalMessages, tools, config)
       │   │   ├─ convertInternalMessagesToGemini() [Gemini]
       │   │   └─ convertInternalToOpenAI() [OpenAI]
       │   │
       │   ├─ adapter.createMessageStream(providerRequest, config)
       │   │   ├─ client.models.generateContentStream() [Gemini]
       │   │   └─ fetch(url, { method: 'POST', body: ... }) [OpenAI]
       │   │
       │   ├─ [FOR EACH EVENT IN STREAM]
       │   │   ├─ event.type === 'text' → accumulate finalResponse, add to assistantContent
       │   │   ├─ event.type === 'reasoning' → accumulate finalResponse, add to assistantContent
       │   │   ├─ event.type === 'tool_call' → collect toolCalls, add to assistantContent
       │   │   ├─ event.type === 'usage' → log usage
       │   │   ├─ event.type === 'error' → throw error
       │   │   └─ event.type === 'end' → break
       │   │
       │   ├─ Add assistant content to internalMessages (if any)
       │   │
       │   ├─ IF toolCalls.length > 0:
       │   │   ├─ [FOR EACH toolCall]
       │   │   │   ├─ findToolByName(toolCall.name)
       │   │   │   ├─ safeParseJson(toolCall.args)
       │   │   │   ├─ executeToolByName(name, args)
       │   │   │   │   ├─ validateToolArgs(tool, args)
       │   │   │   │   └─ executeToolWithLock(tool, args)
       │   │   │   │       └─ tool.execute(args)
       │   │   │   └─ Add tool_result to internalMessages
       │   │   └─ continue [LOOP BACK]
       │   │
       │   └─ IF no tool calls:
       │       └─ return finalResponse.trim()
       │
       └─ [LOOP END]
   ↓
6. convertInternalToSession(updatedInternalHistory)
   ↓
7. writeSessionMessages(context, updatedSessionHistory)
   ↓
8. AssistaXProvider.sendAssistantMessage(reply)
   ├─ renderMarkdownToHtml(reply)
   └─ webview.postMessage({ type: 'assistantMessage', text: reply, html: ... })
   ↓
9. Webview displays response
```

---

## Tool Execution Flow

```
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator receives tool_call event                       │
│  { type: 'tool_call', id: 'read_file-0', name: 'read_file', │
│    args: '{"files":[{"path":"src/index.ts"}]}' }            │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  executeToolByName('read_file', args)                       │
│  • findToolByName('read_file') → ToolDefinition            │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  validateToolArgs(tool, args)                               │
│  • Compiles JSON schema with ajv                            │
│  • Validates args against tool.jsonSchema                   │
│  • Returns { valid: boolean, errors?: string[] }            │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  executeToolWithLock(tool, args)                            │
│  • IF write operation: acquireFileLock(path)                │
│  • Execute: tool.execute(args)                              │
│  • IF write operation: releaseFileLock(path)                 │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Tool.execute() - Example: readFileTool                      │
│  • validateWorkspacePath(file.path)                         │
│  • Read file from filesystem                                │
│  • Apply line ranges if specified                           │
│  • Return { status: 'success', result: [...] }              │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  ToolResult returned to orchestrator                        │
│  { status: 'success',                                       │
│    result: [{ path: 'src/index.ts', content: '...' }] }    │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator adds tool_result to internalMessages          │
│  { role: 'tool',                                            │
│    content: [{                                              │
│      type: 'tool_result',                                   │
│      tool_use_id: 'read_file-0',                            │
│      content: '{"status":"success","result":[...]}'         │
│    }]                                                       │
│  }                                                          │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  Loop continues: Send updated internalMessages back to model│
│  Model receives tool results and generates final response   │
└─────────────────────────────────────────────────────────────┘
```

---

## Provider Adapter Pattern

### Architecture Benefits

1. **Provider Agnostic:** Core logic doesn't depend on specific provider APIs
2. **Easy to Extend:** Add new providers by implementing `ProviderAdapter` interface
3. **Consistent Interface:** All providers yield `NormalizedEvent` objects
4. **Type Safety:** TypeScript ensures correct data transformations

### Adapter Interface

```typescript
interface ProviderAdapter {
    name: string;
    config: ProviderConfig;
    context: vscode.ExtensionContext;
    
    // Convert internal format → provider request
    buildRequest(
        systemInstruction: string,
        messages: InternalMessage[],
        tools?: ToolDefinition[],
        options?: any
    ): Promise<any>;
    
    // Stream provider responses → normalized events
    createMessageStream(
        request: any,
        options?: any
    ): AsyncIterable<NormalizedEvent>;
    
    // Convert canonical tools → provider tool schema
    convertToolsToProviderSchema(
        tools: ToolDefinition[]
    ): Promise<any>;
}
```

### Supported Providers

- **Google Gemini:** `GeminiAdapter`
- **OpenAI:** `OpenAIAdapter`
- **OpenRouter:** `OpenAIAdapter` (uses OpenAI-compatible API)
- **Anthropic (via OpenRouter):** `OpenAIAdapter`
- **Custom:** `OpenAIAdapter` (configurable endpoint)

---

## Key Design Decisions

### 1. Internal Message Format (Anthropic-like)

**Why:** Provides flexibility for multi-modal content, tool calls, and reasoning blocks.

**Benefits:**
- Supports complex content structures
- Easy to convert to/from provider formats
- Future-proof for new content types

### 2. OpenAI JSON Schema as Canonical Tool Format

**Why:** OpenAI's function calling format is widely adopted and well-documented.

**Benefits:**
- Standard format across providers
- Rich validation capabilities
- Easy to understand and maintain

### 3. Normalized Events

**Why:** Provides consistent interface regardless of provider streaming format.

**Benefits:**
- Orchestrator doesn't need provider-specific logic
- Easy to add new event types
- Consistent error handling

### 4. Tool Registry Pattern

**Why:** Centralized tool management and discovery.

**Benefits:**
- Single source of truth for available tools
- Easy to add/remove tools
- Type-safe tool execution

### 5. File Locking

**Why:** Prevents race conditions when multiple tool calls modify the same file.

**Benefits:**
- Data integrity
- Prevents file corruption
- Handles concurrent operations safely

---

## Error Handling

### Error Flow

```
1. Provider API Error
   ↓
2. Adapter yields { type: 'error', error: string, message: string }
   ↓
3. Orchestrator throws Error(event.error)
   ↓
4. agent.runAgent() catches error
   ↓
5. AssistaXProvider.handleUserMessage() catches error
   ↓
6. sendAssistantMessage(message, 'error')
   ↓
7. Webview displays error message
```

### Retry Logic

- **Provider Adapters:** 
  - OpenAI Adapter: Retry up to 10 times with exponential backoff
  - Gemini Adapter: Retry up to 5 times with exponential backoff
- **Tool Execution:** No retries (failures are returned as tool results)
- **Orchestrator:** MAX_TOOL_ITERATIONS (8) guard prevents infinite loops

---

## Performance Considerations

### Streaming

- Responses stream in real-time (not buffered)
- Tool calls can be executed as soon as they're received
- Reduces perceived latency

### Session Management

- Session history loaded once at start
- Updated and saved after each complete interaction
- Efficient storage using VS Code's Memento API

### Tool Execution

- Tools execute in sequence (not parallel)
- File locking prevents concurrent writes
- Validation happens before execution (fail fast)

---

## Future Enhancements

1. **Parallel Tool Execution:** Execute independent tools concurrently
2. **Streaming Tool Results:** Stream tool output back to model in real-time
3. **Tool Result Caching:** Cache file reads for better performance
4. **Multi-Modal Support:** Handle images, audio, and other content types
5. **Custom Tool Registration:** Allow extensions to register custom tools
6. **Tool Result Streaming:** Stream large tool results incrementally

---

## Conclusion

This architecture provides a robust, provider-agnostic foundation for AI agent interactions with tool calling capabilities. The separation of concerns between webview, agent, orchestrator, adapters, and tools ensures maintainability and extensibility.

The flow is designed to be:
- **Efficient:** Streaming responses, minimal data copying
- **Reliable:** Error handling, retries, validation
- **Extensible:** Easy to add providers, tools, and features
- **Type-Safe:** Full TypeScript coverage
- **Testable:** Clear separation of concerns

