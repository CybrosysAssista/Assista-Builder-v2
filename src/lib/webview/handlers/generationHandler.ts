/**
 * Handler for module generation operations
 */
import * as vscode from 'vscode';
import { MessageHandler } from './contextHandler.js';
import { normalizeGeneratedPath } from '../utils/webviewUtils.js';

export class GenerationHandler implements MessageHandler {
    constructor(
        private readonly context: vscode.ExtensionContext,
        private readonly cancelChecker: () => boolean,
        private readonly resetCancel: () => void
    ) {}

    async handle(message: any, provider: { sendMessage: (msg: any) => void; _view?: vscode.WebviewView }): Promise<boolean> {
        // Post-generation choice
        if (message?.command === 'postGenChoose') {
            const choice = String(message.choice || '').toLowerCase();
            if (choice === 'edit') {
                try { await vscode.commands.executeCommand('assistaXView.focus'); } catch {}
                try { provider.sendMessage({ command: 'switchMode', mode: 'edit', keepSession: true }); } catch {}
                try { await vscode.commands.executeCommand('assistaX.editOdooProject'); } catch {}
            } else if (choice === 'generate') {
                try { await vscode.commands.executeCommand('assistaX.generateOdooModule'); } catch {}
            }
            return true;
        }

        // Mark generation from welcome
        if (message?.command === 'markGenerateFromWelcome') {
            // This is tracked by the provider, but we can handle the message here
            return true;
        }

        // Continue with existing generation logic
        return await this.handleGeneration(message, provider);
    }

