import * as vscode from "vscode";
import { readSessionMessages, clearActiveSession } from "./sessionManager.js";
import { getActiveProviderConfig, getRAGConfig } from "../config/configService.js";
import { getSystemInstruction } from "./prompts/systemPrompts.js";
import { createProvider } from "../providers/factory.js";
import { runAgentOrchestrator } from "../agent/orchestrator.js";
import type { InternalMessage } from "../agent/types.js";
import type { ChatMessage, ChatRole, ToolExecution } from "./sessions/types.js";
import { OdooEnvironmentService } from "../utils/odooDetection.js";
import { RAGService } from "../utils/ragService.js";

/**
 * Convert session messages to internal message format
 */
function convertSessionToInternal(
  sessionMessages: ChatMessage[]
): InternalMessage[] {
  const internalMessages: InternalMessage[] = [];

  for (const msg of sessionMessages) {
    if (
      msg.role === "user" ||
      msg.role === "assistant" ||
      msg.role === "tool"
    ) {
      const content: any[] = [];
      if (typeof msg.content === "string") {
        content.push({ type: "text", text: msg.content });
      }

      // Add tool uses if present
      if (msg.toolExecutions && msg.toolExecutions.length > 0) {
        for (const exec of msg.toolExecutions) {
          // Tool uses are always associated with assistant role in internal format
          if (msg.role === "assistant" || msg.role === "tool") {
            content.push({
              type: "tool_use",
              id: exec.toolId,
              name: exec.toolName,
              input: exec.args || {},
            });
          }
        }
      }

      internalMessages.push({
        role:
          msg.role === "tool"
            ? "assistant"
            : (msg.role as "user" | "assistant"),
        content:
          content.length === 1 && content[0].type === "text"
            ? content[0].text
            : content,
        timestamp: msg.timestamp,
        isError: msg.isError,
      });

      // Add tool results as separate messages
      if (msg.toolExecutions && msg.toolExecutions.length > 0) {
        for (const exec of msg.toolExecutions) {
          internalMessages.push({
            role: "tool",
            content: [
              {
                type: "tool_result",
                tool_use_id: exec.toolId,
                content: JSON.stringify(exec.result || {}),
              },
            ],
          });
        }
      }
    }
  }
  return internalMessages;
}

/**
 * Convert internal messages back to session format
 */
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
        isError: msg.isError,
      });
    }
  }

  return sessionMessages;
}

export async function runAgent(
  params: any = {},
  context: vscode.ExtensionContext,
  odooEnvService: OdooEnvironmentService
): Promise<string> {
  const onProgress = params.onProgress as ((msg: string) => void) | undefined;
  const abortSignal = params.abortSignal as AbortSignal | undefined;

  // Check if already cancelled
  if (abortSignal?.aborted) {
    throw new Error("Request cancelled");
  }
  if (!context) {
    throw new Error("Extension context is required.");
  }

  const cfg = params.config ?? {};
  let sessionHistory = await readSessionMessages(context);

  if (cfg.resetSession) {
    await clearActiveSession(context);
    sessionHistory = [];
  }

  // Get provider configuration
  const { provider: providerName, config: providerConfig } =
    await getActiveProviderConfig(context);
  const configSection = vscode.workspace.getConfiguration("assistaCoder");
  const customInstructions = configSection.get<string>(
    "systemPrompt.customInstructions",
    ""
  );

  // Create provider adapter
  const adapter = createProvider(providerName, providerConfig, context);

  // Convert session history to internal format
  const internalHistory = convertSessionToInternal(sessionHistory);

  // Get environment and system instruction with mode
  const mode = params.mode || "agent";
  const environment = await odooEnvService.getEnvironment();

  // Extract user content for RAG and orchestrator
  const userContent =
    typeof params.contents === "string"
      ? params.contents
      : String(params.contents || "");

  // Retrieve RAG context if enabled
  let ragContext: string | undefined;
  const ragConfig = getRAGConfig();

  if (ragConfig.enabled) {
    try {
      const ragService = new RAGService(ragConfig.serverUrl);
      const ragResult = await ragService.retrieveContext(userContent, ragConfig.topK);

      if (ragResult.context && ragResult.context.trim().length > 0) {
        ragContext = ragResult.context;
        console.log(`[Assista Coder] RAG context:\n${ragContext}`);
        console.log(`[Assista Coder] RAG context retrieved: ${ragResult.totalChunks} chunks`);
      }
    } catch (error) {
      // Fail gracefully - log warning but continue without RAG
      console.warn(`[Assista Coder] RAG retrieval failed: ${error instanceof Error ? error.message : String(error)}. Continuing without RAG context.`);
    }
  }

  const systemInstruction = getSystemInstruction(
    customInstructions,
    mode,
    environment,
    ragContext
  );
  // console.log('environment', environment);
  // console.log('systemInstruction', systemInstruction);
  // Run orchestrator

  const requestPayload = {
    contents: userContent,
    config: {
      ...params.config,
      systemInstruction,
      mode: params.mode || "agent",
    },
    reset: cfg.resetSession,
  };

  // Persist user message immediately so it exists before tools run

  // Log request before calling orchestrator
  // console.log('[Assista Coder] Request to orchestrator:',requestPayload);
  // console.log('[Assista Coder] context:',context);
  // console.log('[Assista Coder] adapter:',adapter);
  // console.log('[Assista Coder] Internal history:',internalHistory);

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

export async function resetSession(
  context: vscode.ExtensionContext
): Promise<void> {
  await clearActiveSession(context);
}

export async function getSessionHistory(context: vscode.ExtensionContext) {
  return await readSessionMessages(context);
}
