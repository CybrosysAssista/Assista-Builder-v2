import type { OdooEnv } from '../../utils/odooDetection.js';
import { getWorkspaceRoot } from '../../tools/toolUtils.js';

const BASE_PROMPT = `
You are Assista X, an Odoo-focused assistant.
Give precise, minimal, correct answers.
Do not guess; ask when info is missing.
Warn about unsafe or deprecated methods.
Stay interactive by explaining your action before execution.
`.trim();

const CHAT_MODE_PROMPT = `
CHAT mode: You only have read access. You cannot write or edit files.
if any write/edit action is requested, ask user to switch to AGENT mode.
`.trim();

const AGENT_MODE_PROMPT = `
AGENT mode: You may read/create/modify files.
If any required detail is missing or unclear—such as:
- Odoo version
- Addons path
Do not ask for confirmation when everything is already clear.
Create modules only inside the possible custom addons paths defined in WORKSPACE ENVIRONMENT.
Never create modules in the default addons path.
Stay interactive by explaining your action before execution.
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