    private async handleGeneration(message: any, provider: { sendMessage: (msg: any) => void; _view?: vscode.WebviewView }): Promise<boolean> {
        // Begin module generation from sidebar
        if (message.command === 'beginGenerateModule') {
            this.resetCancel();
            const prompt: string = (message.prompt || '').toString();
            const version: string = (message.version || '17.0').toString();
            const moduleName: string = (message.moduleName || '').toString();
            
            if (!prompt || !moduleName) {
                provider._view?.webview.postMessage({ command: 'aiReply', text: 'Please provide both description and module name.' });
                return true;
            }

            const targetUris = await vscode.window.showOpenDialog({
                title: 'Select parent folder for the module',
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select'
            });
            if (!targetUris || !targetUris[0]) {
                provider._view?.webview.postMessage({ command: 'generationMessage', sender: 'ai', text: 'Cancelled: No folder selected.' });
                return true;
            }
            
            const parentFolder = targetUris[0];
            const folderUri = vscode.Uri.joinPath(parentFolder, moduleName);

            const send = (payload: any) => {
                if (this.cancelChecker()) return;
                provider._view?.webview.postMessage(payload);
            };
            
            send({
                command: 'generationStart',
                message: `🚀 Starting module generation...\n\n**Module:** "${moduleName}"\n**Odoo Version:** ${version}\n**Request:** "${prompt}"`,
                moduleName, version, timestamp: Date.now()
            });

            try {
                const { ensureDirectory } = await import('../../services/fileService.js');
                await ensureDirectory(folderUri);
                send({ command: 'generationMessage', sender: 'ai', text: '⚙️ Starting generation…', timestamp: Date.now() });

                const streamed = new Set<string>();
                let firstRevealDone = false;
                const openedDocs = new Set<string>();

                const writeNow = async (odooRelPath: string, content: string) => {
                    const relative = String(odooRelPath || '').replace(/^\/+/, '').replace(/^\.[/]/, '');
                    const { cleanDirs, cleanFile } = normalizeGeneratedPath(relative, moduleName);
                    if (cleanDirs.length > 0 && cleanFile === '__manifest__.py') { return; }
                    if (cleanDirs.length === 0 && !(cleanFile === '__init__.py' || cleanFile === '__manifest__.py')) {
                        const ext = (cleanFile.split('.').pop() || '').toLowerCase();
                        if (ext === 'py') cleanDirs.push('models');
                        else if (ext === 'xml') cleanDirs.push('views');
                        else if (ext === 'csv') cleanDirs.push('security');
                    }
                    const { ensureDirectory, writeFileContent } = await import('../../services/fileService.js');
                    const dirUri = cleanDirs.length ? vscode.Uri.joinPath(folderUri, ...cleanDirs) : folderUri;
                    await ensureDirectory(dirUri);
                    const fullPath = vscode.Uri.joinPath(dirUri, cleanFile);
                    await writeFileContent(fullPath, String(content));
                    try { await vscode.workspace.fs.stat(fullPath); } catch {}
                    const key = [...cleanDirs, cleanFile].join('/') || cleanFile;
                    streamed.add(key);
                    provider._view?.webview.postMessage({
                        command: 'fileGenerated', sender: 'ai',
                        text: `✅ Generated file: \`${key}\`\nFull path: \`${fullPath.fsPath}\``,
                        filePath: key, fileAbsolutePath: fullPath.fsPath,
                        timestamp: Date.now()
                    });
                    try {
                        if (!openedDocs.has(fullPath.fsPath)) {
                            const doc = await vscode.workspace.openTextDocument(fullPath);
                            await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
                            openedDocs.add(fullPath.fsPath);
                        }
                    } catch (openErr) {
                        provider._view?.webview.postMessage({
                            command: 'generationWarning', sender: 'ai',
                            text: `⚠️ Failed to open in editor: ${key} → ${String((openErr as Error)?.message || openErr)}`,
                            filePath: key, timestamp: Date.now()
                        });
                    }
                    if (!firstRevealDone) { firstRevealDone = true; }
                };

                const { generateOdooModule } = await import('../../ai/index.js');
                const result = await generateOdooModule(
                    prompt, version, moduleName, this.context,
                    { skipValidation: true },
                    (ev: any) => {
                        if (this.cancelChecker()) return;
                        provider._view?.webview.postMessage({ type: 'progress', ev });
                        try {
                            const t = String(ev?.type || '');
                            let text = '';
                            if (t === 'specs.ready') {
                                text = `Specifications generated: ${String(ev?.payload?.preview || '').substring(0, 300)}`;
                            } else if (t === 'tasks.ready') {
                                text = `Tasks generated: ${String(ev?.payload?.preview || '').substring(0, 300)}`;
                            } else if (t === 'menu.ready') {
                                text = `Menu structure generated: ${String(ev?.payload?.preview || '').substring(0, 300)}`;
                            } else if (t === 'files.count') {
                                text = `Found ${Number(ev?.payload?.count || 0)} file generation tasks`;
                            } else if (t === 'file.started') {
                                text = `Generating individual file: ${String(ev?.payload?.path || '')}`;
                            } else if (t === 'file.cleaned') {
                                const before = Number(ev?.payload?.before || 0);
                                const after = Number(ev?.payload?.after || 0);
                                const ext = String(ev?.payload?.ext || 'Other');
                                text = `cleanFileContent: Successfully processed ${before} -> ${after} characters (type: ${ext})`;
                            } else if (t === 'file.error') {
                                text = `File generation failed: ${String(ev?.payload?.path || '')}: ${String(ev?.payload?.error || '')}`;
                            } else if (t === 'file.ready') {
                                const p = String(ev?.payload?.path || '');
                                const c = String(ev?.payload?.content ?? '');
                                writeNow(p, c).catch(err => {
                                    try {
                                        provider._view?.webview.postMessage({
                                            command: 'generationWarning', sender: 'ai',
                                            text: `⚠️ Stream write failed for ${p}: ${String(err?.message || err)}`,
                                            filePath: p, timestamp: Date.now()
                                        });
                                    } catch {}
                                });
                            }
                            if (text) {
                                provider._view?.webview.postMessage({ command: 'generationMessage', sender: 'ai', text, timestamp: Date.now() });
                            }
                        } catch { }
                    },
                    () => this.cancelChecker()
                );
                
                const files = result.files || {};
                send({ command: 'generationMessage', sender: 'ai', text: '📋 **Step 2/6: Requirements**', timestamp: Date.now() });
                send({ command: 'generationMessage', sender: 'ai', text: '🔧 **Step 3/6: Technical Planning**', timestamp: Date.now() });
                send({ command: 'generationMessage', sender: 'ai', text: '🎨 **Step 4/6: UI Design**', timestamp: Date.now() });
                
                const fileCount = Object.keys(files).length;
                send({ command: 'generationMessage', sender: 'ai', text: `💻 **Step 5/6: Code Generation** - Creating ${fileCount} files...`, timestamp: Date.now(), fileCount });

                let written = 0;
                const announcedDirs = new Set<string>();
                
                for (const [filePath, content] of Object.entries(files)) {
                    if (this.cancelChecker()) {
                        send({ command: 'generationMessage', sender: 'ai', text: '⏹️ Module generation cancelled by user.', timestamp: Date.now() });
                        break;
                    }
                    try {
                        const relativePath = filePath.replace(/^\/+/, '').replace(/^\.\//, '');
                        const { cleanDirs, cleanFile } = normalizeGeneratedPath(relativePath, moduleName);
                        const key = [...cleanDirs, cleanFile].join('/') || cleanFile;
                        if (streamed.has(key)) continue;
                        
                        if (cleanDirs.length > 0 && cleanFile === '__manifest__.py') {
                            send({ command: 'generationWarning', sender: 'ai', text: `⚠️ Skipped nested manifest: ${relativePath}`, filePath: relativePath, timestamp: Date.now() });
                            continue;
                        }
                        
                        if (cleanDirs.length === 0 && !(cleanFile === '__init__.py' || cleanFile === '__manifest__.py')) {
                            const ext = (cleanFile.split('.').pop() || '').toLowerCase();
                            if (ext === 'py') cleanDirs.push('models');
                            else if (ext === 'xml') cleanDirs.push('views');
                            else if (ext === 'csv') cleanDirs.push('security');
                        }
                        
                        const { ensureDirectory, writeFileContent } = await import('../../services/fileService.js');
                        const dirUri = cleanDirs.length ? vscode.Uri.joinPath(folderUri, ...cleanDirs) : folderUri;
                        const dirPathFs = dirUri.fsPath;
                        if (!announcedDirs.has(dirPathFs)) {
                            await ensureDirectory(dirUri);
                            announcedDirs.add(dirPathFs);
                            send({ command: 'generationMessage', sender: 'ai', text: `📂 Ensured folder: \`${dirPathFs}\``, timestamp: Date.now() });
                        } else {
                            await ensureDirectory(dirUri);
                        }
                        
                        const fullPath = vscode.Uri.joinPath(dirUri, cleanFile);
                        const fullFsPath = fullPath.fsPath;
                        await writeFileContent(fullPath, String(content));
                        
                        try {
                            await vscode.workspace.fs.stat(fullPath);
                        } catch (verifyErr) {
                            send({ command: 'generationWarning', sender: 'ai', text: `⚠️ Verification failed for: \`${fullFsPath}\` → ${(verifyErr as Error).message}`, filePath: fullFsPath, timestamp: Date.now() });
                        }
                        
                        written++;
                        send({
                            command: 'fileGenerated',
                            sender: 'ai',
                            text: `✅ Generated file: \`${[...cleanDirs, cleanFile].join('/') || cleanFile}\`\nFull path: \`${fullFsPath}\``,
                            filePath: [...cleanDirs, cleanFile].join('/') || cleanFile,
                            fileAbsolutePath: fullFsPath,
                            progress: written,
                            total: fileCount,
                            timestamp: Date.now()
                        });
                        
                        try {
                            if (!openedDocs.has(fullFsPath)) {
                                const doc = await vscode.workspace.openTextDocument(fullPath);
                                await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
                                openedDocs.add(fullFsPath);
                            }
                        } catch (openErr) {
                            send({ command: 'generationWarning', sender: 'ai', text: `⚠️ Failed to open in editor: ${[...cleanDirs, cleanFile].join('/') || cleanFile} → ${String((openErr as Error)?.message || openErr)}`, filePath: fullFsPath, timestamp: Date.now() });
                        }
                        
                        if (!firstRevealDone) {
                            firstRevealDone = true;
                            try { await vscode.commands.executeCommand('revealInOS', folderUri); } catch { }
                            try { await vscode.commands.executeCommand('revealInExplorer', folderUri); } catch { }
                        }
                    } catch (err) {
                        const relativePath = (filePath || '').toString();
                        send({ command: 'generationWarning', sender: 'ai', text: `⚠️ Failed to create ${relativePath}: ${(err as Error).message}`, filePath: relativePath, timestamp: Date.now() });
                    }
                }

                const summaryMessage = `🎉 **Module Generation Complete!**\n\n**${moduleName}** module processed for Odoo ${version}.\n\n**Total Files Planned:** ${fileCount}\n**Successfully Created:** ${written}\n**📁 Base Folder:** \`${folderUri.fsPath}\``;
                send({ command: 'generationComplete', sender: 'ai', text: summaryMessage, modulePath: folderUri.fsPath, filesCreated: written, totalFiles: fileCount, timestamp: Date.now() });
                try { await vscode.commands.executeCommand('revealInExplorer', folderUri); } catch { }
            } catch (error) {
                const msg = (error as Error).message || String(error);
                if (msg.startsWith('Odoo validation failed:')) {
                    const reason = msg.replace(/^Odoo validation failed:\s*/, '').trim();
                    provider._view?.webview.postMessage({
                        command: 'generationMessage',
                        sender: 'ai',
                        text: `❗ Your request doesn't look like an Odoo module task.\n\nI can generate Odoo modules, models, views, menus, and related files.\n\nReason: ${reason}\n\nTry something like:\n- "Real estate management module with properties, owners, and leases"\n- "Sales commission module for Odoo 17 with rules and reports"\n- "Helpdesk module with SLA timers and email gateway"`,
                        timestamp: Date.now()
                    });
                    provider._view?.webview.postMessage({
                        command: 'generationMessage',
                        sender: 'ai',
                        text: 'Tip: Configure provider and model in Assista X Settings if needed (Command Palette → Assista X: Settings).',
                        timestamp: Date.now()
                    });
                } else {
                    provider._view?.webview.postMessage({ command: 'aiReply', text: `Error: ${msg}` });
                }
            }
            return true;
        }

        return false;
    }
}

