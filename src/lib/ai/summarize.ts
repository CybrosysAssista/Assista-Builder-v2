/**
 * summarize.ts
 * Utility functions for compressing long text (specs, tasks, menus)
 * Used to reduce token usage in prompts while preserving key context.
 */

import * as vscode from 'vscode';
import { generateContent } from './index.js';

/**
 * Simple truncation-based summarizer (no AI call).
 * Keeps the first `max` characters of text.
 */
export function summarize(text: string | undefined, max = 800): string {
  if (!text) return '';
  return text.length > max ? text.slice(0, max).trim() + '…' : text.trim();
}

/**
 * Generate a more intelligent AI-based summary.
 * Attempts to preserve entities, models, and relationships from long text.
 */
export async function generateContextSummary(
  content: string,
  type: 'specs' | 'tasks' | 'menu',
  context: vscode.ExtensionContext
): Promise<string> {
  if (!content || content.length < 400) {
    return summarize(content, 400);
  }

  const summaryPrompt = {
    contents: `Summarize the following ${type} into 2–3 concise bullet points.
Focus on main models, relationships, and key structures.

${content.slice(0, 2000)}${content.length > 2000 ? '...' : ''}

Return only the summary (no explanations or commentary).`,
    config: { systemInstruction: 'Assista X summarizer: concise, entity-focused.' },
  };

  try {
    const result = await generateContent(summaryPrompt, context);
    const clean = (result || '').trim().replace(/\s+/g, ' ');
    return summarize(clean, 800);
  } catch (error) {
    console.warn(`[summarize] Failed AI summarization for ${type}: ${String(error)}`);
    return summarize(content, 800);
  }
}

/**
 * Generate a unified summary object for all three sections.
 */
export async function generateAllSummaries(
  specs: string,
  tasks: string,
  menu: string,
  context: vscode.ExtensionContext
): Promise<{ specsSummary: string; tasksSummary: string; menuSummary: string }> {
  const specsSummary = await generateContextSummary(specs, 'specs', context);
  const tasksSummary = await generateContextSummary(tasks, 'tasks', context);
  const menuSummary = await generateContextSummary(menu, 'menu', context);
  return { specsSummary, tasksSummary, menuSummary };
}
