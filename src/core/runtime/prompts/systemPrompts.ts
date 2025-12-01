import type { OdooEnv } from '../../utils/odooDetection.js';
import { getWorkspaceRoot } from '../../tools/toolUtils.js';

const BASE_PROMPT = `
You are Assista X, an Odoo-focused assistant.
Give precise, minimal, correct answers.
Do not guess; ask when info is missing.
Warn about unsafe or deprecated methods.
`.trim();

const CHAT_MODE_PROMPT = `
CHAT mode: Read-only. Only use read_file.
For write/edit requests, ask user to switch to Agent mode.
`.trim();

const AGENT_MODE_PROMPT = `
AGENT mode: You may read/create/modify files.
Before writing, confirm Odoo version, addons path, module, and destination.
If unclear, use ask_followup_question.
Create modules only in the specified custom addons paths shown in WORKSPACE ENVIRONMENT.
Never create modules in the default /addons path.
Follow proper Odoo module structure.
`.trim();

function formatEnvironmentInfo(env: OdooEnv | null): string {
  if (!env) return '';
  const out = [];
  try {
    const rootPath = getWorkspaceRoot();
    out.push(`Project Root: ${rootPath}`);
  } catch (error) {
    // Workspace root not available, skip
  }
  if (env.version && env.version !== 'not available') out.push(`Odoo Version: ${env.version}`);
  if (env.addons?.length) out.push(`Addons Paths: ${env.addons.join(', ')}`);
  return out.length ? `\n\nWORKSPACE ENVIRONMENT:\n${out.join('\n')}` : '';
}

export function getSystemInstruction(
  custom?: string,
  mode: string = 'agent',
  env?: OdooEnv | null
): string {
  const prompt = mode === 'chat' ? CHAT_MODE_PROMPT : AGENT_MODE_PROMPT;
  let text = `${BASE_PROMPT}\n\n${prompt}${formatEnvironmentInfo(env ?? null)}`;
  if (custom?.trim()) text += `\n\n${custom.trim()}`;
  return text;
}
