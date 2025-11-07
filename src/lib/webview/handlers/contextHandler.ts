/**
 * Handler for context-related webview messages (file picker, active file, etc.)
 */
import * as vscode from 'vscode';
import { findModuleRoot } from '../utils/webviewUtils.js';

export interface MessageHandler {
    handle(message: any, provider: { sendMessage: (msg: any) => void; _view?: vscode.WebviewView; _context?: vscode.ExtensionContext }): Promise<boolean>;
}

export class ContextHandler implements MessageHandler {
    async handle(message: any, provider: { sendMessage: (msg: any) => void; _view?: vscode.WebviewView }): Promise<boolean> {
        // Open context picker (Files or Folders)
        if (message?.command === 'openContextPicker') {
            try {
                const pick = await vscode.window.showQuickPick(
                    [
                        { label: 'Files', id: 'files' },
                        { label: 'Folders', id: 'folders' },
                    ],
                    { placeHolder: 'Attach Files or Folders' }
                );
                if (!pick) { return true; }

                const ws = vscode.workspace.workspaceFolders || [];
                const defaultUri = ws.length ? ws[0].uri : undefined;
                const pathMod = require('path');
                const isInsideWorkspace = (u: vscode.Uri): boolean => {
                    try {
                        const p = pathMod.normalize(u.fsPath);
                        return ws.some(w => {
                            const root = pathMod.normalize(w.uri.fsPath);
                            return p === root || p.startsWith(root + pathMod.sep);
                        });
                    } catch { return false; }
                };

                const canSelectFiles = pick.id === 'files';
                const canSelectFolders = pick.id === 'folders';

                const uris = await vscode.window.showOpenDialog({
                    title: `Attach ${pick.label}`,
                    canSelectFiles,
                    canSelectFolders,
                    canSelectMany: true,
                    defaultUri,
                    openLabel: 'Attach'
                });
                if (!uris || !uris.length) { return true; }

                const filtered = uris.filter(isInsideWorkspace);
                if (filtered.length === 0) {
                    vscode.window.showWarningMessage('Selection must be inside the current workspace.');
                    return true;
                }
                if (filtered.length < uris.length) {
                    vscode.window.showInformationMessage('Some selections were outside the workspace and were ignored.');
                }

                const items = filtered.map(u => ({
                    type: canSelectFiles ? 'file' : 'folder',
                    name: pathMod.basename(u.fsPath),
                    path: u.fsPath,
                }));
                provider.sendMessage({ command: 'contextAdded', items });
                try { vscode.window.setStatusBarMessage(`Assista X: Added ${items.length} context item(s)`, 2500); } catch {}
            } catch (e) {
                try { console.warn('[Assista X] openContextPicker failed:', e); } catch {}
            }
            return true;
        }

        // Request active file info
        if (message?.command === 'requestActiveFile') {
            try {
                const ed = vscode.window.activeTextEditor;
                if (!ed || !ed.document || !ed.document.uri) {
                    provider._view?.webview.postMessage({
                        command: 'activeFile',
                        fileName: null,
                        fullPath: null,
                        languageId: null,
                        moduleRoot: null,
                        timestamp: Date.now()
                    });
                    return true;
                }
                const uri = ed.document.uri;
                const fileName = require('path').basename(uri.fsPath);
                const languageId = ed.document.languageId || '';
                const moduleRootPath = await findModuleRoot(uri);
                provider._view?.webview.postMessage({
                    command: 'activeFile',
                    fileName,
                    fullPath: uri.fsPath,
                    languageId,
                    moduleRoot: moduleRootPath,
                    timestamp: Date.now()
                });
            } catch {}
            return true;
        }

        return false;
    }
}

