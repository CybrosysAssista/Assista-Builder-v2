/**
 * Service for tracking active editor file and module root
 */
import * as vscode from 'vscode';
import { findModuleRoot as findModuleRootFromService } from './moduleService.js';

export interface ActiveFileInfo {
    fileName: string | null;
    fullPath: string | null;
    languageId: string | null;
    moduleRoot: string | null;
    timestamp: number;
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
        const moduleRoot = await findModuleRootFromService(uri);
        
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

