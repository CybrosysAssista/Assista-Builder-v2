/**
 * Command handler for editing existing Odoo projects
 */
import * as vscode from 'vscode';
import { AssistaXProvider } from '../webview/AssistaXProvider.js';

export function registerEditProjectCommand(
    context: vscode.ExtensionContext,
    provider: AssistaXProvider
): vscode.Disposable {
    return vscode.commands.registerCommand('assistaX.editOdooProject', async () => {
        try {
            // Ensure webview is shown to display results
            try { await vscode.commands.executeCommand('assistaXView.focus'); } catch { }
            // Enter silent edit mode in the webview (no file list or summaries should be shown)
            provider.sendMessage({ command: 'editStart', timestamp: Date.now() });
            // Require an active editor/file to scope the edit session, otherwise show a clear error
            if (!vscode.window.activeTextEditor || (vscode.window.visibleTextEditors || []).length === 0) {
                const msg = 'Assista X: No file is currently open in the editor. Open a module file and try again.';
                provider.sendMessage({ command: 'aiReply', text: msg });
                return;
            }
            const folders = vscode.workspace.workspaceFolders || [];
            if (!folders.length) {
                provider.sendMessage({ command: 'aiReply', text: 'No workspace is open. Please open your Odoo project folder in VS Code.' });
                return;
            }
            // Find all __manifest__.py files (detect Odoo modules)
            const exclude = '**/{.git,node_modules,venv,env,dist,build,\.venv,\.env}/**';
            const manifests = await vscode.workspace.findFiles('**/__manifest__.py', exclude, 100);
            if (!manifests.length) {
                provider.sendMessage({ command: 'aiReply', text: 'No Odoo modules detected (no __manifest__.py found). Please open an Odoo module or workspace containing modules.' });
                return;
            }
            // Map to module roots (parent of each manifest)
            const roots = manifests.map(u => vscode.Uri.joinPath(u, '..'));
            let chosen: vscode.Uri | undefined;
            if (roots.length === 1) {
                chosen = roots[0];
            } else {
                // Auto-select without prompting:
                // 1) Prefer the module containing the active editor's file, if any
                const active = vscode.window.activeTextEditor?.document.uri;
                if (active) {
                    const containing = roots.find(r => active.fsPath.startsWith(r.fsPath + require('path').sep));
                    if (containing) {
                        chosen = containing;
                    }
                }
                // 2) Fallback to the first detected module root
                if (!chosen) {
                    chosen = roots[0];
                }
            }
            // If the active file isn't inside any detected module root, try to derive a root from it
            try {
                const activeUri = vscode.window.activeTextEditor?.document.uri;
                if (activeUri) {
                    const sep2 = require('path').sep;
                    const isInsideChosen = chosen && activeUri.fsPath.startsWith(chosen.fsPath + sep2);
                    if (!isInsideChosen) {
                        const path = require('path');
                        const wsRoots = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
                        let curDir = path.dirname(activeUri.fsPath);
                        let foundRoot: vscode.Uri | undefined;
                        // climb up until workspace boundary to find nearest __manifest__.py
                        while (curDir && wsRoots.some(w => curDir.startsWith(w))) {
                            try {
                                const manifestProbe = vscode.Uri.file(path.join(curDir, '__manifest__.py'));
                                await vscode.workspace.fs.stat(manifestProbe);
                                foundRoot = vscode.Uri.file(curDir);
                                break;
                            } catch { /* continue climbing */ }
                            const parent = path.dirname(curDir);
                            if (parent === curDir) break;
                            curDir = parent;
                        }
                        if (foundRoot) {
                            chosen = foundRoot;
                        } else if (!chosen) {
                            // As last resort, use the active file's directory as an edit-only scope
                            chosen = vscode.Uri.file(path.dirname(activeUri.fsPath));
                        }
                    }
                }
            } catch { /* non-fatal */ }
            if (!chosen) { return; }
            // Gather module context: list files and classify
            const rel = new vscode.RelativePattern(chosen, '**/*');
            const files = await vscode.workspace.findFiles(rel, exclude, 5000);
            const toRel = (u: vscode.Uri) => vscode.workspace.asRelativePath(u);
            const byDir = { models: 0, views: 0, controllers: 0, data: 0, security: 0, others: 0 } as Record<string, number>;
            const samples: string[] = [];
            const existingRelPaths: string[] = [];
            for (const f of files) {
                const p = toRel(f).replace(/\\/g, '/');
                existingRelPaths.push(p);
                const lower = p.toLowerCase();
                if (lower.includes('/models/')) byDir.models++;
                else if (lower.includes('/views/')) byDir.views++;
                else if (lower.includes('/controllers/')) byDir.controllers++;
                else if (lower.includes('/data/')) byDir.data++;
                else if (lower.includes('/security/')) byDir.security++;
                else byDir.others++;
                if (samples.length < 12) samples.push(p);
            }

            // Determine open editor files that belong to the chosen module
            const sep = require('path').sep;
            const openFiles = vscode.window.visibleTextEditors
                .map(e => e.document.uri)
                .filter(u => u.fsPath.startsWith(chosen.fsPath + sep))
                .map(u => vscode.workspace.asRelativePath(u).replace(/\\/g, '/'));

            // Inform webview that edit mode is ready, with edit-only context
            provider.sendMessage({
                command: 'editReady',
                moduleRoot: chosen.fsPath,
                timestamp: Date.now()
            });

            // Provide edit context so the webview/backend pipeline can restrict to existing files only
            provider.sendMessage({
                command: 'editContext',
                moduleRoot: chosen.fsPath,
                existingFiles: existingRelPaths,
                openFiles,
                timestamp: Date.now()
            });
        } catch (e: any) {
            provider.sendMessage({ command: 'aiReply', text: `Failed to scan project: ${e?.message || e}` });
        }
    });
}

