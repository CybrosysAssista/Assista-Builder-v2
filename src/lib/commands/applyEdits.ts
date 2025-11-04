/**
 * Command handler for applying edits from prompt
 */
import * as vscode from 'vscode';
import { AssistaXProvider } from '../webview/AssistaXProvider.js';
import { createActiveFileBroadcaster } from '../services/activeFile.js';

export function registerApplyEditsCommand(
    context: vscode.ExtensionContext,
    provider: AssistaXProvider
): vscode.Disposable {
    const pushActiveFile = createActiveFileBroadcaster(provider, context);
    return vscode.commands.registerCommand('assistaX.applyEditsFromPrompt', async (...args:any[]) => {
        try {
            const injected = (args && args[0]) ? args[0] : undefined;
            let userPrompt: string | undefined = injected?.userPrompt || injected?.text;
            if (!userPrompt) {
                // Fallback input if not provided by the sidebar
                userPrompt = await vscode.window.showInputBox({
                    title: 'Assista X — Edit Existing Files Only',
                    prompt: 'Describe the change (e.g., "Add Many2one field company_id to the current model and include it in the form view")',
                    placeHolder: 'Your edit prompt',
                    ignoreFocusOut: true
                }) || undefined;
            }
            if (!userPrompt) { return; }

            // Ensure view is focused and switch webview to Edit mode immediately
            try { await vscode.commands.executeCommand('assistaXView.focus'); } catch {}
            try { provider.sendMessage({ command: 'switchMode', mode: 'edit', keepSession: true }); } catch {}
            // Immediately post the active file info directly (redundant with pushActiveFile) so chip shows even if retries race
            try {
                const ed = vscode.window.activeTextEditor;
                if (ed && ed.document && ed.document.uri) {
                    const uri = ed.document.uri;
                    const fileName = require('path').basename(uri.fsPath);
                    const languageId = ed.document.languageId || '';
                    let curDir = require('path').dirname(uri.fsPath);
                    const wsRoots = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
                    let moduleRootPath: string | null = null;
                    while (curDir && wsRoots.some(w => curDir.startsWith(w))) {
                        try {
                            const probe = vscode.Uri.file(require('path').join(curDir, '__manifest__.py'));
                            await vscode.workspace.fs.stat(probe);
                            moduleRootPath = curDir;
                            break;
                        } catch { /* keep climbing */ }
                        const parent = require('path').dirname(curDir);
                        if (parent === curDir) break;
                        curDir = parent;
                    }
                    provider.sendMessage({ command: 'activeFile', fileName, fullPath: uri.fsPath, languageId, moduleRoot: moduleRootPath, timestamp: Date.now() });
                } else {
                    provider.sendMessage({ command: 'activeFile', fileName: null, fullPath: null, languageId: null, moduleRoot: null, timestamp: Date.now() });
                }
            } catch {}
            // Proactively push current active file chip; schedule a few retries to cover webview init
            try {
                const attempt = () => pushActiveFile().catch(() => undefined);
                attempt();
                setTimeout(attempt, 250);
                setTimeout(attempt, 800);
            } catch {}
            // Show animated status bubble instead of a static analyzing message
            provider.sendMessage({ command: 'statusBubble', action: 'show', label: 'Analyzing' });

            const exclude = '**/{.git,node_modules,venv,env,dist,build,\\.venv,\\.env}/**';

            // Determine module root from active file, falling back to manifest climb
            const activeUri = vscode.window.activeTextEditor?.document.uri;
            let moduleRoot: vscode.Uri | undefined;
            const path = require('path');
            if (activeUri) {
                const wsRoots = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
                let curDir = path.dirname(activeUri.fsPath);
                while (curDir && wsRoots.some(w => curDir.startsWith(w))) {
                    try {
                        const probe = vscode.Uri.file(path.join(curDir, '__manifest__.py'));
                        await vscode.workspace.fs.stat(probe);
                        moduleRoot = vscode.Uri.file(curDir);
                        break;
                    } catch { /* keep climbing */ }
                    const parent = path.dirname(curDir);
                    if (parent === curDir) break;
                    curDir = parent;
                }
                if (!moduleRoot) {
                    const manifests = await vscode.workspace.findFiles('**/__manifest__.py', exclude, 100);
                    const roots = manifests.map(u => vscode.Uri.joinPath(u, '..'));
                    const inside = roots.find(r => activeUri.fsPath.startsWith(r.fsPath + path.sep));
                    moduleRoot = inside || roots[0];
                }
            }
            if (!moduleRoot) {
                provider.sendMessage({ command: 'aiReply', text: 'Assista X: No module root could be determined. Open a module file and retry.' });
                return;
            }

            // Build candidate files: open editors first, then entire module
            const rel = new vscode.RelativePattern(moduleRoot, '**/*');
            const all = await vscode.workspace.findFiles(rel, exclude, 5000);
            // Use module-relative identifiers like `${moduleName}/path/inside` so it works outside workspace
            const moduleName = path.basename(moduleRoot.fsPath);
            const toModuleRel = (u: vscode.Uri) => {
                const pth = require('path');
                const rp = pth.relative(moduleRoot.fsPath, u.fsPath).replace(/\\/g, '/');
                return (moduleName + '/' + rp).replace(/\/+/, '/');
            };
            const allRel = new Set(all.map(toModuleRel));
            const sep = path.sep;
            const openRel = vscode.window.visibleTextEditors
                .map(e => e.document.uri)
                .filter(u => u.fsPath.startsWith(moduleRoot.fsPath + sep))
                .map(toModuleRel);

            const version = String(context.workspaceState.get('assistaX.odooVersion') || '17.0');

            // Ask AI to select relevant files strictly from existing list
            const { generateContent } = await import('../ai.js');
            const { createFileSelectionForModificationPrompt, createModificationRequirementsPrompt, createModificationTasksPrompt, createFileContentForModificationPrompt } = await import('../prompts.js');

            // Prioritize the active file first, then other open files, then rest of module
            let activeRel: string | undefined;
            if (activeUri && activeUri.fsPath.startsWith(moduleRoot.fsPath + path.sep)) {
                activeRel = toModuleRel(activeUri);
            }
            const order: string[] = [];
            if (activeRel) order.push(activeRel);
            for (const r of openRel) if (!order.includes(r)) order.push(r);
            for (const r of Array.from(allRel)) if (!order.includes(r)) order.push(r);
            const allRelOrdered = order;
            const selectPrompt = createFileSelectionForModificationPrompt(userPrompt, version, allRelOrdered, moduleName) + '\n\nSTRICT: Do not propose new files. Return only paths from the list.';
            const selectionRaw = await generateContent({ contents: selectPrompt, config: { mode: 'edit', responseMimeType: 'application/json' } }, context);
            let selected: string[] = [];
            try {
                const parsed = JSON.parse(selectionRaw);
                if (Array.isArray(parsed)) selected = parsed.filter(p => typeof p === 'string');
            } catch { /* fall through */ }
            // Filter to existing only
            selected = selected.filter(p => allRel.has(p));

            if (!selected.length) {
                if (activeRel && allRel.has(activeRel)) {
                    selected = [activeRel];
                } else {
                    provider.sendMessage({ command: 'aiReply', text: 'No existing files were selected. Tip: open the target file(s) and retry the edit.' });
                    return;
                }
            }

            // Read selected files and derive requirements/tasks
            const filesContent: Record<string, string> = {};
            for (const relPath of selected) {
                try {
                    let uri: vscode.Uri;
                    if (relPath.startsWith(moduleName + '/')) {
                        uri = vscode.Uri.joinPath(moduleRoot, relPath.substring(moduleName.length + 1));
                    } else {
                        uri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, relPath);
                    }
                    const buf = await vscode.workspace.fs.readFile(uri);
                    filesContent[relPath] = Buffer.from(buf).toString('utf8');
                } catch { /* skip unreadable */ }
            }

            const reqPrompt = createModificationRequirementsPrompt(userPrompt, version, filesContent, moduleName);
            const requirements = await generateContent({ contents: reqPrompt, config: { mode: 'edit' } }, context);

            const tasksPrompt = createModificationTasksPrompt(requirements, version, filesContent, moduleName) + '\n\nRULE: Do not create new files. Only modify the listed existing files.';
            const tasks = await generateContent({ contents: tasksPrompt, config: { mode: 'edit' } }, context);

            // Plan-first confirmation (Sidebar)
            // Extract target file paths from tasks (backticked paths)
            const planFileRegex = /`([^`]+\.[a-zA-Z0-9_]+)`/g;
            const planTargetsSet = new Set<string>();
            let mm: RegExpExecArray | null;
            while ((mm = planFileRegex.exec(tasks)) !== null) {
                const rel = mm[1].replace(/^\.?\/?/, '').replace(/\\/g, '/');
                if (rel) planTargetsSet.add(rel);
            }
            // Normalize to module-scoped targets and add fallbacks if plan omitted them
            let planTargets = Array.from(planTargetsSet)
                .map(s => s.replace(/^\.?\/?/, '').replace(/\\/g, '/'))
                .filter(p => p.startsWith(moduleName + '/'))
                .map(p => p.replace(/\/\/+/, '/'));
            if (!planTargets.length) {
                if (selected.length) planTargets = selected.slice();
                else if (activeRel) planTargets = [activeRel];
            }
            // Classify existing vs missing using the previously computed allRel set
            const existingInPlan: string[] = [];
            const missingInPlan: string[] = [];
            for (const rel of planTargets) {
                if (allRel.has(rel)) existingInPlan.push(rel); else missingInPlan.push(rel);
            }

            // Compose a more descriptive plan message with brief analysis and fix steps
            const summarize = (text: string, limit = 500) => {
                const t = (text || '').toString().trim();
                if (!t) return '';
                const clean = t.replace(/```[\s\S]*?```/g, '').replace(/\n{3,}/g, '\n\n');
                return clean.length > limit ? (clean.slice(0, limit).trim() + '…') : clean;
            };
            const bulletsFrom = (text: string, max = 6) => {
                const lines = (text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                const bulletLike = lines.filter(l => /^[-*\d+\.]/.test(l) || /^(Step\s*\d+\:)/i.test(l));
                const picked = (bulletLike.length ? bulletLike : lines).slice(0, max);
                return picked.map(l => `- ${l.replace(/^[-*\d+\.\s]*/, '')}`).join('\n');
            };
            const analysis = summarize(requirements || '', 600);
            const steps = bulletsFrom(tasks || '', 8);
            const filesToEditBlock = existingInPlan.length
                ? ['```text', ...existingInPlan, '```'].join('\n')
                : '(none)';
            const filesToCreateBlock = missingInPlan.length
                ? ['```text', ...missingInPlan, '```'].join('\n')
                : '';

            const planHtml = (
                () => {
                    const esc = (s: string) => String(s || '').replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c] as string));
                    // Strip markdown noise: bullets, bold, headings, checkboxes; keep inline code which we'll convert to <code>
                    const stripMd = (s: string) => String(s || '')
                        // remove bold markers
                        .replace(/\*\*(.*?)\*\*/g, '$1')
                        // remove leading bullets (-,*,+, numbers, unicode bullets)
                        .replace(/^\s{0,3}[-*+]\s+/gm, '')
                        .replace(/^\s{0,3}\d+\.\s+/gm, '')
                        .replace(/^\s{0,3}[•–—]\s+/gm, '')
                        // remove checkboxes
                        .replace(/\[\s?[xX]?\]\s*/g, '')
                        // remove heading markers
                        .replace(/^\s{0,3}#{1,6}\s+/gm, '')
                        // collapse lone asterisks surrounded by spaces (e.g., ' * ')
                        .replace(/\s\*\s/g, ' ')
                        .trim();
                    const toInlineHtml = (s: string) => esc(s).replace(/`([^`]+)`/g, '<code>$1</code>');
                    // Problem summary paragraph
                    const ana = stripMd(analysis);
                    const para = ana
                        ? `<p>${toInlineHtml(ana).replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>')}</p>`
                        : `<p>Will analyze the referenced file(s) to identify the exact mistake before applying changes.</p>`;
                    // Steps bullets (clean each line, drop empties)
                    const stepLines = (steps ? steps.split(/\r?\n/) : ['Update the targeted file(s) with minimal, safe changes.'])
                        .map(l => stripMd(l))
                        .map(l => l.trim())
                        .filter(Boolean);
                    const stepItems = stepLines
                        .map(li => `<li>${toInlineHtml(li)}</li>`)
                        .join('');
                    const filesEdit = existingInPlan.length ? esc(existingInPlan.join('\n')) : '(none)';
                    const filesCreate = missingInPlan.length ? esc(missingInPlan.join('\n')) : '';
                    return `
                        <div>
                          <h3 style="margin:0 0 6px;">Plan to fix the issue</h3>
                          <div style="margin:6px 0;"><strong>Problem summary</strong>${para}</div>
                          <div style="margin:6px 0;"><strong>How I will solve it</strong><ul style="margin:6px 0 0 16px;">${stepItems}</ul></div>
                          <div style="margin:8px 0 4px;"><strong>Files to edit (${existingInPlan.length})</strong></div>
                          <pre style="margin:0; white-space:pre-wrap; word-break:break-word; overflow:auto; max-width:100%; box-sizing:border-box; background: var(--vscode-editorWidget-background); border:1px solid var(--vscode-panel-border); border-radius:6px; padding:6px;"><code>${filesEdit}</code></pre>
                          ${missingInPlan.length ? `<div style="margin:8px 0 4px;"><strong>Files to create (${missingInPlan.length})</strong></div><pre style="margin:0; white-space:pre-wrap; word-break:break-word; overflow:auto; max-width:100%; box-sizing:border-box; background: var(--vscode-editorWidget-background); border:1px solid var(--vscode-panel-border); border-radius:6px; padding:6px;"><code>${filesCreate}</code></pre>` : ''}
                        </div>
                    `;
                }
            )();

            // Defensive: if we failed to compute a readable plan, do not ask to proceed
            const reqOk = typeof requirements === 'string' && requirements.trim().length > 0;
            const tasksOk = typeof tasks === 'string' && tasks.trim().length > 0;
            if (!reqOk && !tasksOk) {
                provider.sendMessage({ command: 'aiReply', text: 'Assista X: Could not build a plan for this edit. Please refine your request or ensure the target files are open.' });
                provider.sendMessage({ command: 'statusBubble', action: 'hide' });
                return;
            }

            // Cache latest plan for potential webview resend requests
            try {
                (provider as any)._lastPlan = {
                    requirements,
                    tasks,
                    existingInPlan,
                    missingInPlan,
                    userPrompt,
                    version,
                    ts: Date.now()
                };
                // Persist to workspace state as a fallback (covers scope mismatches)
                await context.workspaceState.update('assistaX.lastPlan', (provider as any)._lastPlan);
            } catch {}

            // Send both a human-readable reply bubble and structured plan sections
            try { provider.sendMessage({ command: 'aiReplyHtml', html: planHtml, kind: 'plan', timestamp: Date.now() }); } catch {}
            try { provider.sendMessage({ command: 'planReset', timestamp: Date.now() }); } catch {}
            if (reqOk) { try { provider.sendMessage({ command: 'planSection', section: 'requirements', markdown: requirements, timestamp: Date.now() }); } catch {} }
            if (tasksOk) { try { provider.sendMessage({ command: 'planSection', section: 'tasks', markdown: tasks, timestamp: Date.now() }); } catch {} }
            // Legacy compact path for older webview code (kept for safety)
            try { provider.sendMessage({ command: 'showPlan', requirements, tasks, existingFiles: existingInPlan, newFiles: missingInPlan, timestamp: Date.now() }); } catch {}

            // Only now show compact confirm bar (Proceed / Cancel) under the chat input
            // Small delay to ensure webview renders plan before confirm arrives
            try { await new Promise(res => setTimeout(res, 120)); } catch {}
            provider.sendMessage({ command: 'confirmApplyPlan', prompt: userPrompt, detectedVersion: version });

            // Await sidebar confirmation (fallback: if webview does not confirm within a short time, show a modal)
            let approved = false;
            let allowCreate = false;
            try {
                const decision = await provider.waitForPlanConfirmation(45_000); // 45s timeout
                approved = !!decision?.approved;
                allowCreate = !!decision?.allowCreate;
            } catch {
                // If no sidebar confirmation arrived, cancel without VS Code notifications and inform in the sidebar only
                provider.sendMessage({ command: 'aiReply', text: 'Assista X: Plan confirmation timed out or was not received. Edit cancelled.' });
                return;
            }
            if (!approved) {
                provider.sendMessage({ command: 'aiReply', text: 'Edit cancelled by user before generation.', timestamp: Date.now() });
                provider.sendMessage({ command: 'statusBubble', action: 'hide' });
                provider.sendMessage({ command: 'generationComplete' });
                return;
            }

            // Switch status to Generating now that we are applying changes
            provider.sendMessage({ command: 'statusBubble', action: 'show', label: 'Generating' });

            // Determine final list of targets to process based on plan and allowCreate
            let finalPlanTargets = existingInPlan.slice();
            if (allowCreate) {
                finalPlanTargets = existingInPlan.concat(missingInPlan);
            }
            // Hard fallback: if still empty, but active file is inside module, process that one
            if (!finalPlanTargets.length && activeRel && allRel.has(activeRel)) {
                finalPlanTargets = [activeRel];
            }
            if (!finalPlanTargets.length) {
                provider.sendMessage({ command: 'aiReply', text: 'No existing files selected to edit. Nothing to do.', timestamp: Date.now() });
                provider.sendMessage({ command: 'statusBubble', action: 'hide' });
                provider.sendMessage({ command: 'generationComplete' });
                return;
            }

            // Diagnostic: show which targets we will apply
            try {
                provider.sendMessage({ command: 'generationMessage', sender: 'system', text: `Targets selected: ${finalPlanTargets.join(', ')}`, timestamp: Date.now() });
            } catch {}

            // For each selected file, generate updated content (always passing existing content)
            let applied = 0;
            const editedPaths: string[] = [];
            for (const relPath of finalPlanTargets) {
                // Ensure we have current content even if it wasn't pre-read
                let existing = filesContent[relPath] ?? '';
                if (!existing && relPath.startsWith(moduleName + '/')) {
                    try {
                        const targetUri = vscode.Uri.joinPath(moduleRoot, relPath.substring(moduleName.length + 1));
                        const buf = await vscode.workspace.fs.readFile(targetUri);
                        existing = Buffer.from(buf).toString('utf8');
                        filesContent[relPath] = existing;
                    } catch { /* leave empty if unreadable */ }
                }
                if (!existing) continue;
                const singlePrompt = createFileContentForModificationPrompt(requirements, tasks, version, moduleName, relPath, existing) + '\n\nINSTRUCTION: Edit the provided content in-place. Do not add unrelated code. Do not create new files.';
                const updated = await generateContent({ contents: singlePrompt, config: { mode: 'edit' } }, context);

                try {
                    let targetUri: vscode.Uri;
                    if (relPath.startsWith(moduleName + '/')) {
                        targetUri = vscode.Uri.joinPath(moduleRoot, relPath.substring(moduleName.length + 1));
                    } else {
                        targetUri = vscode.Uri.joinPath(vscode.workspace.workspaceFolders![0].uri, relPath);
                    }
                    await vscode.workspace.fs.stat(targetUri); // ensure exists
                    await vscode.workspace.fs.writeFile(targetUri, Buffer.from(updated, 'utf8'));
                    applied++;
                    editedPaths.push(relPath);
                    try { await vscode.window.showTextDocument(targetUri, { preview: false, preserveFocus: true }); } catch {}
                    provider.sendMessage({ command: 'generationMessage', sender: 'ai', text: `Edited: ${relPath}`, timestamp: Date.now() });
                } catch {
                    provider.sendMessage({ command: 'generationWarning', sender: 'ai', text: `Skipped non-existent or unwritable file: ${relPath}`, timestamp: Date.now() });
                }
            }

            if (!applied) {
                provider.sendMessage({ command: 'aiReply', text: 'Assista X: No edits were applied. Ensure the target files are open and inside a module, then retry.' });
            } else {
                provider.sendMessage({ command: 'aiReply', text: `Assista X: Applied edits to ${applied} file(s).` });
            }
            // Done applying edits — hide the in-chat Generating indicator
            provider.sendMessage({ command: 'statusBubble', action: 'hide' });
            // Post a compact summary in the sidebar chat
            try {
                // Derive brief "what changed" lines from the planned tasks text
                const sanitizeLine = (s: string) => String(s || '')
                    .replace(/^\s{0,3}[-*+\d\.\)]\s*/g, '') // bullets or numbered items
                    .replace(/\[\s?[xX]?\]\s*/g, '')        // checkboxes
                    .trim();
                const toInline = (s: string) => String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/`([^`]+)`/g,'<code>$1</code>');
                const derivePerFileSummary = (paths: string[], tasksText: string) => {
                    const lines = String(tasksText || '').split(/\r?\n/).map(sanitizeLine).filter(Boolean);
                    const map: Record<string, string[]> = {};
                    for (const p of paths) {
                        const base = p.split('/').pop() || p;
                        const hits = lines.filter(l => l.includes(p) || l.includes('`'+p+'`') || l.toLowerCase().includes(base.toLowerCase()));
                        if (hits.length) map[p] = hits.slice(0, 2);
                    }
                    return map;
                };
                const perFile = derivePerFileSummary(editedPaths, tasks || '');
                // What I did: flatten top matches (up to 8)
                const whatIDid: string[] = [];
                for (const p of editedPaths) {
                    const descs = perFile[p] || [];
                    for (const d of descs) { if (whatIDid.length < 8) whatIDid.push(d); }
                }
                const whatList = (whatIDid.length ? whatIDid : ['Applied safe, in-place updates to the targeted file(s).'])
                    .map(d => `<li>${toInline(d)}</li>`).join('');
                // Files block
                const filesBlock = editedPaths.length
                    ? ['```text', ...editedPaths.slice(0, 50), '```'].join('\n')
                    : '(none)';
                const problemPara = (typeof analysis === 'string' && analysis)
                    ? `<p>${toInline(analysis).replace(/\n\n/g,'</p><p>').replace(/\n/g,'<br>')}</p>`
                    : '';
                const summaryHtml = `
                  <div>
                    <h3 style="margin:0 0 6px;">Summary of changes</h3>
                    ${problemPara ? `<div style="margin:6px 0;"><strong>Problem summary</strong>${problemPara}</div>` : ''}
                    <div style="margin:6px 0;"><strong>What I did</strong><ul style="margin:6px 0 0 16px;">${whatList}</ul></div>
                    <div style="margin:8px 0 4px;"><strong>Files edited (${applied})</strong></div>
                    <pre style="margin:0; white-space:pre-wrap; word-break:break-word; overflow:auto; max-width:100%; box-sizing:border-box; background: var(--vscode-editorWidget-background); border:1px solid var(--vscode-panel-border); border-radius:6px; padding:6px;"><code>${filesBlock}</code></pre>
                  </div>
                `;
                provider.sendMessage({ command: 'aiReplyHtml', kind: 'summary', html: summaryHtml, timestamp: Date.now() });
            } catch {}
        } catch (e: any) {
            // On failure also hide the status bubble and mark complete so Send button returns
            provider.sendMessage({ command: 'statusBubble', action: 'hide' });
            provider.sendMessage({ command: 'generationComplete' });
            provider.sendMessage({ command: 'aiReply', text: `Assista X: Edit failed: ${e?.message || e}` });
        }
    });
}
