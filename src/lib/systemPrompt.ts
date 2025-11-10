import * as vscode from 'vscode';

export type PromptMode = 'general' | 'chat' | 'generate' | 'edit' | 'tests' | 'menu' | 'specs' | 'tasks';

function defaultPrompt(mode: PromptMode): string {
  const baseRole = `You are Assista X, an expert Odoo developer assistant inside VS Code.
- Provide accurate, concise answers following Odoo ${new Date().getFullYear()} best practices.
- Prefer concrete file paths, code, and actionable steps.
- Never output harmful content or destructive commands.`;

  const capabilities = `Capabilities:
- Generate complete Odoo modules (models, views, security, data, tests)
- Modify existing modules safely (init imports, manifest updates)
- Explain and fix Odoo issues
- Follow XML and Python conventions
- Be concise, add code where useful`;

  const modeNotes: Record<PromptMode, string> = {
    general: 'General assistance mode.',
    chat: 'Chat mode: short, helpful answers with examples when useful.',
    generate: 'Generation mode: produce complete, production-ready files. No markdown wrappers.',
    edit: 'Edit mode: minimal diffs or full replacements per file; keep scope tight to the request.',
    tests: 'Tests mode: create Odoo TransactionCase tests with setup and clear assertions.',
    menu: 'Menu mode: produce valid Odoo XML menus, actions, and view references.',
    specs: 'Specs mode: produce thorough functional specifications for an Odoo module.',
    tasks: 'Tasks mode: produce actionable checklists with explicit file paths.',
  };

  return [baseRole, capabilities, `Mode: ${modeNotes[mode]}`].join('\n\n');
}

async function readWorkspaceOverride(mode: PromptMode): Promise<string | null> {
  try {
    const folders = vscode.workspace.workspaceFolders || [];
    if (!folders.length) return null;
    const fileNames = [
      `.assista-x/system-prompt-${mode}.md`,
      `.assista-x/system-prompt.md`,
    ];
    for (const folder of folders) {
      for (const name of fileNames) {
        const uri = vscode.Uri.joinPath(folder.uri, name);
        try {
          const stat = await vscode.workspace.fs.stat(uri);
          if (stat) {
            const { readFileContent } = await import('./services/fileService.js');
            const text = await readFileContent(uri);
            if (text && text.trim().length > 0) return text;
          }
        } catch {/* continue */}
      }
    }
    return null;
  } catch {
    return null;
  }
}

export async function getSystemPrompt(mode: PromptMode, context: vscode.ExtensionContext): Promise<string> {
  const cfg = vscode.workspace.getConfiguration('assistaX');
  const allowFileOverrides = cfg.get<boolean>('systemPrompt.allowFileOverrides', true);
  const custom = cfg.get<string>('systemPrompt.customInstructions', '') || '';

  let prompt = defaultPrompt(mode);

  if (allowFileOverrides) {
    const override = await readWorkspaceOverride(mode);
    if (override) {
      // File-based overrides take highest precedence; still append custom instructions if present
      prompt = override.trim();
    }
  }

  if (custom.trim()) {
    prompt += `\n\nCustom Instructions:\n${custom.trim()}`;
  }

  return prompt;
}
