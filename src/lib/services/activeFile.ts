/**
 * Service for tracking active editor file and module root
 */
import * as vscode from 'vscode';

export interface ActiveFileInfo {
    fileName: string | null;
    fullPath: string | null;
    languageId: string | null;
    moduleRoot: string | null;
    timestamp: number;
}

/**
 * Finds the nearest module root containing __manifest__.py
 */
async function findModuleRoot(uri: vscode.Uri): Promise<string | null> {
    const pathMod = require('path');
    let curDir = pathMod.dirname(uri.fsPath);
    const wsRoots = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
    
    while (curDir && wsRoots.some(w => curDir.startsWith(w))) {
        try {
            const probe = vscode.Uri.file(pathMod.join(curDir, '__manifest__.py'));
            await vscode.workspace.fs.stat(probe);
            return curDir;
        } catch {
            // keep climbing
        }
        const parent = pathMod.dirname(curDir);
        if (parent === curDir) break;
        curDir = parent;
    }
    return null;
}

/**
 * Get current active file information including module root
 */
export async function getActiveFileInfo(): Promise<ActiveFileInfo> {
    try {
        const ed = vscode.window.activeTextEditor;
        if (!ed || !ed.document || !ed.document.uri) {
            return {
                fileName: null,
                fullPath: null,
                languageId: null,
                moduleRoot: null,
                timestamp: Date.now()
            };
        }
        const uri = ed.document.uri;
        const fileName = require('path').basename(uri.fsPath);
        const languageId = ed.document.languageId || '';
        const moduleRoot = await findModuleRoot(uri);
        
        if (moduleRoot) {
            console.log('[Assista X] Active module root:', moduleRoot);
        } else {
            console.log('[Assista X] Active module root: not found (no __manifest__.py above active file)');
        }
        
        return {
            fileName,
            fullPath: uri.fsPath,
            languageId,
            moduleRoot,
            timestamp: Date.now()
        };
    } catch (err) {
        console.warn('[Assista X] getActiveFileInfo error:', err);
        return {
            fileName: null,
            fullPath: null,
            languageId: null,
            moduleRoot: null,
            timestamp: Date.now()
        };
    }
}

/**
 * Broadcast active file info to webview provider
 */
export function createActiveFileBroadcaster(
    provider: { sendMessage: (message: any) => void },
    context: vscode.ExtensionContext
): () => Promise<void> {
    const pushActiveFile = async () => {
        const info = await getActiveFileInfo();
        provider.sendMessage({
            command: 'activeFile',
            ...info
        });
    };
    
    // Initial push
    pushActiveFile();
    
    // Subscribe to editor changes
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(() => pushActiveFile()),
        vscode.window.onDidChangeVisibleTextEditors(() => pushActiveFile()),
        vscode.window.onDidChangeWindowState(() => pushActiveFile())
    );
    
    return pushActiveFile;
}

