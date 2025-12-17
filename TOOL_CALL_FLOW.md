# Complete Tool Call Flow: From AI Tool Call to UI Display

This document provides a detailed overview of how tool calls flow from the AI model through execution, session persistence, and UI display.

## Overview Diagram

```
AI Model → Tool Call Event → Orchestrator → Tool Execution → Progress Messages → 
Webview Handler → UI Display → Session Conversion → Session Persistence → 
Session Hydration → UI Rendering
```

---

## Phase 1: AI Model Generates Tool Call

### Location: `src/core/agent/orchestrator.ts`

**Step 1.1: Stream Processing**
- The orchestrator processes the AI model's response stream
- When a `tool_call` event is detected in the stream:

```typescript
case 'tool_call':
  if (isStreaming) {
    onProgress?.(JSON.stringify({ type: 'stream_end' }));
    isStreaming = false;
  }
  toolCalls.push({
    id: event.id,        // Unique tool call ID (e.g., "call_a974592f17054523a383564e")
    name: event.name,    // Tool name (e.g., "write_to_file")
    args: event.args     // JSON string of arguments
  });
  break;
```

**Step 1.2: Assistant Message Creation**
- After stream processing, tool calls are added to the assistant message:

```typescript
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

---

## Phase 2: Tool Execution

### Location: `src/core/agent/orchestrator.ts` (lines 147-212)

**Step 2.1: Tool Execution Loop**
- When tool calls are detected, the orchestrator enters a tool execution loop:

```typescript
if (toolCalls.length > 0) {
  // Execute all tool calls
  for (const toolCall of toolCalls) {
    const args = safeParseJson(toolCall.args);
    
    // Find and execute tool
    const tool = findToolByName(toolCall.name);
    if (!tool) {
      // Handle unknown tool error
      continue;
    }
```

**Step 2.2: Extract Filename for UI**
- Extract filename from tool arguments (for display purposes):

```typescript
// Extract filename for UI display (for write_to_file and apply_diff tools)
const filename = args?.path || toolCall.name;
```

**Step 2.3: Send Tool Execution Start Event**
- Send progress message to notify UI that tool execution is starting:

```typescript
// Send tool execution start message
onProgress?.(JSON.stringify({
  type: 'tool_execution_start',
  toolName: toolCall.name,
  toolId: toolCall.id,
  filename: filename,
  status: 'loading'
}));
```

**Step 2.4: Execute Tool**
- Execute the actual tool (e.g., `write_to_file`):

```typescript
// Execute tool
const toolResult = await executeToolByName(toolCall.name, args);
```

**Example Tool Execution** (`src/core/tools/writeFile.ts`):
```typescript
export const writeFileTool: ToolDefinition = {
  name: 'write_to_file',
  execute: async (args: WriteFileArgs): Promise<ToolResult> => {
    // Validate arguments
    // Create directories if needed
    // Write file to disk
    await fs.writeFile(fullPath, args.content, 'utf-8');
    
    return {
      status: 'success',
      result: {
        path: args.path,
        line_count: actualLines,
      },
    };
  },
};
```

**Step 2.5: Send Tool Execution Complete Event**
- Send progress message to notify UI that tool execution is complete:

```typescript
// Send tool execution complete message
const execStatus = toolResult.status === 'success' ? 'completed' : 'error';
onProgress?.(JSON.stringify({
  type: 'tool_execution_complete',
  toolName: toolCall.name,
  toolId: toolCall.id,
  filename: filename,
  status: execStatus,
  result: toolResult.status === 'success' ? toolResult.result : toolResult.error
}));
```

**Step 2.6: Add Tool Result to Conversation**
- Add tool result as a separate message in the conversation:

```typescript
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
```

**Step 2.7: Continue Loop**
- The orchestrator continues the loop to send tool results back to the model:

```typescript
// Reset for next iteration
finalResponse = '';

// Continue loop to send tool results back to model
continue;
```

---

## Phase 3: Progress Message Handling

### Location: `src/core/webview/AssistaCoderProvider.ts` (lines 348-384)

**Step 3.1: Receive Progress Message**
- The `onProgress` callback receives JSON stringified progress messages:

```typescript
private async handleProgressMessage(msg: string) {
  if (!this._view) {
    return;
  }

  // Check if this is a structured JSON streaming message
  try {
    const parsed = JSON.parse(msg);
```

**Step 3.2: Parse and Route Tool Execution Messages**
- Tool execution messages are parsed and routed to the webview:

```typescript
// Handle tool execution messages
if (parsed.type === 'tool_execution_start' || parsed.type === 'tool_execution_complete') {
  this._view.webview.postMessage({
    type: 'toolExecution',
    payload: parsed
  });
  return;
}
```

**Message Structure:**
- `tool_execution_start`:
  ```json
  {
    "type": "tool_execution_start",
    "toolName": "write_to_file",
    "toolId": "call_a974592f17054523a383564e",
    "filename": "custom_addons/hostel_management/models/hostel_room.py",
    "status": "loading"
  }
  ```

- `tool_execution_complete`:
  ```json
  {
    "type": "tool_execution_complete",
    "toolName": "write_to_file",
    "toolId": "call_a974592f17054523a383564e",
    "filename": "custom_addons/hostel_management/models/hostel_room.py",
    "status": "completed",
    "result": { "path": "...", "line_count": 123 }
  }
  ```

---

## Phase 4: Webview UI Handling

### Location: `src/core/webview/ui/main.js` (lines 72-95)

**Step 4.1: Receive Tool Execution Message**
- The webview receives the tool execution message:

```typescript
case 'toolExecution': {
  const payload = message.payload || {};
```

**Step 4.2: Handle Tool Execution Start**
- When tool execution starts, show loading UI:

```typescript
if (payload.type === 'tool_execution_start') {
  // Show tool execution UI with loading state
  if (typeof chat.showToolExecution === 'function') {
    chat.showToolExecution({
      toolId: payload.toolId,
      toolName: payload.toolName,
      filename: payload.filename,
      status: 'loading'
    });
  }
}
```

**Step 4.3: Handle Tool Execution Complete**
- When tool execution completes, update UI:

```typescript
else if (payload.type === 'tool_execution_complete') {
  // Update tool execution UI to completed state
  if (typeof chat.updateToolExecution === 'function') {
    chat.updateToolExecution({
      toolId: payload.toolId,
      status: payload.status,
      result: payload.result
    });
  }
}
```

---

## Phase 5: UI Rendering

### Location: `src/core/webview/chat/chat.js` (lines 897-967)

**Step 5.1: Show Tool Execution (Initial)**
- Create and display the tool execution UI element:

```typescript
function showToolExecution({ toolId, toolName, filename, status }) {
  if (!messagesEl) return;
  showChatArea();

  // Create message row
  const row = document.createElement("div");
  row.className = "message-row";
  row.setAttribute('data-tool-id', toolId);

  // Create tool execution wrapper (similar to code-block-wrapper)
  const wrapper = document.createElement('div');
  wrapper.className = 'tool-execution-wrapper';

  // Create header (similar to code-block-header)
  const header = document.createElement('div');
  header.className = 'tool-execution-header';

  const filenameSpan = document.createElement('span');
  filenameSpan.className = 'tool-execution-filename';
  filenameSpan.textContent = filename || toolName;

  const statusBtn = document.createElement('button');
  statusBtn.className = 'tool-execution-status';
  statusBtn.title = status === 'loading' ? 'Writing file...' : 'Completed';

  if (status === 'loading') {
    // Show loading spinner
    statusBtn.innerHTML = `<svg class="tool-loading-spinner" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"/><path d="M12 2 A10 10 0 0 1 22 12" stroke-linecap="round"/></svg>`;
    statusBtn.classList.add('loading');
  } else {
    // Show completed checkmark
    statusBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    statusBtn.classList.add('completed');
  }

  header.appendChild(filenameSpan);
  header.appendChild(statusBtn);

  wrapper.appendChild(header);
  row.appendChild(wrapper);
  messagesEl.appendChild(row);
  messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });

  // Store reference for updates
  toolExecutionElements.set(toolId, { row, wrapper, header, statusBtn });
}
```

**Generated HTML Structure:**
```html
<div class="message-row" data-tool-id="call_a974592f17054523a383564e">
  <div class="tool-execution-wrapper">
    <div class="tool-execution-header">
      <span class="tool-execution-filename">custom_addons/hostel_management/models/hostel_room.py</span>
      <button class="tool-execution-status loading" title="Writing file...">
        <svg class="tool-loading-spinner">...</svg>
      </button>
    </div>
  </div>
</div>
```

**Step 5.2: Update Tool Execution Status**
- Update the UI when tool execution completes:

```typescript
function updateToolExecution({ toolId, status, result }) {
  const toolExec = toolExecutionElements.get(toolId);
  if (!toolExec) return;

  const { statusBtn } = toolExec;

  // Update status button
  if (status === 'completed') {
    statusBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>`;
    statusBtn.classList.remove('loading');
    statusBtn.classList.add('completed');
    statusBtn.title = 'Completed';
  } else if (status === 'error') {
    statusBtn.innerHTML = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    statusBtn.classList.remove('loading');
    statusBtn.classList.add('error');
    statusBtn.title = 'Error';
  }

  // Scroll to show updated element
  if (messagesEl) {
    messagesEl.scrollTo({ top: messagesEl.scrollHeight, behavior: 'smooth' });
  }
}
```

**Final HTML Structure (Completed):**
```html
<div class="message-row" data-tool-id="call_a974592f17054523a383564e">
  <div class="tool-execution-wrapper">
    <div class="tool-execution-header">
      <span class="tool-execution-filename">custom_addons/hostel_management/models/hostel_room.py</span>
      <button class="tool-execution-status completed" title="Completed">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </button>
    </div>
  </div>
</div>
```

---

## Phase 6: Session Persistence

### Location: `src/core/runtime/agent.ts` (lines 80-152)

**Step 6.1: Convert Internal Messages to Session Format**
- After tool execution completes and the final response is received, convert internal messages to session format:

```typescript
export function convertInternalToSession(
  internalMessages: InternalMessage[]
): ChatMessage[] {
  const sessionMessages: ChatMessage[] = [];

  for (let i = 0; i < internalMessages.length; i++) {
    const msg = internalMessages[i];

    if (msg.role === "user" || msg.role === "assistant") {
      let content = "";
      const toolExecutions: ToolExecution[] = [];

      if (typeof msg.content === "string") {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Extract text
        const textBlocks = msg.content.filter((block) => block.type === "text");
        content = textBlocks.map((block) => (block as any).text).join("\n");

        // Extract tool uses
        const toolUses = msg.content.filter(
          (block) => block.type === "tool_use"
        );
        for (const toolUse of toolUses) {
          const use = toolUse as any;
          let result: any = null;
          let status: "completed" | "error" = "completed";

          // Search in subsequent messages for the result
          for (let j = i + 1; j < internalMessages.length; j++) {
            const nextMsg = internalMessages[j];
            if (nextMsg.role === "tool") {
              const toolResultBlock = (nextMsg.content as any[]).find(
                (b: any) => b.type === "tool_result" && b.tool_use_id === use.id
              );
              if (toolResultBlock) {
                try {
                  const parsedContent = JSON.parse(toolResultBlock.content);
                  result = parsedContent;
                  if (parsedContent.status === "error" || parsedContent.error) {
                    status = "error";
                  }
                } catch {
                  result = toolResultBlock.content;
                }
                break;
              }
            }
          }

          toolExecutions.push({
            toolId: use.id,
            toolName: use.name,
            filename: use.input?.path || use.name,
            status,
            timestamp: msg.timestamp || Date.now(),
            args: use.input,
            result,
          });
        }
      }

      sessionMessages.push({
        role: toolExecutions.length > 0 ? "tool" : (msg.role as ChatRole),
        content,
        timestamp: msg.timestamp,
        toolExecutions: toolExecutions.length > 0 ? toolExecutions : undefined,
      });
    }
  }

  return sessionMessages;
}
```

**Step 6.2: Write Session Messages**
- Save the converted messages to session storage:

```typescript
// No tool calls - we have final response
await writeSessionMessages(context, convertInternalToSession(internalMessages));
return finalResponse.trim();
```

**Location:** `src/core/runtime/sessionManager.ts` (lines 146-157)

```typescript
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

**Step 6.3: Persist to Storage**
- Messages with `toolExecutions` are persisted to storage:

**Location:** `src/core/runtime/sessions/storage.ts` (lines 64-93)

```typescript
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
      // Preserve toolExecutions if they exist
      if (message.toolExecutions && Array.isArray(message.toolExecutions)) {
        result.toolExecutions = message.toolExecutions;
      }
      return result;
    })
  }));
  // ... persist to storage
}
```

---

## Phase 7: Session Hydration and UI Rendering

### Location: `src/core/webview/chat/chat.js` (lines 450-511)

**Step 7.1: Render Session**
- When a session is loaded, render all messages including tool executions:

```typescript
function renderSession(sessionId, messages) {
  if (!messagesEl) {
    return;
  }

  messagesEl.innerHTML = "";
  activeSessionId = sessionId;
  currentMessages = Array.isArray(messages) ? messages : [];

  if (Array.isArray(messages)) {
    messages.forEach((message) => {
      // ... render regular messages
      
      // Show tool executions if present
      if (message.toolExecutions && Array.isArray(message.toolExecutions)) {
        message.toolExecutions.forEach(exec => {
          showToolExecution({
            toolId: exec.toolId,
            toolName: exec.toolName,
            filename: exec.filename,
            status: exec.status
          });
        });
      }
    });
  }
}
```

**Step 7.2: Tool Execution Data Structure**
- Tool executions are stored in the message with this structure:

```typescript
interface ToolExecution {
  toolId: string;        // e.g., "call_a974592f17054523a383564e"
  toolName: string;      // e.g., "write_to_file"
  filename: string;      // e.g., "custom_addons/hostel_management/models/hostel_room.py"
  status: 'completed' | 'error';
  timestamp: number;
  args?: any;            // Tool arguments
  result?: any;          // Tool result
}
```

---

## Complete Data Flow Summary

### 1. **AI Model → Tool Call**
   - AI generates tool call in response stream
   - Orchestrator captures `tool_call` event
   - Tool call added to assistant message as `tool_use` block

### 2. **Tool Execution**
   - Orchestrator extracts tool name and arguments
   - Sends `tool_execution_start` progress message
   - Executes tool (e.g., `write_to_file`)
   - Sends `tool_execution_complete` progress message
   - Adds tool result as separate `tool` message

### 3. **Progress Messages → Webview**
   - `onProgress` callback receives JSON messages
   - `AssistaCoderProvider.handleProgressMessage` parses messages
   - Routes `tool_execution_start` and `tool_execution_complete` to webview

### 4. **Webview → UI Display**
   - `main.js` receives `toolExecution` message type
   - Calls `chat.showToolExecution()` for start event
   - Calls `chat.updateToolExecution()` for complete event
   - UI elements created/updated in real-time

### 5. **Session Persistence**
   - After final response, `convertInternalToSession()` converts messages
   - Tool uses and results are combined into `toolExecutions` array
   - Messages saved via `writeSessionMessages()`
   - Persisted to storage with `toolExecutions` preserved

### 6. **Session Hydration**
   - When session loads, `renderSession()` is called
   - Messages with `toolExecutions` are rendered
   - `showToolExecution()` called for each tool execution
   - UI displays tool executions with correct status

---

## Key Files Reference

1. **Orchestrator**: `src/core/agent/orchestrator.ts`
   - Handles tool call detection and execution
   - Sends progress messages

2. **Tool Definition**: `src/core/tools/writeFile.ts`
   - Example tool implementation

3. **Progress Handler**: `src/core/webview/AssistaCoderProvider.ts`
   - Routes progress messages to webview

4. **Webview Handler**: `src/core/webview/ui/main.js`
   - Receives and routes tool execution messages

5. **UI Rendering**: `src/core/webview/chat/chat.js`
   - Creates and updates tool execution UI elements

6. **Session Conversion**: `src/core/runtime/agent.ts`
   - Converts internal messages to session format
   - Combines tool uses and results into `toolExecutions`

7. **Session Storage**: `src/core/runtime/sessionManager.ts`
   - Persists messages to storage

8. **Types**: `src/core/runtime/sessions/types.ts`
   - Defines `ToolExecution` and `ChatMessage` interfaces

---

## Example: Complete Flow for `write_to_file`

1. **AI Model**: Generates tool call `write_to_file` with path and content
2. **Orchestrator**: Captures tool call, sends `tool_execution_start` with status "loading"
3. **Webview**: Receives message, calls `showToolExecution()` → UI shows loading spinner
4. **Tool Execution**: `writeFileTool.execute()` writes file to disk
5. **Orchestrator**: Sends `tool_execution_complete` with status "completed"
6. **Webview**: Receives message, calls `updateToolExecution()` → UI shows checkmark
7. **Session Conversion**: Tool use and result combined into `toolExecutions` array
8. **Session Persistence**: Message with `toolExecutions` saved to storage
9. **Session Hydration**: On reload, `renderSession()` displays tool execution with completed status

---

## HTML Output Example

The final rendered HTML structure:

```html
<div class="message-row" data-tool-id="call_a974592f17054523a383564e">
  <div class="tool-execution-wrapper">
    <div class="tool-execution-header">
      <span class="tool-execution-filename">custom_addons/hostel_management/models/hostel_room.py</span>
      <button class="tool-execution-status completed" title="Completed">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="20 6 9 17 4 12"></polyline>
        </svg>
      </button>
    </div>
  </div>
</div>
```

This matches the example HTML structure you provided in your query.

