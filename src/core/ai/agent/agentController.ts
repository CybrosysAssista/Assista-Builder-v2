// src/core/ai/agent/agentController.ts

import * as vscode from "vscode";
import { runAgent } from "../agent.js";
import type { AgentResult } from "./types.js";

/**
 * Pure agent controller.
 * No intent logic, no routing.
 * Sends prompt directly to the LLM agent.
 */
export async function agentController(
  prompt: string,
  context: vscode.ExtensionContext
): Promise<AgentResult> {

  console.log("[Assista X] agentController prompt:", prompt);

  const answer = await runAgent(
    { contents: prompt },
    context
  );

  return {
    success: true,
    message: answer
  };
}
