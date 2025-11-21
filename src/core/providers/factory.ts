import * as vscode from 'vscode';
import type { ProviderAdapter } from './base-provider.js';
import { ProviderConfig } from '../ai/providers/types.js';
import { GeminiAdapter } from './gemini-adapter.js';
import { OpenAIAdapter } from './openai-adapter.js';

/**
 * Create a provider adapter based on provider name
 */
export function createProvider(
  providerName: string,
  config: ProviderConfig,
  context: vscode.ExtensionContext
): ProviderAdapter {
  switch (providerName) {
    case 'google':
      return new GeminiAdapter(config, context);

    case 'openai':
    case 'openrouter':
    case 'anthropic':
    case 'custom':
      return new OpenAIAdapter(config, providerName, context);

    default:
      throw new Error(`Unknown provider: ${providerName}`);
  }
}

