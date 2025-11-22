import type { InternalMessage, ToolDefinition, NormalizedEvent } from '../agent/types.js';

/**
 * Provider adapter interface
 * All providers must implement this to work with the orchestrator
 */
export interface ProviderAdapter {
  name: string;

  /**
   * Convert internal messages -> provider-specific request (including tools)
   */
  buildRequest(
    systemInstruction: string,
    messages: InternalMessage[],
    tools?: ToolDefinition[],
    options?: any
  ): Promise<any>;

  /**
   * Send request (streaming). Must yield normalized events.
   */
  createMessageStream(
    request: any,
    options?: any
  ): AsyncIterable<NormalizedEvent>;

  /**
   * Convert canonical tool definitions -> provider tool declaration format
   */
  convertToolsToProviderSchema(tools: ToolDefinition[]): Promise<any>;
}

