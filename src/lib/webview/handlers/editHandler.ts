/**
 * Handler for edit operations (simplified - delegates to commands)
 */
import * as vscode from 'vscode';
import { MessageHandler } from './contextHandler.js';

export class EditHandler implements MessageHandler {
    constructor(private readonly context?: vscode.ExtensionContext) {}

    async handle(message: any, provider: { sendMessage: (msg: any) => void; _view?: vscode.WebviewView; _context?: vscode.ExtensionContext }): Promise<boolean> {
        const ctx = this.context || (provider as any)._context;
        
        // Send general chat message
        if (message.command === 'sendMessage') {
                const { generateContent } = await import('../../ai/index.js');
            const { getConversationStore } = await import('../../conversation.js');
            try {
                const text: string = String(message.text || '');
                const store = getConversationStore(ctx);
                await store.addUserMessage(text);
                const apiMessages = store.getApiHistory().map(m => ({ role: m.role, content: m.content }));
                const aiResponse = await generateContent({ messages: apiMessages, config: { mode: 'general' } }, ctx);
                await store.addAssistantMessage(aiResponse);
                setTimeout(() => {
                    provider._view?.webview.postMessage({ command: 'aiReply', text: aiResponse });
                }, 250);
            } catch (error) {
                provider._view?.webview.postMessage({ command: 'aiReply', text: `Sorry, I encountered an error while processing your request: ${(error as Error).message}. Please check your API settings in the extension settings.` });
            }
            return true;
        }

        // Edit request - route to unified Apply Edits pipeline
        if (message.command === 'editRequest') {
            try {
                const routedText: string = String(message.text || '');
                async function collectContext(items: any[]): Promise<Array<{ path: string; content: string }>> {
                    const out: Array<{ path: string; content: string }> = [];
                    if (!Array.isArray(items) || !items.length) return out;
                    const wsFolders = vscode.workspace.workspaceFolders || [];
                    const isInWs = (u: vscode.Uri) => wsFolders.some(w => u.fsPath.startsWith(w.uri.fsPath + require('path').sep) || u.fsPath === w.uri.fsPath);
                    const readAllFiles = async (uri: vscode.Uri) => {
                        try {
                            const stat = await vscode.workspace.fs.stat(uri);
                            const { readFileContent } = await import('../../services/fileService.js');
                            if (stat.type === vscode.FileType.File) {
                                const content = await readFileContent(uri);
                                out.push({ path: uri.fsPath, content });
                            } else if (stat.type === vscode.FileType.Directory) {
                                const entries = await vscode.workspace.fs.readDirectory(uri);
                                for (const [name, type] of entries) {
                                    const child = vscode.Uri.joinPath(uri, name);
                                    if (type === vscode.FileType.File) {
                                        const content = await readFileContent(child);
                                        out.push({ path: child.fsPath, content });
                                    } else if (type === vscode.FileType.Directory) {
                                        await readAllFiles(child);
                                    }
                                }
                            }
                        } catch { /* ignore individual read errors */ }
                    };
                    for (const it of items) {
                        const p = String(it?.path || '');
                        if (!p) continue;
                        const uri = vscode.Uri.file(p);
                        if (!isInWs(uri)) continue;
                        await readAllFiles(uri);
                    }
                    return out;
                }
                const attachedContext = await collectContext(message?.context || []);
                await vscode.commands.executeCommand('assistaX.applyEditsFromPrompt', { userPrompt: routedText, attachedContext });
            } catch {
                // Fallback to legacy edit flow if applyEditsFromPrompt fails
                provider._view?.webview.postMessage({ command: 'aiReply', text: 'Edit request failed. Please try using the Apply Edits command directly.' });
            }
            return true;
        }

        // Start edit scan
        if (message.command === 'startEditExisting' || message.command === 'requestEditScan') {
            try {
                await vscode.commands.executeCommand('assistaX.editOdooProject');
            } catch (e: any) {
                provider._view?.webview.postMessage({ command: 'aiReply', text: `Failed to start edit: ${e?.message || e}` });
            }
            return true;
        }

        // Diff review: apply selected changes
        if (message.type === 'applySelected') {
            try {
                const selected: string[] = Array.isArray(message.paths) ? message.paths : [];
                const providerInstance = (provider as any)._providerInstance;
                const map: Record<string, { uri: vscode.Uri; current: string; updated: string }> = (providerInstance as any)?._proposedChanges || {};
                if (!selected.length || !map || !Object.keys(map).length) {
                    provider._view?.webview.postMessage({ command: 'aiReply', text: 'No selected files to apply.' });
                    return true;
                }
                const openedDocsApply = new Set<string>();
                let applied = 0;
                for (const rel of selected) {
                    const item = map[rel];
                    if (!item) continue;
                    try {
                        try {
                            await vscode.workspace.fs.stat(item.uri);
                        } catch {
                            provider._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.skipped', payload: { path: rel, reason: 'nonexistent' } } });
                            continue;
                        }
                        const { writeFileContent } = await import('../../services/fileService.js');
                        await writeFileContent(item.uri, item.updated);
                        provider._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.written', payload: { path: rel } } });
                        applied++;
                        const key = item.uri.toString();
                        if (!openedDocsApply.has(key)) {
                            openedDocsApply.add(key);
                            try { await vscode.window.showTextDocument(item.uri, { preview: false, preserveFocus: true }); } catch { }
                        }
                    } catch (e) {
                        provider._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.error', payload: { path: rel, error: String(e) } } });
                    }
                }
            } catch (e: any) {
                provider._view?.webview.postMessage({ command: 'aiReply', text: `Failed to apply selected changes: ${e?.message || e}` });
            }
            return true;
        }

        // Diff review: cancel
        if (message.type === 'cancelDiff') {
            const providerInstance = (provider as any)._providerInstance;
            if (providerInstance) {
                (providerInstance as any)._proposedChanges = undefined;
            }
            provider._view?.webview.postMessage({ command: 'aiReply', text: 'Cancelled review.' });
            return true;
        }

        return false;
    }
}

