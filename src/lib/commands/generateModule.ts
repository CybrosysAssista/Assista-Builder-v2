/**
 * Command handler for generating Odoo modules
 */
import * as vscode from 'vscode';
import { AssistaXProvider } from '../webview/AssistaXProvider.js';
import { createActiveFileBroadcaster } from '../services/activeFile.js';

export function registerGenerateModuleCommand(
    context: vscode.ExtensionContext,
    provider: AssistaXProvider
): vscode.Disposable {
    const pushActiveFile = createActiveFileBroadcaster(provider, context);
    return vscode.commands.registerCommand('assistaX.generateOdooModule', async () => {
        const prompt = await vscode.window.showInputBox({
            prompt: 'e.g., "Real estate management with property listings")',
            placeHolder: 'Enter module description'
        });

        if (!prompt) { return; }

        const detectedVer = String(context.workspaceState.get('assistaX.odooVersion') || '17.0');
        const version = await vscode.window.showInputBox({
            prompt: 'Odoo version (e.g., 17.0)',
            value: detectedVer,
            placeHolder: '17.0'
        });
        if (!version) { return; }

        const moduleName = await vscode.window.showInputBox({
            prompt: 'Module name (snake_case, e.g., real_estate_management)',
            placeHolder: 'module_name'
        });
        if (!moduleName) { return; }

        const wsBase = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || './';
        const parentPick = await vscode.window.showOpenDialog({
            title: 'Select destination folder for the new module',
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false,
            openLabel: 'Select',
            defaultUri: vscode.Uri.file(wsBase)
        });
        if (!parentPick || !parentPick[0]) { return; }
        const parentUri = parentPick[0];
        const moduleRootUri = vscode.Uri.joinPath(parentUri, moduleName);

        try {
            // Focus the Assista X webview for in-sidebar progress UI
            await vscode.commands.executeCommand('assistaXView.focus');
            provider.resetCancel();
            provider.sendMessage({
                command: 'generationStart',
                message: `🚀 Starting module generation...\n\n**Module:** "${moduleName}"\n**Odoo Version:** ${version}\n**Request:** "${prompt}"\n\nI'll keep you updated on each step:`,
                moduleName,
                version,
                timestamp: Date.now(),
                inSidebar: true
            });

            // Step 1: Validation (message only)
            provider.sendMessage({ command: 'generationMessage', sender: 'ai', text: '🔍 **Step 1/6: Validating request**', timestamp: Date.now() });

            const { generateOdooModule } = await import('../ai.js');
            // Progress/cancel bridge: abort upstream generation when user presses Stop
            const progressCb = (event: { type: string; payload?: any }) => {
                if (provider.isCancelRequested()) {
                    throw new Error('cancelled');
                }
                // Optionally, surface lightweight progress chips in the sidebar
                const map: Record<string, string> = {
                    'validation.start': 'Validation started',
                    'validation.success': 'Validation success',
                    'validation.passed': 'Validation passed',
                    'specs.ready': 'Specs ready',
                    'tasks.ready': 'Tasks ready',
                    'menu.ready': 'Menu ready',
                    'file.started': 'Generating ' + (event.payload?.path || ''),
                    'file.done': 'Generated ' + (event.payload?.path || ''),
                    'file.empty': 'Skipped (empty) ' + (event.payload?.path || ''),
                    'file.error': 'Failed ' + (event.payload?.path || '')
                };
                provider.sendMessage({ command: 'generationMessage', sender: 'ai', text: `<span class="chip">${map[event.type] || event.type}</span>`, timestamp: Date.now() });

                // Forward Dev-main style planning messages to webview (no settings toggle)
                try {
                    const t = String(event?.type || '');
                    if (t === 'tasks.ready') {
                        provider.sendMessage({ command: 'planReset' });
                        provider.sendMessage({ command: 'planSection', section: 'tasks', markdown: String(event?.payload?.preview || '') });
                    } else if (t === 'specs.ready') {
                        provider.sendMessage({ command: 'planSection', section: 'requirements', markdown: String(event?.payload?.preview || '') });
                    } else if (t === 'menu.ready') {
                        provider.sendMessage({ command: 'planSection', section: 'menu', markdown: String(event?.payload?.preview || '') });
                    } else if (t === 'files.count') {
                        provider.sendMessage({ command: 'planProgress', total: Number(event?.payload?.count || 0), done: 0 });
                    } else if (t === 'file.done') {
                        provider.sendMessage({ command: 'planProgress', inc: 1, path: String(event?.payload?.path || '') });
                    }
                } catch {}
            };
            const result = await generateOdooModule(
                prompt,
                version,
                moduleName,
                context,
                undefined,
                (ev: any) => {
                    if (provider.isCancelRequested()) return;
                    progressCb(ev);
                    // Forward key progress events to sidebar as chat bubbles (command flow)
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
                        }
                        if (text) {
                            provider.sendMessage({ command: 'generationMessage', sender: 'ai', text, timestamp: Date.now() });
                        } else if (t) {
                            provider.sendMessage({ command: 'generationMessage', sender: 'ai', text: `<span class="chip">${t}</span>`, timestamp: Date.now() });
                        }
                    } catch { }
                },
                () => provider.isCancelRequested()
            );
            const files = result.files || {};
            const progressInfo = result.progressInfo || {};

            // Step 2-4: Messages only
            provider.sendMessage({ command: 'generationMessage', sender: 'ai', text: '📋 **Step 2/6: Requirements**', timestamp: Date.now() });
            provider.sendMessage({ command: 'generationMessage', sender: 'ai', text: '🔧 **Step 3/6: Technical Planning**', timestamp: Date.now() });
            provider.sendMessage({ command: 'generationMessage', sender: 'ai', text: '🎨 **Step 4/6: UI Design**', timestamp: Date.now() });

            // Step 5: File writes with cancel support
            const totalFiles = Object.keys(files).length;
            provider.sendMessage({ command: 'generationMessage', sender: 'ai', text: `💻 **Step 5/6: Code Generation** - Creating ${totalFiles} files...`, timestamp: Date.now(), fileCount: totalFiles });
            let written = 0;
            for (const [filePath, content] of Object.entries(files)) {
                if (provider.isCancelRequested()) {
                    provider.sendMessage({ command: 'generationMessage', sender: 'ai', text: '⏹️ Module generation cancelled by user.', timestamp: Date.now() });
                    break;
                }
                try {
                    // Normalize and sanitize the incoming path
                    let relativePath = String(filePath || '')
                        .replace(/\\/g, '/')
                        .replace(/^\/+/, '')
                        .replace(/^\.\//, '');
                    // Strip any repeated leading "<moduleName>/" to avoid nested paths like
                    // "module/module/models/...". Keep removing until clean.
                    try {
                        const prefix = `${moduleName}/`;
                        while (relativePath.startsWith(prefix)) {
                            relativePath = relativePath.slice(prefix.length);
                        }
                        // Defensive: if the first segment equals moduleName (case-insensitive), drop it
                        const probeSegs = relativePath.split('/').filter(Boolean);
                        if (probeSegs.length && probeSegs[0].toLowerCase() === moduleName.toLowerCase()) {
                            probeSegs.shift();
                            relativePath = probeSegs.join('/');
                        }
                    } catch { }
                    // Guard against parent escapes
                    if (relativePath.includes('..')) {
                        provider.sendMessage({ command: 'generationWarning', sender: 'ai', text: `⚠️ Skipped unsafe path: ${relativePath}`, filePath: relativePath, timestamp: Date.now() });
                        continue;
                    }
                    // Sanitize each segment: trim whitespace and replace spaces with underscores
                    let segments = relativePath
                        .split('/')
                        .map(s => s.trim().replace(/\s+/g, '_'))
                        .filter(Boolean);
                    const fileName = segments.pop() || relativePath;

                    // Enforce structure at write-time
                    const allowedTop = new Set(['models','views','security','data','report','wizards','static']);
                    // If AI added an extra wrapper (e.g., "estate/models/..."), drop the first segment
                    if (segments.length >= 2 && !allowedTop.has(String(segments[0])) && allowedTop.has(String(segments[1]))) {
                        segments.shift();
                    }
                    // After potential shift, compute top/atRoot
                    let top = segments[0];
                    const atRoot = segments.length === 0;
                    // Block any nested manifest (e.g., models/__manifest__.py)
                    if (!atRoot && fileName === '__manifest__.py') {
                        provider.sendMessage({ command: 'generationWarning', sender: 'ai', text: `⚠️ Skipped nested manifest: ${relativePath}`, filePath: relativePath, timestamp: Date.now() });
                        continue;
                    }
                    // Root-level files allowed only for __manifest__.py and __init__.py
                    if (atRoot && !(fileName === '__manifest__.py' || fileName === '__init__.py')) {
                        provider.sendMessage({ command: 'generationWarning', sender: 'ai', text: `⚠️ Skipped invalid root file: ${relativePath}`, filePath: relativePath, timestamp: Date.now() });
                        continue;
                    }
                    // If not root and top-level is invalid, try to remap based on extension
                    if (!atRoot && !allowedTop.has(String(top || ''))) {
                        const ext = (fileName.split('.').pop() || '').toLowerCase();
                        if (ext === 'py') {
                            segments = ['models', ...segments];
                        } else if (ext === 'xml') {
                            segments = ['views', ...segments];
                        } else if (ext === 'csv') {
                            segments = ['security', ...segments];
                        } else if (fileName === '__manifest__.py' || fileName === '__init__.py') {
                            // Move special files to root
                            segments = [];
                        } else {
                            provider.sendMessage({ command: 'generationWarning', sender: 'ai', text: `⚠️ Skipped invalid top-level directory: ${relativePath}`, filePath: relativePath, timestamp: Date.now() });
                            continue;
                        }
                        top = segments[0];
                    }
                    // Dir-specific basic checks
                    if (top === 'models' && !/\.py$/i.test(fileName) && fileName !== '__init__.py') {
                        provider.sendMessage({ command: 'generationWarning', sender: 'ai', text: `⚠️ Skipped non-Python file in models/: ${relativePath}`, filePath: relativePath, timestamp: Date.now() });
                        continue;
                    }
                    if (top === 'views' && !/\.xml$/i.test(fileName)) {
                        provider.sendMessage({ command: 'generationWarning', sender: 'ai', text: `⚠️ Skipped non-XML file in views/: ${relativePath}`, filePath: relativePath, timestamp: Date.now() });
                        continue;
                    }
                    if (top === 'security' && !/\.(csv|xml)$/i.test(fileName)) {
                        provider.sendMessage({ command: 'generationWarning', sender: 'ai', text: `⚠️ Skipped invalid file in security/: ${relativePath}`, filePath: relativePath, timestamp: Date.now() });
                        continue;
                    }
                    const dirUri = segments.length ? vscode.Uri.joinPath(moduleRootUri, ...segments) : moduleRootUri;
                    await vscode.workspace.fs.createDirectory(dirUri);
                    const fullPath = vscode.Uri.joinPath(dirUri, fileName);
                    await vscode.workspace.fs.writeFile(fullPath, Buffer.from(String(content), 'utf8'));
                    written++;
                    provider.sendMessage({ command: 'fileGenerated', sender: 'ai', text: `✅ ${relativePath}`, filePath: relativePath, progress: written, total: totalFiles, timestamp: Date.now() });
                } catch (writeError) {
                    provider.sendMessage({ command: 'generationWarning', sender: 'ai', text: `⚠️ Failed to create ${filePath}: ${(writeError as Error).message}`, filePath, timestamp: Date.now() });
                }
            }

            // Step 6: Completion
            const summaryMessage = `🎉 **Module Generation Complete!**\n\n**${moduleName}** for Odoo ${version}.\n**Total Files:** ${totalFiles}\n**Created:** ${written}\n**📁 Location:** \`${moduleRootUri.fsPath}\``;
            provider.sendMessage({ command: 'generationComplete', sender: 'ai', text: summaryMessage, modulePath: moduleRootUri.fsPath, filesCreated: written, totalFiles: totalFiles, timestamp: Date.now() });
            // Show the in-sidebar action bar only if generation started from Welcome → Generate New Project
            try {
                if ((provider as any)._fromWelcomeGenerate) {
                    provider.sendMessage({ command: 'postGenActions', modulePath: moduleRootUri.fsPath, moduleName });
                    (provider as any)._fromWelcomeGenerate = false; // reset
                }
            } catch {}

            // Post-generation choice: continue generating or switch to Edit Existing Module for this session
            // Small delay to avoid being swallowed by focus changes after file opens
            await new Promise(res => setTimeout(res, 1000));
            try {
                console.log('[Assista X] Showing post-generation choice prompt…');
                provider.sendMessage({ command: 'generationMessage', sender: 'system', text: 'Next step: Edit existing module or generate another?', timestamp: Date.now() });
            } catch { }
            // Prefer QuickPick first (most visible and sticky)
            console.log('[Assista X] Showing QuickPick choice…');
            const firstPick = await vscode.window.showQuickPick([
                { label: 'Edit Existing Module', description: 'Switch this session to Edit mode for the generated module' },
                { label: 'Generate Another', description: 'Start a new generation workflow' },
            ], {
                placeHolder: 'Module generated. Choose next action',
                ignoreFocusOut: true,
            });
            let nextAction = firstPick?.label as any;

            // Non-modal notification next
            if (!nextAction) {
                console.log('[Assista X] QuickPick returned undefined, showing non-modal choice notification…');
                nextAction = await vscode.window.showInformationMessage(
                    'Module generated. Choose next action:',
                    'Edit Existing Module',
                    'Generate Another'
                );
            }
            // Backup: show modal if non-modal returned undefined
            if (!nextAction) {
                console.log('[Assista X] Non-modal returned undefined, showing modal…');
                nextAction = await vscode.window.showInformationMessage(
                    'Module generated. What would you like to do next?',
                    { modal: true, detail: `Module: ${moduleName} (Odoo ${version})\nLocation: ${moduleRootUri.fsPath}` },
                    'Edit Existing Module',
                    'Generate Another'
                );
            }
            // (QuickPick already attempted first)

            // Final fallback: if still no selection, render in-webview action buttons
            if (!nextAction) {
                try {
                    provider.sendMessage({ command: 'postGenActions', modulePath: moduleRootUri.fsPath, moduleName });
                    const html = `
                      <div>
                        <strong>What would you like to do next?</strong>
                        <div style="margin-top:8px; display:flex; gap:8px; flex-wrap:wrap;">
                          <button data-action="edit" style="padding:6px 10px;">Edit Existing Module</button>
                          <button data-action="generate" style="padding:6px 10px;">Generate Another</button>
                        </div>
                        <div style="margin-top:6px; color:var(--vscode-descriptionForeground)">Module: ${moduleName} &nbsp;|&nbsp; Location: ${moduleRootUri.fsPath}</div>
                      </div>`;
                    provider.sendMessage({ command: 'aiReplyHtml', html, timestamp: Date.now() });
                } catch { }
            }

            // Auto re-prompt up to 2 times if still no selection (non-modal) to make it unavoidable
            if (!nextAction) {
                for (let attempt = 1; attempt <= 2 && !nextAction; attempt++) {
                    try {
                        console.log(`[Assista X] Re-prompt attempt #${attempt} (non-modal notification)…`);
                        await new Promise(r => setTimeout(r, 1200));
                        nextAction = await vscode.window.showInformationMessage(
                            'Module generated. Choose next action:',
                            'Edit Existing Module',
                            'Generate Another'
                        );
                    } catch { }
                }
            }

            if (nextAction === 'Edit Existing Module') {
                console.log('[Assista X] User chose: Edit Existing Module');
                // If generated folder is not in workspace, offer to add it so edit scanners can find it
                try {
                    const inWs = (vscode.workspace.workspaceFolders || []).some(f => moduleRootUri.fsPath.startsWith(f.uri.fsPath + require('path').sep));
                    if (!inWs) {
                        const addPick = await vscode.window.showInformationMessage(
                            'The generated module folder is not in the current workspace. Add it to the workspace for best editing experience?',
                            'Add Folder',
                            'Skip'
                        );
                        if (addPick === 'Add Folder') {
                            vscode.workspace.updateWorkspaceFolders((vscode.workspace.workspaceFolders || []).length, 0, { uri: moduleRootUri });
                            await new Promise(r => setTimeout(r, 200));
                        }
                    }
                } catch { }
                // Switch UI into Edit mode and initialize edit context using the existing command
                try { await vscode.commands.executeCommand('assistaXView.focus'); } catch { }
                try { provider.sendMessage({ command: 'switchMode', mode: 'edit', keepSession: true }); } catch { }
                // Reuse the existing scanner which sends editStart/editReady/editContext and restricts scope
                try { await vscode.commands.executeCommand('assistaX.editOdooProject'); } catch { }
                // Ensure active file context is pushed (in case newly opened files need to be reflected)
                try { await pushActiveFile(); } catch { }
            } else if (nextAction === 'Generate Another') {
                console.log('[Assista X] User chose: Generate Another');
                // Loop back into the same workflow to create another module
                try { await vscode.commands.executeCommand('assistaX.generateOdooModule'); } catch { }
            } else {
                console.log('[Assista X] Post-generation choice dismissed or no selection. Staying on current view.');
            }
        } catch (error) {
            if ((error as Error).message.includes('cancelled')) {
                vscode.window.showWarningMessage('Module generation cancelled.');
            } else {
                const errorMsg = (error as Error).message;
                // Special handling: request is not recognized as an Odoo module task
                if (errorMsg.startsWith('Odoo validation failed:')) {
                    const reason = errorMsg.replace(/^Odoo validation failed:\s*/, '').trim();
                    // Surface a friendly, actionable message inside the Assista X sidebar
                    provider.sendMessage({
                        command: 'generationMessage',
                        sender: 'ai',
                        text: `❗ Your request doesn't look like an Odoo module task.\n\nI can generate Odoo modules, models, views, menus, and related files.\n\nReason: ${reason}\n\nTry something like:\n- "Real estate management module with properties, owners, and leases"\n- "Sales commission module for Odoo 17 with rules and reports"\n- "Helpdesk module with SLA timers and email gateway"`,
                        timestamp: Date.now()
                    });
                    // Also add a subtle hint to open settings if the user needs providers
                    provider.sendMessage({
                        command: 'generationMessage',
                        sender: 'ai',
                        text: 'Tip: Configure provider and model in Assista X Settings if needed (Command Palette → Assista X: Settings).',
                        timestamp: Date.now()
                    });
                } else if (errorMsg.includes('503') || errorMsg.includes('overloaded') || errorMsg.includes('Google API')) {
                    vscode.window.showErrorMessage(`API Overload Error: ${errorMsg}. Switch to OpenRouter in Assista X settings (Ctrl+Shift+P → Assista X: Settings) and retry.`);
                } else {
                    vscode.window.showErrorMessage(`Failed to generate module: ${errorMsg}. Check Developer Console (Help → Toggle Developer Tools) for details.`);
                }
            }
        }
    });
}
