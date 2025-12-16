import * as vscode from 'vscode';
import * as path from 'path';
import type { OdooEnv } from '../../utils/odooDetection.js';
import { getWorkspaceRoot } from '../../tools/toolUtils.js';

/**
 * GENERATES THE XML BLOCK FOR ODOO ENVIRONMENT
 * Wraps version, root, and addons in structured tags.
 */
function formatEnvironmentXml(env: OdooEnv | null): string {
  try {
    const rootPath = getWorkspaceRoot();
    if (!rootPath && !env) return '';

    const parts = [];
    if (rootPath) parts.push(`  <project_root>${rootPath}</project_root>`);

    if (env) {
      if (env.version && env.version !== 'not available') {
        parts.push(`  <odoo_version>${env.version}</odoo_version>`);
      }
      if (env.addons?.length) {
        parts.push(`  <addons_paths>\n    ${env.addons.map(p => `<path>${p}</path>`).join('\n    ')}\n  </addons_paths>`);
      }
    }

    return parts.length > 0 ? `<environment>\n${parts.join('\n')}\n</environment>` : '';
  } catch (error) {
    return ''; 
  }
}

/**
 * GENERATES THE XML BLOCK FOR EDITOR STATE
 * Lists open files and active files so the agent knows what is visible.
 */
function formatEditorXml(): string {
  try {
    const workspaceRoot = getWorkspaceRoot();
    if (!workspaceRoot) return '';

    const seen = new Set<string>();
    const openedFiles: string[] = [];
    let activeFileRelativePath: string | undefined;

    const addFile = (uri: vscode.Uri, isActive = false) => {
      if (uri.scheme !== 'file') return;
      const fsPath = uri.fsPath;
      if (!fsPath || seen.has(fsPath)) return;
      const rel = path.relative(workspaceRoot, fsPath);
      if (!rel || rel.startsWith('..')) return;
      const relPath = rel.replace(/\\/g, '/');
      seen.add(fsPath);
      if (isActive) activeFileRelativePath = relPath;
      else openedFiles.push(relPath);
    };

    // Active editor
    const activeUri = vscode.window.activeTextEditor?.document.uri;
    activeUri && addFile(activeUri, true);

    // All tabs
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        const input: any = (tab as any).input;
        const uri = input?.uri || input?.resource;
        uri && addFile(uri);
      }
    }

    if (!activeFileRelativePath && openedFiles.length === 0) return '';

    const parts: string[] = [];
    if (activeFileRelativePath) parts.push(`  <active_file priority="primary">${activeFileRelativePath}</active_file>`);
    if (openedFiles.length > 0) parts.push(`  <open_files>\n    ${openedFiles.sort().map(f => `<file>${f}</file>`).join('\n    ')}\n  </open_files>`);

    return `<editor_state>\n${parts.join('\n')}\n</editor_state>`;
  } catch {
    return '';
  }
}

/**
 * MAIN PROMPT GENERATOR
 */
export function getSystemInstruction(
  custom?: string,
  mode: string = 'agent',
  env?: OdooEnv | null
): string {

  // 1. Build State XML
  const environmentXml = formatEnvironmentXml(env ?? null);
  const editorXml = formatEditorXml();
  const stateBlock = (environmentXml || editorXml)
    ? `<system_state>\n${environmentXml}\n${editorXml}\n</system_state>`
    : '';

  const modeInstruction = mode === 'chat'
    ? `## Operational Mode: CHAT (ReadOnly)
- You have READ-ONLY access.
- You CANNOT write, create, or edit files.
- If the user asks for code changes, explicitly ask them to switch to AGENT mode.`
    : `## Operational Mode: AGENT (Read/Write)
- You have FULL ACCESS to read, create, and modify files.
- Do NOT ask for confirmation if the request is clear.
- EXECUTE actions immediately using your tools.`;

  return `
# Role
You are Assista X, an expert Odoo AI Developer. You provide precise, minimal, and correct answers. 

# Context
The following XML block contains the current IDE and Odoo environment state. This information is provided as context about the user environment. Only consider it if it's relevant to the user request; ignore it otherwise.

${stateBlock}

# Odoo Development Guidelines
1. **Addons Path:** Only create modules inside the custom addons paths defined in \`<addons_paths>\`. NEVER create modules in the default Odoo addons path.
2. **Version Compatibility:** Respect the Odoo version defined in \`<odoo_version>\`. Check for deprecated methods.
3. **Safety:** Warn about unsafe operations (e.g., dropping tables, sudo() abuse) before executing.
4. **Interactivity:** If key details (Odoo version, specific path) are missing from the context or request, ask the user before guessing.

${modeInstruction}

${custom ? `# Custom User Instructions\n${custom.trim()}` : ''}
`.trim();
}
