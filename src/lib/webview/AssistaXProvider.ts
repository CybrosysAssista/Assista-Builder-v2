/**
 * Main webview provider for Assista X sidebar
 */
import * as vscode from 'vscode';
import * as fs from 'fs';
import { getNonce } from './utils.js';
import { sanitizeModuleName } from '../utils/moduleName.js';
import { getConversationStore } from '../conversation.js';

export class AssistaXProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'assistaXView';
    private _view?: vscode.WebviewView;
    private _activeFlowId?: number;
    // in-webview generation cancel state
    private _cancelRequested: boolean = false;
    // when true, current generation was started from Welcome "Generate New Project"
    private _fromWelcomeGenerate: boolean = false;
    // pending action awaiting user confirmation (e.g., plan -> proceed)
    private _pendingAction: { type: string; data?: any } | undefined;
    // plan confirmation resolver for sidebar-driven confirmation
    private _planConfirmResolver?: (v: { approved: boolean; allowCreate: boolean }) => void;
    private _planConfirmTimer?: NodeJS.Timeout;

    constructor(private readonly _extensionUri: vscode.Uri, private readonly _context: vscode.ExtensionContext) { }

    // Cancel helpers for in-webview progress
    public resetCancel() { this._cancelRequested = false; }
    public requestCancel() { this._cancelRequested = true; }
    public isCancelRequested() { return this._cancelRequested; }

    private setPendingAction(action?: { type: string; data?: any }) {
        this._pendingAction = action;
    }

    public openSettings() {
        const post = () => this._view?.webview.postMessage({ command: 'openSettings' });
        if (this._view) {
            post();
            return;
        }
        // Retry briefly until the view is resolved
        let retries = 40; // allow more time for the webview to resolve
        const id = setInterval(() => {
            if (this._view) {
                clearInterval(id);
                post();
            } else if (--retries <= 0) {
                clearInterval(id);
            }
        }, 150);
    }

    // Safely send a message to the webview, retrying briefly if the view is not yet ready
    public sendMessage(message: any) {
        // Attach current flowId to outbound messages if available
        if (this._activeFlowId != null && typeof message === 'object' && message && message.flowId == null) {
            message.flowId = this._activeFlowId;
        }
        const post = () => this._view?.webview.postMessage(message);
        if (this._view) {
            post();
            return;
        }
        // Retry for a short duration until the view is resolved (handles race conditions)
        let retries = 20;
        const id = setInterval(() => {
            if (this._view) {
                clearInterval(id);
                post();
            } else if (--retries <= 0) {
                clearInterval(id);
            }
        }, 150);
    }

    // Await a plan confirmation from the sidebar UI, with timeout protection.
    public async waitForPlanConfirmation(timeoutMs: number = 60000): Promise<{ approved: boolean; allowCreate: boolean } | undefined> {
        // Reset any prior waiter
        this._planConfirmResolver = undefined;
        if (this._planConfirmTimer) { clearTimeout(this._planConfirmTimer); this._planConfirmTimer = undefined; }
        return new Promise(resolve => {
            this._planConfirmResolver = resolve as (v: { approved: boolean; allowCreate: boolean }) => void;
            this._planConfirmTimer = setTimeout(() => {
                if (this._planConfirmResolver) {
                    const r = this._planConfirmResolver;
                    this._planConfirmResolver = undefined;
                    r({ approved: false, allowCreate: false });
                }
                resolve(undefined);
            }, Math.max(5000, timeoutMs));
        });
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(async message => {
            // Track current flow id from webview
            if (typeof message?.flowId === 'number') {
                this._activeFlowId = message.flowId;
            }
            // Open context picker (Files or Folders) and return selected items limited to workspace scope
            if (message && message.command === 'openContextPicker') {
                try {
                    const pick = await vscode.window.showQuickPick(
                        [
                            { label: 'Files', id: 'files' },
                            { label: 'Folders', id: 'folders' },
                        ],
                        { placeHolder: 'Attach Files or Folders' }
                    );
                    if (!pick) { return; }

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
                    if (!uris || !uris.length) { return; }

                    // Enforce workspace-only scope
                    const filtered = uris.filter(isInsideWorkspace);
                    if (filtered.length === 0) {
                        vscode.window.showWarningMessage('Selection must be inside the current workspace.');
                        return;
                    }
                    if (filtered.length < uris.length) {
                        vscode.window.showInformationMessage('Some selections were outside the workspace and were ignored.');
                    }

                    const items = filtered.map(u => ({
                        type: canSelectFiles ? 'file' : 'folder',
                        name: pathMod.basename(u.fsPath),
                        path: u.fsPath,
                    }));
                    // Post back to webview (include flowId if active)
                    this.sendMessage({ command: 'contextAdded', items });
                    try { console.log(`[Assista X] contextAdded -> ${items.length} item(s)`); } catch {}
                    try { vscode.window.setStatusBarMessage(`Assista X: Added ${items.length} context item(s)`, 2500); } catch {}
                } catch (e) {
                    try { console.warn('[Assista X] openContextPicker failed:', e); } catch {}
                }
                return;
            }
            // Webview asks for the current active file to render the chip immediately
            if (message && message.command === 'requestActiveFile') {
                try {
                    const ed = vscode.window.activeTextEditor;
                    if (!ed || !ed.document || !ed.document.uri) {
                        this._view?.webview.postMessage({ command: 'activeFile', fileName: null, fullPath: null, languageId: null, moduleRoot: null, timestamp: Date.now() });
                        return;
                    }
                    const uri = ed.document.uri;
                    const fileName = require('path').basename(uri.fsPath);
                    const languageId = ed.document.languageId || '';
                    // Find nearest module root containing __manifest__.py
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
                    this._view?.webview.postMessage({ command: 'activeFile', fileName, fullPath: uri.fsPath, languageId, moduleRoot: moduleRootPath, timestamp: Date.now() });
                } catch {}
                return;
            }
            // Flag that the next generation was initiated via Welcome screen
            if (message && message.command === 'markGenerateFromWelcome') {
                this._fromWelcomeGenerate = true;
                return;
            }
            // Post-generation choice coming from the sidebar confirm bar
            if (message && message.command === 'postGenChoose') {
                const choice = String(message.choice || '').toLowerCase();
                if (choice === 'edit') {
                    try { await vscode.commands.executeCommand('assistaXView.focus'); } catch {}
                    try { this.sendMessage({ command: 'switchMode', mode: 'edit', keepSession: true }); } catch {}
                    try { await vscode.commands.executeCommand('assistaX.editOdooProject'); } catch {}
                    return;
                }
                if (choice === 'generate') {
                    try { await vscode.commands.executeCommand('assistaX.generateOdooModule'); } catch {}
                    return;
                }
            }
            // Generate mode: after version selection, show a brief plan and ask for confirmation
            if (message.command === 'requestPlan') {
                try {
                    // Clear any previous cancellation (user may have pressed Stop earlier)
                    this.resetCancel();
                    // Do not start planning if cancellation was requested
                    if (this.isCancelRequested()) { return; }
                    const promptText: string = String(message.prompt || '').trim();
                    const version: string = String(message.version || '').trim();
                    const inputName: string = String(message.moduleName || '').trim();
                    // Sanitize module name into a concise slug like "real_estate"
                    const moduleName: string = sanitizeModuleName(inputName || promptText);
                    if (!promptText || !version || !moduleName) {
                        this.sendMessage({ command: 'aiReply', text: 'Missing information to prepare a plan. Please retry.' });
                        return;
                    }
                    const { generateContent } = await import('../ai.js');
                    const planPrompt = [
                        `You are preparing a short build plan for an Odoo ${version} module named "${moduleName}" based on the user's request below.`,
                        `User request: "${promptText}"`,
                        '',
                        'Respond with HTML ONLY (no markdown, no code fences). Use this exact structure and headings:',
                        '<h3>Build Plan</h3>',
                        '<ul>',
                        '<li>1-2 bullet points summarizing what will be built and the approach (concise).</li>',
                        '</ul>',
                        '<h3>Result</h3>',
                        '<ul>',
                        '<li>Short bullets describing the outcome users will see once generated.</li>',
                        '</ul>',
                        '<h3>Files to be created</h3>',
                        '<ul>',
                        `<li><code>${moduleName}/__init__.py</code></li>`,
                        `<li><code>${moduleName}/__manifest__.py</code></li>`,
                        '</ul>',
                        '',
                        'Rules:',
                        '- Keep the plan brief and clean.',
                        '- Use only the HTML structure above with <h3>, <ul>, <li>, and <code> tags.',
                        '- Infer and list the remaining files (models, views, security, data, report, wizards, static) from the user\'s request using realistic, domain-derived filenames (no generic placeholders).',
                        `- EVERY listed path MUST start with "${moduleName}/" and be placed under the correct directory: models/, views/, security/, data/, report/, wizards/, static/.`,
                        '- If any Python model files are listed under models/, ALSO include models/__init__.py (import aggregator).',
                        '- If new models are introduced, include security/ir.model.access.csv and (optionally) security/<module>_security.xml.',
                        `- View files MUST end with _views.xml (e.g., ${moduleName}/views/<entity>_views.xml).`,
                        `- Menu file should be named ${moduleName}/views/${moduleName}_menu.xml when menus are introduced.`,
                        '- Avoid duplicate filenames and avoid root-level files other than __init__.py and __manifest__.py.',
                        '- No preface or extra commentary outside the structure.'
                    ].join('\n');
                    const html = await generateContent({ contents: planPrompt, config: { mode: 'generate' } }, this._context);
                    // Bail if user pressed Stop while planning
                    if (this.isCancelRequested()) { return; }
                    // Forward to Dev-main style panel and keep confirm bar flow
                    try {
                        this.sendMessage({ command: 'planReset' });
                        this.sendMessage({ command: 'planSection', section: 'tasks', markdown: String(html || '') });
                    } catch {}
                    // Also send legacy bubble but mark as kind:'plan' so webview can suppress when panel active
                    this.sendMessage({ command: 'aiReplyHtml', html, kind: 'plan' });
                    // Ask for confirmation and pass payload so the webview can start generation on Proceed
                    this.sendMessage({ command: 'confirmApplyPlan', prompt: 'Proceed to generate this module?', version, moduleName, promptText });
                } catch (e: any) {
                    this.sendMessage({ command: 'aiReply', text: `Failed to prepare plan: ${e?.message || e}` });
                }
                return;
            }
            // Pre-version validation for Generate flow: validate prompt before showing version choices
            if (message.command === 'validatePrompt') {
                try {
                    // Clear any previous cancellation (user may have pressed Stop earlier)
                    this.resetCancel();
                    if (this.isCancelRequested()) { return; }
                    const promptText: string = String(message.prompt || '').trim();
                    if (!promptText) {
                        this.sendMessage({ command: 'validationResult', ok: false, reason: 'Please describe your module first.' });
                        return;
                    }
                    const { generateContent } = await import('../ai.js');
                    const prompts = await import('../prompts.js');
                    const valReq: any = { contents: prompts.createOdooValidationPrompt(promptText), config: { responseMimeType: 'application/json', mode: 'generate' } };
                    let raw = '';
                    try { raw = await generateContent(valReq, this._context); } catch (e) { raw = ''; }
                    if (this.isCancelRequested()) { return; }
                    let parsed: any = undefined;
                    try { parsed = JSON.parse(String(raw || '{}')); } catch { }
                    const isOk = !!(parsed && (parsed.is_odoo_request === true || parsed.is_odoo_request === 'true'));
                    const reason = parsed && parsed.reason ? String(parsed.reason) : (isOk ? '' : 'Your request does not appear to be an Odoo module request.');
                    this.sendMessage({ command: 'validationResult', ok: isOk, is_odoo_request: isOk, reason });
                } catch (e: any) {
                    this.sendMessage({ command: 'validationResult', ok: false, reason: `Validation failed: ${e?.message || e}` });
                }
                return;
            }
            if (message.command === 'modeSwitch') {
                // Flow switch acknowledged; cancel any current operation
                this.requestCancel();
                return;
            }
            // Plan confirmation messages from the sidebar
            if (message?.type === 'plan.confirm') {
                const allowCreate = !!message?.allowCreate;
                const resolver = this._planConfirmResolver;
                this._planConfirmResolver = undefined;
                if (this._planConfirmTimer) { clearTimeout(this._planConfirmTimer); this._planConfirmTimer = undefined; }
                resolver?.({ approved: true, allowCreate });
                return;
            }
            if (message?.type === 'plan.cancel') {
                const resolver = this._planConfirmResolver;
                this._planConfirmResolver = undefined;
                if (this._planConfirmTimer) { clearTimeout(this._planConfirmTimer); this._planConfirmTimer = undefined; }
                resolver?.({ approved: false, allowCreate: false });
                return;
            }
            // Legacy confirm bar buttons (Proceed/Cancel)
            if (message?.type === 'confirmProceed') {
                const resolver = this._planConfirmResolver;
                this._planConfirmResolver = undefined;
                if (this._planConfirmTimer) { clearTimeout(this._planConfirmTimer); this._planConfirmTimer = undefined; }
                resolver?.({ approved: true, allowCreate: false });
                return;
            }
            if (message?.type === 'confirmCancel') {
                const resolver = this._planConfirmResolver;
                this._planConfirmResolver = undefined;
                if (this._planConfirmTimer) { clearTimeout(this._planConfirmTimer); this._planConfirmTimer = undefined; }
                resolver?.({ approved: false, allowCreate: false });
                return;
            }
            if (message.command === 'stop') {
                this.requestCancel();
                return;
            }
            // Diff review apply/cancel from webview
            if (message.type === 'applySelected') {
                try {
                    const selected: string[] = Array.isArray(message.paths) ? message.paths : [];
                    const map: Record<string, { uri: vscode.Uri; current: string; updated: string }> = (this as any)._proposedChanges || {};
                    if (!selected.length || !map || !Object.keys(map).length) {
                        this._view?.webview.postMessage({ command: 'aiReply', text: 'No selected files to apply.' });
                        return;
                    }
                    // Track which docs we opened during applySelected to avoid duplicate tabs
                    const openedDocsApply = new Set<string>();
                    let applied = 0;
                    for (const rel of selected) {
                        const item = map[rel];
                        if (!item) continue;
                        try {
                            // Edit-only: do not create new files. Apply only if the target exists.
                            try {
                                await vscode.workspace.fs.stat(item.uri);
                            } catch {
                                this._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.skipped', payload: { path: rel, reason: 'nonexistent' } } });
                                continue;
                            }
                            await vscode.workspace.fs.writeFile(item.uri, Buffer.from(item.updated, 'utf8'));
                            this._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.written', payload: { path: rel } } });
                            applied++;
                            const key = item.uri.toString();
                            if (!openedDocsApply.has(key)) {
                                openedDocsApply.add(key);
                                try { await vscode.window.showTextDocument(item.uri, { preview: false, preserveFocus: true }); } catch { }
                            }
                        } catch (e) {
                            this._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.error', payload: { path: rel, error: String(e) } } });
                        }
                    }
                } catch (e: any) {
                    this._view?.webview.postMessage({ command: 'aiReply', text: `Failed to apply selected changes: ${e?.message || e}` });
                }
                return;
            }
            if (message.type === 'cancelDiff') {
                // Simply clear stored proposals and hide any diff UI client-side
                (this as any)._proposedChanges = undefined;
                this._view?.webview.postMessage({ command: 'aiReply', text: 'Cancelled review.' });
                return;
            }
            if (message.type === 'confirmCancel') {
                this.setPendingAction(undefined);
                this._view?.webview.postMessage({ type: 'clearConfirm' });
                return;
            }
            if (message.type === 'confirmProceed') {
                const action = this._pendingAction;
                this.setPendingAction(undefined);
                this._view?.webview.postMessage({ type: 'clearConfirm' });
                if (action?.type === 'altNumberModule') {
                    try {
                        // Prompt for minimal inputs
                        const moduleName = await vscode.window.showInputBox({
                            title: 'New Module Technical Name',
                            prompt: 'Enter the module name to create (e.g., partner_alt_number)',
                            value: 'partner_alt_number',
                            ignoreFocusOut: true,
                            validateInput: v => v && /^[a-z0-9_]+$/.test(v) ? undefined : 'Use lowercase letters, numbers, and underscores'
                        });
                        if (!moduleName) { return; }
                        const detectedVer = String(this._context.workspaceState.get('assistaX.odooVersion') || '17.0');
                        const version = await vscode.window.showInputBox({
                            title: 'Odoo Version',
                            prompt: 'Enter Odoo version',
                            value: detectedVer,
                            ignoreFocusOut: true
                        }) || detectedVer;
                        const dest = await vscode.window.showOpenDialog({
                            title: 'Select destination directory for the new module',
                            canSelectFiles: false,
                            canSelectFolders: true,
                            canSelectMany: false,
                            openLabel: 'Select'
                        });
                        if (!dest || !dest[0]) { return; }
                        const baseDir = dest[0];
                        const moduleRoot = vscode.Uri.joinPath(baseDir, moduleName);
                        await vscode.workspace.fs.createDirectory(moduleRoot);

                        const write = async (relPath: string, content: string) => {
                            const parts = relPath.split('/').filter(Boolean);
                            const file = parts.pop()!;
                            const dirUri = parts.length ? vscode.Uri.joinPath(moduleRoot, ...parts) : moduleRoot;
                            await vscode.workspace.fs.createDirectory(dirUri);
                            const fileUri = vscode.Uri.joinPath(dirUri, file);
                            await vscode.workspace.fs.writeFile(fileUri, Buffer.from(content, 'utf8'));
                        };

                        const manifest = `{
    'name': '${moduleName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}',
    'summary': "Adds an 'Alternative Number' field to Contacts",
    'description': "Adds an 'Alternative Number' field (x_alternative_number) to res.partner and shows it below Mobile.",
    'version': '${version}',
    'author': 'Your Company',
    'website': 'https://example.com',
    'license': 'LGPL-3',
    'category': 'Contacts',
    'depends': ['base'],
    'data': ['views/res_partner_views.xml'],
    'installable': True,
    'application': False,
}`;
                        const moduleInit = `# -*- coding: utf-8 -*-\nfrom . import models\n`;
                        const modelsInit = `# -*- coding: utf-8 -*-\nfrom . import res_partner\n`;
                        const resPartnerPy = `# -*- coding: utf-8 -*-\nfrom odoo import fields, models\n\n\nclass ResPartner(models.Model):\n    _inherit = 'res.partner'\n\n    x_alternative_number = fields.Char(\n        string="Alternative Number",\n        help="An alternative contact number for the partner.")\n`;
                        const resPartnerXml = `<?xml version="1.0" encoding="utf-8"?>\n<odoo>\n  <record id="view_partner_form_inherit_alternative_number" model="ir.ui.view">\n    <field name="name">res.partner.form.inherit.alternative.number</field>\n    <field name="model">res.partner</field>\n    <field name="inherit_id" ref="base.view_partner_form"/>\n    <field name="arch" type="xml">\n      <field name="mobile" position="after">\n        <field name="x_alternative_number"/>\n      </field>\n    </field>\n  </record>\n</odoo>\n`;

                        await write('__manifest__.py', manifest);
                        await write('__init__.py', moduleInit);
                        await write('models/__init__.py', modelsInit);
                        await write('models/res_partner.py', resPartnerPy);
                        await write('views/res_partner_views.xml', resPartnerXml);

                        vscode.window.showInformationMessage(`Created module ${moduleName} at ${moduleRoot.fsPath}`);
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to proceed: ${(err as Error).message}`);
                    }
                }
                else if (action?.type === 'generateModuleFromPlan') {
                    try {
                        const { generateOdooModule } = await import('../ai.js');
                        const planPrompt = String(action.data?.prompt || '');
                        const version = String(action.data?.version || '17.0');
                        if (!planPrompt) {
                            vscode.window.showWarningMessage('No plan prompt available to proceed.');
                            return;
                        }
                        // Ask for module name and destination
                        const moduleName = await vscode.window.showInputBox({
                            title: 'Module Technical Name',
                            prompt: 'Enter the module name to generate (snake_case)',
                            value: 'custom_module',
                            ignoreFocusOut: true,
                            validateInput: v => v && /^[a-z0-9_]+$/.test(v) ? undefined : 'Use lowercase letters, numbers, underscores'
                        });
                        if (!moduleName) { return; }
                        // Resolve destination directory with defaultAddonsPath and custom_addons handling
                        const cfg = vscode.workspace.getConfiguration('assistaX');
                        const defaultAddonsPath = String(cfg.get('defaultAddonsPath') || '');
                        let baseDir: vscode.Uri | undefined;
                        let preselectedCustomAddons: vscode.Uri | undefined;
                        // Detect existing custom addons dirs:
                        // 1) root-level folders named in assistaX.customAddonsNames
                        // 2) any ancestor directory of a detected __manifest__.py whose segment matches a configured name
                        try {
                            const roots = vscode.workspace.workspaceFolders || [];
                            const cfgNames = (vscode.workspace.getConfiguration('assistaX').get<string[]>('customAddonsNames') || ['custom_addons', 'custom_addon']).filter(Boolean);
                            const foundMap = new Map<string, vscode.Uri>();
                            for (const r of roots) {
                                for (const name of cfgNames) {
                                    const c = vscode.Uri.joinPath(r.uri, name);
                                    try { await vscode.workspace.fs.stat(c); foundMap.set(c.fsPath, c); } catch { }
                                }
                            }
                            // Infer from manifests
                            const exclude = '**/{.git,node_modules,venv,env,dist,build,\.venv,\.env}/**';
                            const manifests = await vscode.workspace.findFiles('**/__manifest__.py', exclude, 200);
                            for (const m of manifests) {
                                const parts = m.fsPath.split(require('path').sep);
                                for (let i = 0; i < parts.length; i++) {
                                    const seg = parts[i];
                                    if (cfgNames.includes(seg)) {
                                        const dir = vscode.Uri.file(parts.slice(0, i + 1).join(require('path').sep));
                                        try { await vscode.workspace.fs.stat(dir); foundMap.set(dir.fsPath, dir); } catch { }
                                    }
                                }
                            }
                            const found = Array.from(foundMap.values());
                            if (!baseDir && found.length === 1) {
                                const use = await vscode.window.showInformationMessage(`Found a 'custom_addons' folder at:\n${found[0].fsPath}\nUse it for the new module?`, 'Yes', 'No');
                                if (use === 'Yes') { preselectedCustomAddons = found[0]; }
                            } else if (!baseDir && found.length > 1) {
                                const pick = await vscode.window.showQuickPick(found.map(u => ({ label: u.fsPath, u })), { placeHolder: 'Select a custom_addons folder to use for the new module' });
                                if (pick) { preselectedCustomAddons = pick.u; }
                            }
                        } catch { }
                        if (defaultAddonsPath) {
                            const useDefault = await vscode.window.showInformationMessage(`Use default addons directory to create the new module?\n${defaultAddonsPath}`, 'Yes', 'No');
                            if (useDefault === 'Yes') {
                                baseDir = vscode.Uri.file(defaultAddonsPath);
                            }
                        }
                        if (!baseDir && !preselectedCustomAddons) {
                            const dest = await vscode.window.showOpenDialog({
                                title: 'Select parent directory for the new module',
                                canSelectFiles: false,
                                canSelectFolders: true,
                                canSelectMany: false,
                                openLabel: 'Select'
                            });
                            if (!dest || !dest[0]) { return; }
                            baseDir = dest[0];
                        }
                        // Offer custom_addons usage/creation within the chosen base or use preselected custom_addons
                        let parentDir = preselectedCustomAddons;
                        if (!parentDir) {
                            if (!baseDir) { return; }
                            parentDir = baseDir;
                            try {
                                const child = vscode.Uri.joinPath(baseDir, 'custom_addons');
                                const stat = await vscode.workspace.fs.stat(child);
                                // exists -> ask to use it
                                const useChild = await vscode.window.showInformationMessage(`Found 'custom_addons' inside selected directory. Create the new module there?`, 'Yes', 'No');
                                if (useChild === 'Yes') parentDir = child;
                            } catch {
                                // not exists -> offer to create
                                const make = await vscode.window.showInformationMessage(`No 'custom_addons' found. Create it inside the selected directory and place the new module there?`, 'Yes', 'No');
                                if (make === 'Yes') {
                                    const child = vscode.Uri.joinPath(baseDir, 'custom_addons');
                                    await vscode.workspace.fs.createDirectory(child);
                                    parentDir = child;
                                }
                            }
                        }
                        const folderUri = vscode.Uri.joinPath(parentDir, moduleName);
                        const confirm = await vscode.window.showInformationMessage(`Create module '${moduleName}' at:\n${folderUri.fsPath}`, { modal: true }, 'Proceed', 'Cancel');
                        if (confirm !== 'Proceed') { return; }
                        await vscode.workspace.fs.createDirectory(folderUri);

                        // Stream minimal progress chips in the chat
                        const send = (payload: any) => this._view?.webview.postMessage(payload);
                        send({ command: 'generationMessage', sender: 'ai', text: 'Starting generation from plan…', timestamp: Date.now() });
                        const genCancelled = () => this.isCancelRequested();
                        const result = await generateOdooModule(
                            planPrompt,
                            version,
                            moduleName,
                            this._context,
                            { skipValidation: true },
                            (ev: any) => {
                                // post only if view still alive
                                try { this._view?.webview.postMessage({ type: 'progress', ev }); } catch { }
                                // Also mirror important events as chat bubbles (sidebar flow)
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
                                        this._view?.webview.postMessage({ command: 'generationMessage', sender: 'ai', text, timestamp: Date.now() });
                                    } else if (t) {
                                        this._view?.webview.postMessage({ command: 'generationMessage', sender: 'ai', text: `<span class=\"chip\">${t}</span>`, timestamp: Date.now() });
                                    }
                                } catch { }
                            },
                            genCancelled
                        );
                        const files = result.files || {};
                        let written = 0;
                        for (const [relPath, content] of Object.entries(files)) {
                            try {
                                const safeRel = String(relPath).replace(/^\/+/, '').replace(/^\.\//, '');
                                const parts = safeRel.split('/').filter(Boolean);
                                const file = parts.pop() || safeRel;
                                const dirUri = parts.length ? vscode.Uri.joinPath(folderUri, ...parts) : folderUri;
                                await vscode.workspace.fs.createDirectory(dirUri);
                                const fileUri = vscode.Uri.joinPath(dirUri, file);
                                // progress chip: starting to write this file
                                this._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.started', payload: { path: safeRel } } });
                                await vscode.workspace.fs.writeFile(fileUri, Buffer.from(String(content), 'utf8'));
                                written++;
                                send({ command: 'fileGenerated', sender: 'ai', text: `✅ ${safeRel}`, filePath: safeRel, timestamp: Date.now() });
                                // open created file in editor as non-preview without stealing focus
                                try { await vscode.window.showTextDocument(fileUri, { preview: false, preserveFocus: true }); } catch { }
                            } catch (e) {
                                send({ command: 'generationWarning', sender: 'ai', text: `⚠️ Failed ${relPath}: ${(e as Error).message}`, filePath: relPath, timestamp: Date.now() });
                            }
                        }
                        send({ command: 'generationComplete', sender: 'ai', text: `Done. Created ${written} file(s).`, modulePath: folderUri.fsPath, filesCreated: written, totalFiles: Object.keys(files).length, timestamp: Date.now() });
                        vscode.window.showInformationMessage(`Generated module ${moduleName} at ${folderUri.fsPath}`);
                        // Do NOT auto-switch modes. Let the webview show a confirmation bar and let the user decide.
                        try { await vscode.commands.executeCommand('assistaXView.focus'); } catch { }
                        try { send({ command: 'postGenActions', modulePath: folderUri.fsPath, moduleName }); } catch { }
                        // Proactively broadcast the active file so the chip shows even if editor focus didn't change (optional)
                        try {
                            const ed = vscode.window.activeTextEditor;
                            if (ed && ed.document && ed.document.uri) {
                                const pathMod = require('path');
                                const uri = ed.document.uri;
                                const fileName = pathMod.basename(uri.fsPath);
                                const languageId = ed.document.languageId || '';
                                // Compute nearest module root (optional, best-effort)
                                let moduleRootPath: string | null = null;
                                try {
                                    const wsRoots = (vscode.workspace.workspaceFolders || []).map(f => f.uri.fsPath);
                                    let curDir = pathMod.dirname(uri.fsPath);
                                    while (curDir && wsRoots.some(w => curDir.startsWith(w))) {
                                        try {
                                            const probe = vscode.Uri.file(pathMod.join(curDir, '__manifest__.py'));
                                            await vscode.workspace.fs.stat(probe);
                                            moduleRootPath = curDir;
                                            break;
                                        } catch { /* climb */ }
                                        const parent = pathMod.dirname(curDir);
                                        if (parent === curDir) break;
                                        curDir = parent;
                                    }
                                } catch { }
                                send({ command: 'activeFile', fileName, fullPath: uri.fsPath, languageId, moduleRoot: moduleRootPath, timestamp: Date.now() });
                            }
                        } catch { }
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to generate from plan: ${(err as Error).message}`);
                    }
                }
                else if (action?.type === 'modifyExisting') {
                    try {
                        const { generateContent } = await import('../ai.js');
                        const prompts = await import('../prompts.js');
                        const userPrompt = String(action.data?.prompt || '');
                        const version = String(action.data?.version || '17.0');
                        if (!userPrompt) {
                            vscode.window.showWarningMessage('No edit plan available to proceed.');
                            return;
                        }
                        // Detect module root
                        const manifests = await vscode.workspace.findFiles('**/__manifest__.py', '**/{.venv,venv,node_modules,dist,build}/**', 50);
                        if (!manifests.length) {
                            vscode.window.showWarningMessage('No Odoo module (__manifest__.py) found in the current workspace. Open your project in VS Code and try again.');
                            return;
                        }
                        const rootsMap = new Map<string, vscode.Uri>();
                        for (const m of manifests) {
                            const parent = vscode.Uri.joinPath(m, '..');
                            rootsMap.set(parent.fsPath, parent);
                        }
                        const moduleRoots = Array.from(rootsMap.values());
                        const sep = require('path').sep;
                        const activeUri = vscode.window.activeTextEditor?.document?.uri;
                        const moduleRoot = (activeUri ? moduleRoots.find(r => activeUri.fsPath.startsWith(r.fsPath + sep)) : undefined) || moduleRoots[0];
                        const moduleName = moduleRoot.fsPath.split(sep).pop() || 'module';
                        const activeRelPath = activeUri ? vscode.workspace.asRelativePath(activeUri, false).replace(/\\/g, '/') : '';

                        // Build all file paths under module (py, xml, manifest)
                        const relPattern = new vscode.RelativePattern(moduleRoot, '**/*');
                        const exclude = '**/{__pycache__,.pytest_cache}/**';
                        const allUris = await vscode.workspace.findFiles(relPattern, exclude, 5000);
                        const allPaths = allUris
                            .map(u => vscode.workspace.asRelativePath(u, false))
                            .filter(p => p.startsWith(moduleName + sep) || p.startsWith(moduleName + '/'))
                            .map(p => p.replace(/\\/g, '/'));

                        // Helper: remap placeholder paths to existing files in the module, preferring active file
                        const remapToExisting = (rel: string) => {
                            const cleaned = String(rel || '').replace(/\\/g, '/');
                            const inPaths = (p: string) => allPaths.includes(p);
                            const act = String(activeRelPath || '').replace(/\\/g, '/');
                            // Models
                            if (cleaned.startsWith(moduleName + '/models/')) {
                                if (inPaths(cleaned)) return cleaned;
                                if (act && act.startsWith(moduleName + '/models/')) return act;
                                const modelCandidates = allPaths.filter(p => p.startsWith(moduleName + '/models/') && p.endsWith('.py'));
                                const preferred = modelCandidates.find(p => /(^|\/)alternative\.py$/i.test(p)) || modelCandidates[0];
                                if (preferred) return preferred;
                            }
                            // Views
                            if (cleaned.startsWith(moduleName + '/views/')) {
                                if (inPaths(cleaned)) return cleaned;
                                if (act && act.startsWith(moduleName + '/views/')) return act;
                                const viewCandidates = allPaths.filter(p => p.startsWith(moduleName + '/views/') && p.endsWith('.xml'));
                                const preferred = viewCandidates.find(p => /(^|\/)alternative_views\.xml$/i.test(p)) || viewCandidates[0];
                                if (preferred) return preferred;
                            }
                            return cleaned;
                        };

                        // Cache lightweight module context for this session
                        try {
                            const ctxKey = 'assistaX.moduleContext';
                            const current = this._context.workspaceState.get<any>(ctxKey) || {};
                            current[moduleRoot.fsPath] = {
                                moduleName,
                                moduleRoot: moduleRoot.fsPath,
                                activeFile: activeRelPath,
                                files: allPaths,
                                updatedAt: Date.now()
                            };
                            await this._context.workspaceState.update(ctxKey, current);
                        } catch { }

                        // Ask AI to choose relevant files
                        const editPreface = `EDIT MODE (Assista X):\n- Limit changes to existing files under module '${moduleName}' at '${moduleRoot.fsPath}'.\n- Active file anchor: ${activeRelPath || '(none)'}\n- Select only from the provided file list.\n- Do NOT propose new files unless the user explicitly approves.`;
                        const selectionPrompt = { contents: `${editPreface}\n\n${prompts.createFileSelectionForModificationPrompt(userPrompt, version, allPaths, moduleName)}`, config: { responseMimeType: 'application/json', mode: 'edit' } } as any;
                        let selectedPathsText = await generateContent(selectionPrompt, this._context);
                        let selectedPaths: string[] = [];
                        try { selectedPaths = JSON.parse(selectedPathsText || '[]'); } catch { selectedPaths = []; }
                        if (!Array.isArray(selectedPaths)) selectedPaths = [];
                        if (!selectedPaths.length) {
                            // Fallback to common files if selection fails
                            selectedPaths = allPaths.filter(p => /__manifest__\.py$|\/models\/|\/views\//.test(p)).slice(0, 10);
                        }
                        // Remap placeholders to real existing files and de-duplicate
                        selectedPaths = Array.from(new Set(selectedPaths.map(remapToExisting)));
                        // Edit-only: restrict to existing files within module
                        const isExistingPath = (p: string) => allPaths.includes(p);
                        selectedPaths = selectedPaths.filter(isExistingPath);

                        // Intent: detect simple "create new field <name>" and constrain targets to missing places only
                        const detectFieldIntent = (s: string) => {
                            const nameMatch = /(?:create|add)\s+(?:a\s+)?(?:new\s+)?field\s+(?:called\s+|named\s+)?([a-zA-Z_][\w]*)/i.exec(s);
                            const typeMatch = /(integer|char|text|boolean|float|date|datetime|many2one|one2many|many2many)/i.exec(s);
                            const fieldName = nameMatch ? nameMatch[1] : '';
                            const fieldType = typeMatch ? typeMatch[1].toLowerCase() : '';
                            return { fieldName, fieldType };
                        };
                        const { fieldName, fieldType } = detectFieldIntent(userPrompt);
                        let presenceSummary = '';
                        if (fieldName) {
                            // Scan models and views for existing presence
                            const modelsFiles = allPaths.filter(p => p.startsWith(moduleName + '/models/') && p.endsWith('.py'));
                            const viewsFiles = allPaths.filter(p => p.startsWith(moduleName + '/views/') && p.endsWith('.xml'));
                            const hasInModel: Record<string, boolean> = {};
                            const hasInView: Record<string, boolean> = {};
                            for (const rel of modelsFiles) {
                                try {
                                    const uri = vscode.Uri.joinPath(moduleRoot, ...rel.split('/').slice(1));
                                    const txt = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
                                    hasInModel[rel] = new RegExp(`\\b${fieldName}\\s*=\\s*fields\\.\\w+\\(`).test(txt);
                                } catch { hasInModel[rel] = false; }
                            }
                            for (const rel of viewsFiles) {
                                try {
                                    const uri = vscode.Uri.joinPath(moduleRoot, ...rel.split('/').slice(1));
                                    const txt = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
                                    hasInView[rel] = new RegExp(`<field\\s+name=["']${fieldName}["']`).test(txt);
                                } catch { hasInView[rel] = false; }
                            }
                            const existsAnywhere = Object.values(hasInModel).some(Boolean);
                            // Constrain selection: if field exists in any model, do not target model creation; else pick a single model file to add
                            if (existsAnywhere) {
                                selectedPaths = selectedPaths.filter(p => !p.startsWith(moduleName + '/models/'));
                            } else {
                                // ensure we have one model target (prefer active models file, else alternative.py, else first)
                                const activeModel = (activeRelPath && activeRelPath.startsWith(moduleName + '/models/')) ? activeRelPath : '';
                                const preferredModel = activeModel || modelsFiles.find(p => /(^|\/)alternative\.py$/i.test(p)) || modelsFiles[0];
                                if (preferredModel && !selectedPaths.includes(preferredModel)) {
                                    selectedPaths.unshift(preferredModel);
                                }
                            }
                            // Views: only target those missing the field usage
                            const missingViews = viewsFiles.filter(p => !hasInView[p]);
                            if (missingViews.length) {
                                // Prefer active view if applicable
                                const activeView = (activeRelPath && activeRelPath.startsWith(moduleName + '/views/')) ? activeRelPath : '';
                                const ordered = Array.from(new Set([activeView, ...missingViews].filter(Boolean)));
                                // Add to selected paths; ensure de-dup
                                selectedPaths = Array.from(new Set([...selectedPaths, ...ordered]));
                            }
                            // Build a presence summary to nudge the AI to avoid duplicates
                            const modelLines = modelsFiles.map(p => `${hasInModel[p] ? 'HAS' : 'MISS'}: ${p}`).join('\n');
                            const viewLines = viewsFiles.map(p => `${hasInView[p] ? 'HAS' : 'MISS'}: ${p}`).join('\n');
                            presenceSummary = [`Field intent detected: ${fieldName}${fieldType ? ' : ' + fieldType : ''}`, 'Models:', modelLines || '(none)', 'Views:', viewLines || '(none)'].join('\n');
                        }
                        // Read contents of selected files
                        const relevantFiles: Record<string, string> = {};
                        for (const rel of selectedPaths) {
                            try {
                                const uri = vscode.Uri.joinPath(moduleRoot, ...rel.replace(/^.*?\//, `${moduleName}/`).split('/').slice(1));
                                const buf = await vscode.workspace.fs.readFile(uri);
                                relevantFiles[rel] = Buffer.from(buf).toString('utf8');
                            } catch {
                                relevantFiles[rel] = '';
                            }
                        }
                        // Requirements
                        const reqExtra = presenceSummary ? `\n\nPresence:\n${presenceSummary}\n- Only add the field where marked MISS.\n- Do NOT create new files; patch existing files only within the module.` : '';
                        const reqPrompt = { contents: `${editPreface}${reqExtra}\n\n${prompts.createModificationRequirementsPrompt(userPrompt, version, relevantFiles, moduleName)}`, config: { mode: 'edit' } } as any;
                        const requirements = await generateContent(reqPrompt, this._context);
                        this._view?.webview.postMessage({ command: 'aiReply', text: requirements });
                        // Tasks
                        const tasksPrompt = { contents: `${editPreface}${presenceSummary ? `\n\nPresence:\n${presenceSummary}` : ''}\n\n${prompts.createModificationTasksPrompt(requirements, version, relevantFiles, moduleName)}`, config: { mode: 'edit' } } as any;
                        const tasks = await generateContent(tasksPrompt, this._context);
                        this._view?.webview.postMessage({ command: 'aiReply', text: tasks });

                        // Extract target file paths from tasks
                        const filePathRegex = /`([^`]+\.[a-zA-Z0-9_]+)`/g;
                        const targetSet = new Set<string>();
                        let m: RegExpExecArray | null;
                        while ((m = filePathRegex.exec(tasks)) !== null) {
                            const rel = m[1].replace(/^\.?\/?/, '').replace(/\\/g, '/');
                            if (rel) targetSet.add(rel);
                        }
                        let targets = Array.from(targetSet);
                        // Remap task-referenced placeholders to existing files
                        targets = Array.from(new Set(targets.map(remapToExisting)));
                        // Edit-only: restrict to existing files within module
                        targets = targets.filter(isExistingPath);
                        if (!targets.length && !selectedPaths.length) {
                            this._view?.webview.postMessage({ command: 'aiReply', text: 'Edit-only mode: No valid existing files detected to modify. Please open a model/view file in the module or specify /file <path>.' });
                        } else {
                            this._view?.webview.postMessage({ command: 'aiReply', text: 'Edit-only mode: New files will not be created. Changes will apply to existing module files only.' });
                        }
                        // Ask permission to edit the active file and include it as a target if confirmed
                        try {
                            const activeEd = vscode.window.activeTextEditor;
                            if (activeEd && activeEd.document && activeEd.document.uri) {
                                const activeRelForMsg = vscode.workspace.asRelativePath(activeEd.document.uri).replace(/\\/g, '/');
                                const consent = await vscode.window.showInformationMessage(
                                    `Use the active file as a primary edit target?\n${activeRelForMsg}`,
                                    { modal: true },
                                    'Yes',
                                    'No'
                                );
                                const includeActiveFile = consent === 'Yes';
                                if (includeActiveFile) {
                                    const path = require('path');
                                    const activeFs = activeEd.document.uri.fsPath;
                                    const relWithinModule = path.relative(moduleRoot.fsPath, activeFs).replace(/\\/g, '/');
                                    if (!relWithinModule.startsWith('..') && relWithinModule) {
                                        const normalized = `${moduleName}/${relWithinModule}`.replace(/\\/g, '/');
                                        if (!targetSet.has(normalized)) {
                                            targetSet.add(normalized);
                                            targets.push(normalized);
                                        }
                                    }
                                }
                            }
                        } catch { }
                        // Hygiene: ensure __init__.py and __manifest__.py are targeted when needed
                        const ensureTarget = (rel: string) => { if (!targetSet.has(rel)) { targetSet.add(rel); targets.push(rel); } };
                        // If any new/changed Python under models/ -> include models/__init__.py and root __init__.py
                        if (targets.some(t => /\/models\/.+\.py$/i.test(t) && !/__init__\.py$/i.test(t))) {
                            ensureTarget(`${moduleName}/models/__init__.py`);
                            ensureTarget(`${moduleName}/__init__.py`);
                        }
                        // If any new/changed XML under views/ -> include __manifest__.py for data update
                        if (targets.some(t => /\/views\/.+\.xml$/i.test(t))) {
                            ensureTarget(`${moduleName}/__manifest__.py`);
                        }
                        if (!targets.length) {
                            vscode.window.showWarningMessage('No actionable file paths found in generated tasks.');
                            return;
                        }

                        // Filter targets: keep only files that already exist under moduleRoot, unless user approves creating new ones
                        const existingTargets: string[] = [];
                        const missingTargets: string[] = [];
                        for (const rel of targets) {
                            try {
                                const parts = rel.split('/').filter(Boolean);
                                const uri = vscode.Uri.joinPath(moduleRoot, ...parts);
                                await vscode.workspace.fs.stat(uri);
                                existingTargets.push(rel);
                            } catch {
                                missingTargets.push(rel);
                            }
                        }
                        let finalTargets = existingTargets.slice();
                        if (missingTargets.length) {
                            const consentNew = await vscode.window.showQuickPick([
                                { label: 'No (edit existing files only)', picked: true },
                                { label: `Yes (allow creating ${missingTargets.length} new file(s))` }
                            ], { placeHolder: 'Some target files do not exist. Allow creating them?' });
                            const allowCreate = consentNew?.label?.startsWith('Yes');
                            if (allowCreate) {
                                finalTargets = existingTargets.concat(missingTargets);
                            }
                        }
                        if (!finalTargets.length) {
                            vscode.window.showWarningMessage('No existing files selected for modification.');
                            return;
                        }

                        // Generate proposed updated contents per target file
                        const proposed: Array<{ uri: vscode.Uri; current: string; updated: string }> = [];
                        const progressWin = vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: 'Generating modifications…', cancellable: false }, async progress => {
                            let idx = 0;
                            for (const rel of finalTargets) {
                                idx++;
                                progress.report({ message: `${rel} (${idx}/${targets.length})` });
                                this._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.started', payload: { path: rel } } });
                                try {
                                    const parts = rel.split('/').filter(Boolean);
                                    const uri = vscode.Uri.joinPath(moduleRoot, ...parts);
                                    let current = '';
                                    try { const b = await vscode.workspace.fs.readFile(uri); current = Buffer.from(b).toString('utf8'); } catch { }
                                    // Add lightweight XML fallback guidance
                                    const xmlHint = /\.xml$/i.test(rel)
                                        ? `\n\nXML Anchor Guidance: If the primary anchor is missing, prefer inserting after <field name=\"partner_id\"/> or within the first <sheet>. Ensure inherit_id references are correct.`
                                        : '';
                                    const editGuard = `\n\n[EDIT-ONLY]\n- Modify the existing file content in-place.\n- Do NOT create new files unless explicitly authorized.\n- Maintain module structure and imports.\n`;
                                    const reqWithGuard = (requirements || '') + xmlHint + editGuard;
                                    const singlePrompt = { contents: prompts.createFileContentForModificationPrompt(reqWithGuard, tasks, version, moduleName, rel, current || null), config: { temperature: 0.2, mode: 'edit' } } as any;
                                    const updatedRaw = await generateContent(singlePrompt, this._context);
                                    // Robustly strip Markdown code fences and normalize content
                                    const raw = String(updatedRaw ?? '');
                                    let updated = raw.trim();
                                    // Prefer extracting inner of a single fenced block with optional language tag and whitespace
                                    updated = updated.replace(
                                        /^```(?:[a-zA-Z0-9_-]+)?\s*\r?\n?([\s\S]*?)\r?\n?```\s*$/m,
                                        '$1'
                                    ).trim();
                                    // Fallback: generic fence slice if still wrapped
                                    if (updated.startsWith('```') && updated.endsWith('```')) {
                                        updated = updated.slice(3, -3).trim();
                                    }
                                    // Normalize line endings to LF to reduce spurious diffs
                                    updated = updated.replace(/\r\n/g, '\n');
                                    if (updated && updated.trim() && updated.trim() !== current.trim()) {
                                        proposed.push({ uri, current, updated });
                                        this._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.done', payload: { path: rel, size: updated.length } } });
                                    } else {
                                        this._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.empty', payload: { path: rel } } });
                                    }
                                } catch (e) {
                                    this._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.error', payload: { path: rel, error: String(e) } } });
                                }
                            }
                        });
                        await progressWin;

                        if (!proposed.length) {
                            vscode.window.showWarningMessage('No changes were proposed by the AI for the selected targets.');
                            return;
                        }
                        // Build a map and send to webview for diff review
                        const proposedMap: Record<string, { uri: vscode.Uri; current: string; updated: string }> = {};
                        const filesForWeb = proposed.map(p => {
                            const rel = vscode.workspace.asRelativePath(p.uri).replace(/\\/g, '/');
                            proposedMap[rel] = p;
                            return { path: rel, current: p.current, updated: p.updated };
                        });
                        (this as any)._proposedChanges = proposedMap;
                        this._view?.webview.postMessage({ command: 'showDiff', files: filesForWeb });
                        // Fallback: offer QuickPick-based apply if webview diff UI is not used
                        const alt = await vscode.window.showInformationMessage('Review ready. Apply changes via Diff panel or use QuickPick?', 'Use QuickPick Apply', 'Cancel');
                        if (alt === 'Use QuickPick Apply') {
                            const quickItems = proposed.map(p => ({ label: vscode.workspace.asRelativePath(p.uri), picked: true, p }));
                            const picked = await vscode.window.showQuickPick(quickItems, { canPickMany: true, placeHolder: 'Select files to apply' });
                            if (picked && picked.length) {
                                const toApply = picked.map(i => i.p);
                                const openedDocs = new Set<string>();
                                for (const p of toApply) {
                                    try {
                                        await vscode.workspace.fs.writeFile(p.uri, Buffer.from(p.updated, 'utf8'));
                                        this._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.written', payload: { path: vscode.workspace.asRelativePath(p.uri) } } });
                                        const key = p.uri.toString();
                                        if (!openedDocs.has(key)) {
                                            openedDocs.add(key);
                                            try { await vscode.window.showTextDocument(p.uri, { preview: false, preserveFocus: true }); } catch { }
                                        }
                                    } catch (e) {
                                        this._view?.webview.postMessage({ type: 'progress', ev: { type: 'file.error', payload: { path: vscode.workspace.asRelativePath(p.uri), error: String(e) } } });
                                    }
                                }
                                vscode.window.showInformationMessage(`Applied ${toApply.length} change(s) to the existing project.`);
                            }
                        }
                        // Defer writing until user applies from webview
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to modify existing project: ${(err as Error).message}`);
                    }
                }
                return;
            }
            if (message.command === 'startEditExisting') {
                // Start edit scan and context preparation; prompt will be typed in sidebar
                try {
                    await vscode.commands.executeCommand('assistaX.editOdooProject');
                } catch (e: any) {
                    this._view?.webview.postMessage({ command: 'aiReply', text: `Failed to start edit: ${e?.message || e}` });
                }
                return;
            }
            if (message.command === 'requestPlanResend') {
                try {
                    let lp = (this as any)._lastPlan as any;
                    if (!lp) {
                        try { lp = this._context.workspaceState.get('assistaX.lastPlan'); } catch {}
                    }
                    const req = String(lp?.requirements || '');
                    const tsk = String(lp?.tasks || '');
                    if (!req && !tsk) {
                        this._view?.webview.postMessage({ command: 'aiReply', text: 'Assista X: Plan not available to resend. Please try again.' });
                        return;
                    }
                    // Repaint plan sections first
                    this._view?.webview.postMessage({ command: 'planReset', timestamp: Date.now() });
                    if (req) this._view?.webview.postMessage({ command: 'planSection', section: 'requirements', markdown: req, timestamp: Date.now() });
                    if (tsk) this._view?.webview.postMessage({ command: 'planSection', section: 'tasks', markdown: tsk, timestamp: Date.now() });
                    // Legacy compact show for safety
                    try { this._view?.webview.postMessage({ command: 'showPlan', requirements: req, tasks: tsk, existingFiles: lp?.existingInPlan || [], newFiles: lp?.missingInPlan || [], timestamp: Date.now() }); } catch {}
                    // Now show confirm again
                    this._view?.webview.postMessage({ command: 'confirmApplyPlan', prompt: lp?.userPrompt || '', detectedVersion: lp?.version || '' });
                } catch (e) {
                    this._view?.webview.postMessage({ command: 'aiReply', text: `Assista X: Failed to resend plan. ${String((e as Error)?.message || e)}` });
                }
                return;
            }
            if (message.command === 'requestEditScan') {
                // Re-run edit scan
                try {
                    await vscode.commands.executeCommand('assistaX.editOdooProject');
                } catch (e: any) {
                    this._view?.webview.postMessage({ command: 'aiReply', text: `Failed to start edit: ${e?.message || e}` });
                }
                return;
            }
            if (message.command === 'sendMessage') {
                const { generateContent } = await import('../ai.js');
                try {
                    const text: string = String(message.text || '');
                    const store = getConversationStore(this._context);
                    // Persist user message (UI + API history)
                    await store.addUserMessage(text);
                    // Build messages array for provider
                    const apiMessages = store.getApiHistory().map(m => ({ role: m.role, content: m.content }));
                    const aiResponse = await generateContent({ messages: apiMessages, config: { mode: 'general' } }, this._context);
                    // Persist assistant message
                    await store.addAssistantMessage(aiResponse);
                    // Return to webview
                    setTimeout(() => {
                        this._view?.webview.postMessage({ command: 'aiReply', text: aiResponse });
                    }, 250);
                } catch (error) {
                    this._view?.webview.postMessage({ command: 'aiReply', text: `Sorry, I encountered an error while processing your request: ${(error as Error).message}. Please check your API settings in the extension settings.` });
                }
            } else if (message.command === 'editRequest') {
                // Route sidebar chat to the unified Apply Edits pipeline and return
                try {
                    const routedText: string = String(message.text || '');
                    // Build optional attachedContext from message.context (files/folders)
                    async function collectContext(items: any[]): Promise<Array<{ path: string; content: string }>> {
                        const out: Array<{ path: string; content: string }> = [];
                        if (!Array.isArray(items) || !items.length) return out;
                        const wsFolders = vscode.workspace.workspaceFolders || [];
                        const isInWs = (u: vscode.Uri) => wsFolders.some(w => u.fsPath.startsWith(w.uri.fsPath + require('path').sep) || u.fsPath === w.uri.fsPath);
                        const readAllFiles = async (uri: vscode.Uri) => {
                            try {
                                const stat = await vscode.workspace.fs.stat(uri);
                                if (stat.type === vscode.FileType.File) {
                                    const bytes = await vscode.workspace.fs.readFile(uri);
                                    out.push({ path: uri.fsPath, content: Buffer.from(bytes).toString('utf8') });
                                } else if (stat.type === vscode.FileType.Directory) {
                                    const entries = await vscode.workspace.fs.readDirectory(uri);
                                    for (const [name, type] of entries) {
                                        const child = vscode.Uri.joinPath(uri, name);
                                        if (type === vscode.FileType.File) {
                                            const bytes = await vscode.workspace.fs.readFile(child);
                                            out.push({ path: child.fsPath, content: Buffer.from(bytes).toString('utf8') });
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
                            if (!isInWs(uri)) continue; // enforce workspace-only
                            await readAllFiles(uri);
                        }
                        return out;
                    }
                    const attachedContext = await collectContext(message?.context || []);
                    await vscode.commands.executeCommand('assistaX.applyEditsFromPrompt', { userPrompt: routedText, attachedContext });
                    return;
                } catch { /* fall through to legacy as a safety net */ }
                    const { generateContent, generateOdooModule } = await import('../ai.js');
                try {
                    // Strict check: ensure an Odoo project is open before proceeding
                    const folders = vscode.workspace.workspaceFolders || [];
                    if (!folders.length) {
                        this._view?.webview.postMessage({ command: 'aiReply', text: '❌ No workspace is open. Please open your Odoo project folder in VS Code.' });
                        return;
                    }
                    const exclude = '**/{.git,node_modules,venv,env,dist,build,\.venv,\.env}/**';
                    const manifests = await vscode.workspace.findFiles('**/__manifest__.py', exclude, 5);
                    if (!manifests.length) {
                        this._view?.webview.postMessage({ command: 'aiReply', text: '❌ No Odoo module detected in the open workspace (no __manifest__.py found). Please open an Odoo project, then try Edit again.' });
                        return;
                    }
                    // Detect Odoo version from odoo/release.py if available
                    let detectedVersion = '';
                    try {
                        const relFiles = await vscode.workspace.findFiles('**/odoo/release.py', exclude, 2);
                        if (relFiles && relFiles.length) {
                            const bytes = await vscode.workspace.fs.readFile(relFiles[0]);
                            const text = new TextDecoder('utf-8').decode(bytes);
                            // Try version_info = (MAJOR, MINOR, ...)
                            const m = text.match(/version_info\s*=\s*\((\d+)\s*,\s*(\d+)/);
                            if (m && m[1]) {
                                detectedVersion = `${m[1]}.0`;
                            } else {
                                // Fallback: __version__ = "17.0" or similar
                                const m2 = text.match(/__version__\s*=\s*['\"](\d+(?:\.\d+)*)['\"]/);
                                if (m2 && m2[1]) {
                                    detectedVersion = m2[1];
                                }
                            }
                        }
                    } catch { }
                    const editText: string = String(message.text || '');
                    // Edit scope: by default, only touch currently open editors; optionally expand via settings
                    const cfg = vscode.workspace.getConfiguration('assistaX');
                    const editScope = String(cfg.get('editScope') || 'openEditors');
                    const strictActiveOnly = Boolean(cfg.get('edit.strictActiveFile', true));
                    // Enforce context: require an active editor file for Edit mode
                    const activeEditor = vscode.window.activeTextEditor;
                    if (!activeEditor || !activeEditor.document || !activeEditor.document.uri) {
                        this._view?.webview.postMessage({ command: 'aiReply', text: '❌ No file is open. Open a file to provide context for Edit mode, then try again.' });
                        return;
                    }
                    // Ask permission to edit the active file
                    const activeRelForMsg = vscode.workspace.asRelativePath(activeEditor.document.uri).replace(/\\/g, '/');
                    const consent = await vscode.window.showInformationMessage(
                        `Use the active file as a primary edit target?\n${activeRelForMsg}`,
                        { modal: true },
                        'Yes',
                        'No'
                    );
                    const includeActiveFile = consent === 'Yes';

                    // Fast-path A: change field label (string attribute) intent
                    // Examples:
                    //  - change the label of x_custom_field to "Alternative phone number"
                    //  - change the name of the field x_custom_field into Alternative phone number
                    //  - set x_custom_field label to Alternative phone number
                    const labelMatch = (() => {
                        const rxes = [
                            /(?:change|chnage|set|update)\s+(?:the\s+)?(?:label|name|display\s*name)\s+(?:of\s+)?([a-zA-Z0-9_.]+)\s+(?:of\s+)?(?:to|into)\s+"?([^"\n]+?)"?\s*$/i,
                            /(?:change|chnage|set|update)\s+([a-zA-Z0-9_.]+)\s+(?:label|name)\s+(?:of\s+)?(?:to|into)\s+"?([^"\n]+?)"?\s*$/i
                        ];
                        for (const r of rxes) {
                            const m = editText.match(r);
                            if (m && m[1] && m[2]) return m;
                        }
                        return null;
                    })();
                    if (labelMatch) {
                        const fieldName = labelMatch[1];
                        const newLabel = labelMatch[2];
                        const escField = fieldName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
                        const exclude = '**/{.git,node_modules,venv,env,dist,build,\.venv,\.env}/**';
                        const patterns = ['**/*.py', '**/*.xml'];
                        const proposedMap: Record<string, { uri: vscode.Uri; current: string; updated: string }> = {};
                        const relOf = (u: vscode.Uri) => vscode.workspace.asRelativePath(u);

                        const applyPy = (text: string): string => {
                            let out = text;
                            // Replace existing string="..." within the field declaration
                            const reReplace = new RegExp(`(\\b${escField}\\s*=\\s*fields\\.\\w+\\s*\\([^)]*?\\bstring\\s*=\\s*["\'])[^"']*(["\'])`, 'g');
                            out = out.replace(reReplace, `$1${newLabel}$2`);
                            // If no string present, insert string as first kwarg
                            const reHasDecl = new RegExp(`\\b${escField}\\s*=\\s*fields\\.\\w+\\s*\\(`);
                            const reHasString = new RegExp(`\\b${escField}\\s*=\\s*fields\\.\\w+\\s*\\([^)]*?\\bstring\\s*=`);
                            if (reHasDecl.test(text) && !reHasString.test(text)) {
                                const reInsert = new RegExp(`(\\b${escField}\\s*=\\s*fields\\.\\w+\\s*\\()`, 'g');
                                out = out.replace(reInsert, `$1string=\"${newLabel}\", `);
                            }
                            return out;
                        };
                        const applyXml = (text: string): string => {
                            let out = text;
                            // Replace existing string="..." on the field tag with name=fieldName
                            const reReplace = new RegExp(`(<field\\s+[^>]*name=\"${escField}\"[^>]*\\bstring=\\s*["\'])[^"']*(["\'])`, 'g');
                            out = out.replace(reReplace, `$1${newLabel}$2`);
                            // If no string attribute present, add it after name="..."
                            const reNoString = new RegExp(`(<field\\s+[^>]*name=\"${escField}\")(?![^>]*\\bstring=)`, 'g');
                            out = out.replace(reNoString, `$1 string=\"${newLabel}\"`);
                            return out;
                        };

                        try {
                            const active = vscode.window.activeTextEditor?.document?.uri;
                            const processOne = async (uri: vscode.Uri) => {
                                try {
                                    const bytes = await vscode.workspace.fs.readFile(uri);
                                    const content = new TextDecoder('utf-8').decode(bytes);
                                    if (!content.includes(fieldName)) return;
                                    let updated = content;
                                    if (/\.py$/i.test(uri.fsPath)) updated = applyPy(updated);
                                    else if (/\.xml$/i.test(uri.fsPath)) updated = applyXml(updated);
                                    if (updated !== content) {
                                        const rel = relOf(uri);
                                        proposedMap[rel] = { uri, current: content, updated };
                                    }
                                } catch { }
                            };

                            // 1) Active editor first
                            if (active) {
                                await processOne(active);
                            } else {
                                this._view?.webview.postMessage({ command: 'aiReply', text: '❌ No file is open. Open a relevant file then try again.' });
                                return;
                            }
                            // If active didn't produce any change, still continue but warn
                            if (!Object.keys(proposedMap).length) {
                                this._view?.webview.postMessage({ command: 'aiReply', text: `Note: The open file did not produce a label change for \"${fieldName}\". I will scan related files.` });
                            }

                            // 2) Include other visible editors: process their files
                            try {
                                for (const ed of vscode.window.visibleTextEditors || []) {
                                    const u = ed?.document?.uri;
                                    if (!u) continue;
                                    if (u.toString() !== active.toString()) {
                                        await processOne(u);
                                    }
                                }
                            } catch { }

                            // 3) Optionally scan directories if setting allows (not default)
                            if (editScope !== 'openEditors') {
                                const path = require('path');
                                const searchRoots = new Set<string>([path.dirname(active.fsPath)]);
                                try {
                                    for (const ed of vscode.window.visibleTextEditors || []) {
                                        const u = ed?.document?.uri;
                                        if (!u) continue;
                                        searchRoots.add(path.dirname(u.fsPath));
                                    }
                                } catch { }
                                for (const root of searchRoots) {
                                    const searchRoot = vscode.Uri.file(root);
                                    for (const pat of patterns) {
                                        const relPat = new vscode.RelativePattern(searchRoot, pat);
                                        const files = await vscode.workspace.findFiles(relPat, exclude, 500);
                                        for (const f of files) {
                                            const relKey = relOf(f);
                                            if (proposedMap[relKey]) { continue; }
                                            try {
                                                const bytes = await vscode.workspace.fs.readFile(f);
                                                const content = new TextDecoder('utf-8').decode(bytes);
                                                if (!content.includes(fieldName)) continue;
                                                let updated = content;
                                                if (/\.py$/i.test(f.fsPath)) updated = applyPy(updated);
                                                else if (/\.xml$/i.test(f.fsPath)) updated = applyXml(updated);
                                                if (updated !== content) {
                                                    proposedMap[relKey] = { uri: f, current: content, updated };
                                                }
                                            } catch { }
                                        }
                                    }
                                }
                            }

                            const keys = Object.keys(proposedMap);
                            if (!keys.length) {
                                this._view?.webview.postMessage({ command: 'aiReply', text: `No label changes were detected for field \"${fieldName}\" in the vicinity of open files.` });
                                return;
                            }
                            const filesForWeb = keys.map(rel => ({ path: rel, current: proposedMap[rel].current, updated: proposedMap[rel].updated }));
                            ; (this as any)._proposedChanges = proposedMap;
                            this._view?.webview.postMessage({ command: 'aiReply', text: `Proposed updating the label of \"${fieldName}\" to \"${newLabel}\" in ${keys.length} file(s). Review and apply.` });
                            this._view?.webview.postMessage({ command: 'showDiff', files: filesForWeb });
                            const alt = await vscode.window.showInformationMessage('Review ready. Apply changes via Diff panel or use QuickPick?', 'Use QuickPick Apply', 'Cancel');
                            if (alt === 'Use QuickPick Apply') {
                                const picks = await vscode.window.showQuickPick(keys.map(k => ({ label: k, description: 'Apply change', k })), { canPickMany: true, placeHolder: 'Select files to apply' });
                                if (picks && picks.length) {
                                    let applied = 0;
                                    for (const p of picks) {
                                        const rel = (p as any).k as string;
                                        const item = proposedMap[rel];
                                        if (!item) continue;
                                        try {
                                            await vscode.workspace.fs.writeFile(item.uri, Buffer.from(item.updated, 'utf8'));
                                            applied++;
                                            try { await vscode.window.showTextDocument(item.uri, { preview: false, preserveFocus: true }); } catch { }
                                        } catch (e) {
                                            vscode.window.showWarningMessage(`Failed to write ${rel}: ${String(e)}`);
                                        }
                                    }
                                    this._view?.webview.postMessage({ command: 'aiReply', text: `Applied ${applied} change(s).` });
                                }
                            }
                            return; // stop here; label flow handled
                        } catch (e) {
                            this._view?.webview.postMessage({ command: 'aiReply', text: `Failed to prepare label change: ${(e as Error).message}` });
                            return;
                        }
                    }

                    // Fast-path: detect rename intent (handles minor typos/variants)
                    // Examples matched:
                    //  - change the field name from "old" to "new"
                    //  - chnage the filed name from "old" to "new"
                    //  - rename "old" to "new"
                    //  - rename old to new
                    let renameMatch = editText.match(/change|chnage/i) && editText.match(/field|filed/i)
                        ? editText.match(/from\s+\"?([^\"\s]+)\"?\s+to\s+\"?([^\"\s]+)\"?/i)
                        : null;
                    if (!renameMatch) {
                        renameMatch = editText.match(/rename\s+\"?([^\"\s]+)\"?\s+to\s+\"?([^\"\s]+)\"?/i);
                    }
                    // Additional pattern: "change the <old> field/filed [name|anme|label]? to <new>"
                    if (!renameMatch) {
                        renameMatch = editText.match(/change\s+(?:the\s+)?([a-zA-Z0-9_.]+)\s+fil?e?ld?(?:\s+(?:name|anme|label))?\s+to\s+\"?([a-zA-Z0-9_.]+)\"?/i);
                    }
                    if (renameMatch && renameMatch[1] && renameMatch[2]) {
                        const oldName = renameMatch[1];
                        const newName = renameMatch[2];
                        // Detect intent to change field type to Integer (handles typos and phrasing)
                        const wantsInteger = /\b(integer|int)\b/i.test(editText) && /\b(type|field\s+type|should\s+be|make\s+it)\b/i.test(editText);
                        const desiredType = wantsInteger ? 'Integer' : '';
                        // Prefer active editor file if relevant
                        const exclude = '**/{.git,node_modules,venv,env,dist,build,\.venv,\.env}/**';
                        const patterns = ['**/*.py', '**/*.xml', '**/*.csv', '**/*.js', '**/*.ts', '**/*.json'];
                        const proposedMap: Record<string, { uri: vscode.Uri; current: string; updated: string }> = {};
                        const relOf = (u: vscode.Uri) => vscode.workspace.asRelativePath(u);
                        try {
                            // 1) Active editor must contain the old name; otherwise stop and ask the user to open the correct file
                            const active = vscode.window.activeTextEditor?.document?.uri;
                            let activeHas = false;
                            if (active) {
                                try {
                                    const bytes = await vscode.workspace.fs.readFile(active);
                                    const content = new TextDecoder('utf-8').decode(bytes);
                                    if (content.includes(oldName)) {
                                        activeHas = true;
                                        // Global rename first
                                        let updated = content.replace(new RegExp(oldName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'g'), newName);
                                        // If prompt asks for integer, and this is a Python file, adjust field type to Integer
                                        try {
                                            if (/\binteger\b/i.test(editText) && require('path').extname(active.fsPath) === '.py') {
                                                const newEsc = newName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
                                                updated = updated.replace(new RegExp(`\\b${newEsc}\\s*=\\s*fields\\.\\w+`, 'g'), `${newName} = fields.Integer`);
                                            }
                                        } catch { }
                                        if (updated !== content) {
                                            const rel = relOf(active);
                                            proposedMap[rel] = { uri: active, current: content, updated };
                                        }
                                    }
                                } catch { }
                            }
                            if (!activeHas) {
                                this._view?.webview.postMessage({ command: 'aiReply', text: `The open file does not contain "${oldName}". Open the correct file that has this name, then retry.` });
                                return;
                            }

                            // 2) Optionally scan only the active file's directory for related references (if allowed)
                            if (editScope !== 'openEditors') {
                                const path = require('path');
                                const searchRoot = vscode.Uri.file(path.dirname(active!.fsPath));
                                for (const pat of patterns) {
                                    const relPat = new vscode.RelativePattern(searchRoot, pat);
                                    const files = await vscode.workspace.findFiles(relPat, exclude, 500);
                                    for (const f of files) {
                                        const relKey = relOf(f);
                                        if (proposedMap[relKey]) { continue; }
                                        try {
                                            const bytes = await vscode.workspace.fs.readFile(f);
                                            const content = new TextDecoder('utf-8').decode(bytes);
                                            if (!content.includes(oldName)) continue;
                                            // Global rename first
                                            let updated = content.replace(new RegExp(oldName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'g'), newName);
                                            // If prompt asks for integer, and this is a Python file, adjust field type to Integer
                                            try {
                                                if (/\binteger\b/i.test(editText) && require('path').extname(f.fsPath) === '.py') {
                                                    const newEsc = newName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
                                                    updated = updated.replace(new RegExp(`\\b${newEsc}\\s*=\\s*fields\\.\\w+`, 'g'), `${newName} = fields.Integer`);
                                                }
                                            } catch { }
                                            if (updated !== content) {
                                                proposedMap[relKey] = { uri: f, current: content, updated };
                                            }
                                        } catch { }
                                    }
                                }
                            }
                            // Additionally, process any other visible editors (open files) similarly
                            try {
                                const editors = vscode.window.visibleTextEditors || [];
                                for (const ed of editors) {
                                    const uri = ed?.document?.uri;
                                    if (!uri || (active && uri.toString() === active.toString())) continue;
                                    // Propose change for the editor's own file first
                                    try {
                                        const b = await vscode.workspace.fs.readFile(uri);
                                        const txt = new TextDecoder('utf-8').decode(b);
                                        if (txt.includes(oldName)) {
                                            let upd = txt.replace(new RegExp(oldName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'g'), newName);
                                            // If integer requested and python file, adjust declaration type
                                            try {
                                                if (/\binteger\b/i.test(editText) && require('path').extname(uri.fsPath) === '.py') {
                                                    const newEsc = newName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
                                                    upd = upd.replace(new RegExp(`\\b${newEsc}\\s*=\\s*fields\\.\\w+`, 'g'), `${newName} = fields.Integer`);
                                                }
                                            } catch { }
                                            if (upd !== txt) {
                                                const relK = relOf(uri);
                                                if (!proposedMap[relK]) {
                                                    proposedMap[relK] = { uri, current: txt, updated: upd };
                                                }
                                            }
                                        }
                                    } catch { }
                                    // Then (optionally) scan that file's directory for related references
                                    if (editScope !== 'openEditors') {
                                        try {
                                            const pth = require('path');
                                            const dirRoot = vscode.Uri.file(pth.dirname(uri.fsPath));
                                            for (const pat of patterns) {
                                                const rp = new vscode.RelativePattern(dirRoot, pat);
                                                const fs = await vscode.workspace.findFiles(rp, exclude, 500);
                                                for (const f of fs) {
                                                    const rk = relOf(f);
                                                    if (proposedMap[rk]) { continue; }
                                                    try {
                                                        const bb = await vscode.workspace.fs.readFile(f);
                                                        const ct = new TextDecoder('utf-8').decode(bb);
                                                        if (!ct.includes(oldName)) continue;
                                                        let up2 = ct.replace(new RegExp(oldName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&'), 'g'), newName);
                                                        try {
                                                            if (/\binteger\b/i.test(editText) && require('path').extname(f.fsPath) === '.py') {
                                                                const newEsc = newName.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
                                                                up2 = up2.replace(new RegExp(`\\b${newEsc}\\s*=\\s*fields\\.\\w+`, 'g'), `${newName} = fields.Integer`);
                                                            }
                                                        } catch { }
                                                        if (up2 !== ct) {
                                                            proposedMap[rk] = { uri: f, current: ct, updated: up2 };
                                                        }
                                                    } catch { }
                                                }
                                            }
                                        } catch { }
                                    }
                                }
                            } catch { }
                            const keys = Object.keys(proposedMap);
                            if (!keys.length) {
                                this._view?.webview.postMessage({ command: 'aiReply', text: `No occurrences of "${oldName}" found to rename.` });
                                return;
                            }
                            // Prepare files for webview diff UI
                            const filesForWeb = keys.map(rel => ({ path: rel, current: proposedMap[rel].current, updated: proposedMap[rel].updated }));
                            ; (this as any)._proposedChanges = proposedMap;
                            this._view?.webview.postMessage({ command: 'aiReply', text: `Proposed renaming "${oldName}" → "${newName}" in ${keys.length} file(s). Review and apply selected changes.` });
                            this._view?.webview.postMessage({ command: 'showDiff', files: filesForWeb });
                            // Fallback: offer QuickPick-based apply in case the webview doesn't present Apply UI
                            const alt = await vscode.window.showInformationMessage('Review ready. Apply changes via Diff panel or use QuickPick?', 'Use QuickPick Apply', 'Cancel');
                            if (alt === 'Use QuickPick Apply') {
                                const picks = await vscode.window.showQuickPick(keys.map(k => ({ label: k, description: 'Apply change', k })), { canPickMany: true, placeHolder: 'Select files to apply' });
                                if (picks && picks.length) {
                                    let applied = 0;
                                    for (const p of picks) {
                                        const rel = (p as any).k as string;
                                        const item = proposedMap[rel];
                                        if (!item) continue;
                                        try {
                                            await vscode.workspace.fs.writeFile(item.uri, Buffer.from(item.updated, 'utf8'));
                                            applied++;
                                            try { await vscode.window.showTextDocument(item.uri, { preview: false, preserveFocus: true }); } catch { }
                                        } catch (e) {
                                            vscode.window.showWarningMessage(`Failed to write ${rel}: ${String(e)}`);
                                        }
                                    }
                                    this._view?.webview.postMessage({ command: 'aiReply', text: `Applied ${applied} change(s).` });
                                }
                            }
                            return; // stop here; wait for user to apply/cancel
                        } catch (e) {
                            this._view?.webview.postMessage({ command: 'aiReply', text: `Failed to prepare rename: ${(e as Error).message}` });
                            return;
                        }
                    }

                    // Edit mode only: disable create-module branching
                    const chosenMode: 'edit' = 'edit';
                    const chatPrompt = {
                        contents: `You are an expert Odoo project editor. The user wants to edit an existing Odoo module.\n\n${detectedVersion ? `Project Odoo version: ${detectedVersion}. Use this version for compatibility (APIs, views, and dependencies).` : ''}\n\nUser request:\n${editText}\n\nRespond with a concrete plan of changes (files to modify/create, and concise diffs or code blocks). Keep changes minimal and safe. If something is ambiguous, ask a precise follow-up question. Do not ask for the Odoo version; assume ${detectedVersion || 'the latest stable'} if needed.`,
                        config: {
                            systemInstruction: 'You are an Odoo expert focused on safe, minimal edits. Propose file-specific changes and diffs. Do not apply changes automatically; only propose.'
                        }
                    };
                    const aiResponse = await generateContent(chatPrompt, this._context);
                    // Use the unified Edit pipeline which generates Requirements/Tasks and plan cards
                    // before asking for confirmation. This ensures the user sees the descriptive plan
                    // (what will change and which files) rather than only Proceed/Cancel buttons.
                    try {
                        await vscode.commands.executeCommand('assistaX.applyEditsFromPrompt', { userPrompt: editText });
                        return;
                    } catch {
                        // Fallback: show raw AI response and do not present confirmation without a plan
                        this._view?.webview.postMessage({ command: 'aiReply', text: aiResponse });
                        return;
                    }
                } catch (error) {
                    this._view?.webview.postMessage({ command: 'aiReply', text: `Edit planning failed: ${(error as Error).message}` });
                }
            } else if (message.command === 'buttonClick') {
                vscode.window.showInformationMessage(`${message.button} button clicked!`);
            } else if (message.command === 'loadSettings') {
                // Load settings from VS Code configuration
                const config = vscode.workspace.getConfiguration('assistaX');
                const providers = config.get<any>('providers', {
                    google: { apiKey: '', model: '' },
                    openai: { apiKey: '', model: '' },
                    anthropic: { apiKey: '', model: '' },
                    openrouter: { apiKey: '', model: '', customUrl: '' },
                    custom: { apiKey: '', model: '', customUrl: '' }
                });
                const activeProvider = config.get<string>('activeProvider', 'openrouter');
                // Inject API keys from Secret Storage
                const providerKeys = ['google', 'openai', 'anthropic', 'openrouter', 'custom'];
                for (const p of providerKeys) {
                    const secretKey = `assistaX.apiKey.${p}`;
                    const secret = await this._context.secrets.get(secretKey);
                    if (!providers[p]) { providers[p] = {}; }
                    providers[p].apiKey = secret || providers[p].apiKey || '';
                }
                this._view?.webview.postMessage({
                    command: 'loadSettings',
                    settings: { activeProvider, providers }
                });
            } else if (message.command === 'saveSettings') {
                // Persist settings into VS Code configuration
                const { activeProvider, providers } = message.settings || {};
                if (!activeProvider) {
                    this._view?.webview.postMessage({ command: 'saveError', error: 'No provider selected' });
                    return;
                }
                const config = vscode.workspace.getConfiguration('assistaX');
                try {
                    console.log('Saving activeProvider:', activeProvider); // Debug
                    // Separate secrets (apiKey) from normal config
                    const providerKeys = ['google', 'openai', 'anthropic', 'openrouter', 'custom'];
                    const toSave: any = {};
                    for (const p of providerKeys) {
                        const src = (providers && providers[p]) || {};
                        // Store API key in Secret Storage
                        const secretKey = `assistaX.apiKey.${p}`;
                        const apiKeyVal = src.apiKey || '';
                        if (apiKeyVal) {
                            await this._context.secrets.store(secretKey, apiKeyVal);
                        } else {
                            // If empty, remove any old stored secret
                            await this._context.secrets.delete(secretKey);
                        }
                        // Copy non-secret fields
                        const { apiKey, ...rest } = src;
                        toSave[p] = rest;
                    }

                    await config.update('activeProvider', activeProvider, vscode.ConfigurationTarget.Global);
                    await config.update('providers', toSave, vscode.ConfigurationTarget.Global);
                    console.log('Config updated successfully'); // Debug
                    this._view?.webview.postMessage({ command: 'saveSuccess' });
                } catch (e) {
                    console.error('Save settings error:', e);
                    this._view?.webview.postMessage({ command: 'saveError', error: (e as Error).message });
                }
            } else if (message.command === 'cancelGeneration') {
                // Immediate cancellation: set flag and notify UI to stop now
                this.requestCancel();
                this._view?.webview.postMessage({ command: 'generationCancelled', timestamp: Date.now() });
                this._view?.webview.postMessage({ command: 'statusBubble', action: 'hide' });
                this._view?.webview.postMessage({ command: 'clearConfirm' });
            } else if (message.command === 'cancelCurrent') {
                // Stop button in webview routes here; cancel any in-flight phase immediately
                this.requestCancel();
                this._view?.webview.postMessage({ command: 'generationCancelled', timestamp: Date.now() });
                this._view?.webview.postMessage({ command: 'statusBubble', action: 'hide' });
                this._view?.webview.postMessage({ command: 'clearConfirm' });
            } else if (message.command === 'beginGenerateModule') {
                // Begin generation from inside the sidebar webview (wizard-style)
                this.resetCancel();
                const prompt: string = (message.prompt || '').toString();
                const version: string = (message.version || '17.0').toString();
                const moduleName: string = (message.moduleName || '').toString();
                if (!prompt || !moduleName) {
                    this._view?.webview.postMessage({ command: 'aiReply', text: 'Please provide both description and module name.' });
                    return;
                }

                // Ask user to select parent folder where <moduleName> will be created
                const targetUris = await vscode.window.showOpenDialog({
                    title: 'Select parent folder for the module',
                    canSelectFiles: false,
                    canSelectFolders: true,
                    canSelectMany: false,
                    openLabel: 'Select'
                });
                if (!targetUris || !targetUris[0]) {
                    this._view?.webview.postMessage({ command: 'generationMessage', sender: 'ai', text: 'Cancelled: No folder selected.' });
                    return;
                }
                const parentFolder = targetUris[0];
                const folderUri = vscode.Uri.joinPath(parentFolder, moduleName);

                // Stream updates into the sidebar webview
                const send = (payload: any) => {
                    if (this.isCancelRequested()) return; // suppress messages after cancel
                    this._view?.webview.postMessage(payload);
                };
                send({
                    command: 'generationStart',
                    message: `🚀 Starting module generation...\n\n**Module:** "${moduleName}"\n**Odoo Version:** ${version}\n**Request:** "${prompt}"`,
                    moduleName, version, timestamp: Date.now()
                });

                try {
                    await vscode.workspace.fs.createDirectory(folderUri);

                    // In-sidebar progress (no VS Code notification), with cancel support
                    // We already validated during plan phase; skip showing a validation chip here
                    send({ command: 'generationMessage', sender: 'ai', text: '⚙️ Starting generation…', timestamp: Date.now() });

                    // Prepare normalization helper and streaming write support BEFORE generation starts
                    const allowedTopDirs = new Set(['controllers','models','security','views','data','static','report','wizard','wizards','__test__']);
                    const normalizeGeneratedPath = (rawPath: string) => {
                        let p = String(rawPath || '')
                            .replace(/\\/g, '/')
                            .replace(/^\/+/, '')
                            .replace(/^\.[/]/, '');
                        const prefix = `${moduleName}/`;
                        while (p.startsWith(prefix)) p = p.slice(prefix.length);
                        let segs = p.split('/').filter(Boolean).map(s => s.trim().replace(/\s+/g, '_'));
                        if (segs.length >= 2 && !allowedTopDirs.has(segs[0]) && allowedTopDirs.has(segs[1])) {
                            segs.shift();
                        }
                        // Collapse to just the basename; ignore stray parent segments that aren't allowed
                        let fileName = segs.length ? segs[segs.length - 1] : p;
                        let ext = (fileName.split('.').pop() || '').toLowerCase();
                        const hasExt = /\.[A-Za-z0-9]+$/.test(fileName);
                        if (segs.length >= 1 && !allowedTopDirs.has(segs[0])) {
                            if (fileName === '__manifest__.py' || fileName === '__init__.py') {
                                segs = [fileName];
                            } else if (ext === 'py' || !hasExt) {
                                // Coerce extensionless names to Python models
                                if (!hasExt) {
                                    fileName = fileName.trim().replace(/\s+/g, '_').replace(/\.+/g, '_').toLowerCase() + '.py';
                                    ext = 'py';
                                }
                                if (/controller/.test(fileName)) segs = ['controllers', fileName];
                                else if (/wizard/.test(fileName)) segs = ['wizard', fileName];
                                else if (/report/.test(fileName)) segs = ['report', fileName];
                                else segs = ['models', fileName];
                            } else if (ext === 'xml') {
                                if (/security/.test(fileName)) { segs = ['security', 'security.xml']; fileName = 'security.xml'; }
                                else if (/report/.test(fileName)) segs = ['report', fileName];
                                else if (/menu/.test(fileName)) { segs = ['views', 'menus.xml']; fileName = 'menus.xml'; }
                                else if (/template/.test(fileName)) { segs = ['views', 'templates.xml']; fileName = 'templates.xml'; }
                                else {
                                    // Ensure *_views.xml naming for views
                                    if (!/_views\.xml$/i.test(fileName)) {
                                        fileName = fileName.replace(/\.xml$/i, '').replace(/\s+/g, '_') + '_views.xml';
                                    }
                                    segs = ['views', fileName];
                                }
                            } else if (ext === 'csv') {
                                segs = ['security', fileName];
                            } else if (/(png|jpg|jpeg|gif|svg)$/i.test(ext)) {
                                // route images under static/img unless specifically description assets (icon)
                                if (/icon\.(png|jpg|jpeg|gif|svg)$/i.test(fileName)) segs = ['static', 'description', fileName];
                                else segs = ['static', 'img', fileName];
                            } else if (ext === 'css') {
                                segs = ['static', 'css', fileName];
                            } else if (ext === 'js') {
                                segs = ['static', 'js', fileName];
                            } else if (ext === 'md') {
                                // Allow README.md at root
                                segs = [fileName];
                            } else {
                                // Unknown extension (e.g., 'estate.property') — treat as model .py
                                const base = fileName.replace(/\.[^.]+$/,'');
                                const coerced = base.trim().replace(/\s+/g,'_').replace(/\.+/g,'_').toLowerCase() + '.py';
                                segs = ['models', coerced];
                                fileName = coerced;
                                ext = 'py';
                            }
                        }
                        // If coerced/actual python looks like test_*.py, place under __test__
                        if ((ext === 'py' || !hasExt) && /^test_.*\.py$/i.test(fileName)) {
                            segs = ['__test__', fileName];
                        }
                        const cleanFile = segs.pop() || fileName;
                        const cleanDirs = segs;
                        // Normalize singular/plural for wizard folder
                        if (cleanDirs[0] === 'wizards') cleanDirs[0] = 'wizard';
                        return { cleanDirs, cleanFile };
                    };

                    const streamed = new Set<string>();
                    let firstRevealDone = false;
                    const openedDocs = new Set<string>();

                    const writeNow = async (odooRelPath: string, content: string) => {
                        const relative = String(odooRelPath || '').replace(/^\/+/, '').replace(/^\.[/]/, '');
                        const { cleanDirs, cleanFile } = normalizeGeneratedPath(relative);
                        if (cleanDirs.length > 0 && cleanFile === '__manifest__.py') { return; }
                        if (cleanDirs.length === 0 && !(cleanFile === '__init__.py' || cleanFile === '__manifest__.py')) {
                            const ext = (cleanFile.split('.').pop() || '').toLowerCase();
                            if (ext === 'py') cleanDirs.push('models');
                            else if (ext === 'xml') cleanDirs.push('views');
                            else if (ext === 'csv') cleanDirs.push('security');
                        }
                        const dirUri = cleanDirs.length ? vscode.Uri.joinPath(folderUri, ...cleanDirs) : folderUri;
                        await vscode.workspace.fs.createDirectory(dirUri);
                        const fullPath = vscode.Uri.joinPath(dirUri, cleanFile);
                        await vscode.workspace.fs.writeFile(fullPath, Buffer.from(String(content), 'utf8'));
                        try { await vscode.workspace.fs.stat(fullPath); } catch {}
                        const key = [...cleanDirs, cleanFile].join('/') || cleanFile;
                        streamed.add(key);
                        this._view?.webview.postMessage({
                            command: 'fileGenerated', sender: 'ai',
                            text: `✅ Generated file: \`${key}\`\nFull path: \`${fullPath.fsPath}\``,
                            filePath: key, fileAbsolutePath: fullPath.fsPath,
                            timestamp: Date.now()
                        });
                        // Open every generated file in the editor
                        try {
                            if (!openedDocs.has(fullPath.fsPath)) {
                                const doc = await vscode.workspace.openTextDocument(fullPath);
                                await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
                                openedDocs.add(fullPath.fsPath);
                            }
                        } catch (openErr) {
                            this._view?.webview.postMessage({ command: 'generationWarning', sender: 'ai', text: `⚠️ Failed to open in editor: ${key} → ${String((openErr as Error)?.message || openErr)}`, filePath: key, timestamp: Date.now() });
                        }
                        // Do not reveal in OS here to keep editor focused on opened document.
                        if (!firstRevealDone) { firstRevealDone = true; }
                    };

                    const { generateOdooModule } = await import('../ai.js');
                    const result = await generateOdooModule(
                        prompt,
                        version,
                        moduleName,
                        this._context,
                        { skipValidation: true },
                        (ev: any) => {
                            if (this.isCancelRequested()) return; // suppress after cancel
                            this._view?.webview.postMessage({ type: 'progress', ev });
                            // Also mirror important events as chat bubbles (sidebar folder flow)
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
                                    // Fire-and-forget streaming write
                                    writeNow(p, c).catch(err => {
                                        try { this._view?.webview.postMessage({ command: 'generationWarning', sender: 'ai', text: `⚠️ Stream write failed for ${p}: ${String(err?.message || err)}`, filePath: p, timestamp: Date.now() }); } catch {}
                                    });
                                }
                                if (text) {
                                    this._view?.webview.postMessage({ command: 'generationMessage', sender: 'ai', text, timestamp: Date.now() });
                                }
                            } catch { }
                        },
                        () => this.isCancelRequested()
                    );
                    const files = result.files || {};

                    send({ command: 'generationMessage', sender: 'ai', text: '📋 **Step 2/6: Requirements**', timestamp: Date.now() });
                    send({ command: 'generationMessage', sender: 'ai', text: '🔧 **Step 3/6: Technical Planning**', timestamp: Date.now() });
                    send({ command: 'generationMessage', sender: 'ai', text: '🎨 **Step 4/6: UI Design**', timestamp: Date.now() });
                    // Step 5: Write files with detailed logging
                    const fileCount = Object.keys(files).length;
                    send({ command: 'generationMessage', sender: 'ai', text: `💻 **Step 5/6: Code Generation** - Creating ${fileCount} files...`, timestamp: Date.now(), fileCount });

                    // Helper already defined above: normalizeGeneratedPath

                    let written = 0;
                    // firstRevealDone and openedDocs are defined above for streaming writes; reuse them here
                    const announcedDirs = new Set<string>();
                    for (const [filePath, content] of Object.entries(files)) {
                        if (this.isCancelRequested()) {
                            send({ command: 'generationMessage', sender: 'ai', text: '⏹️ Module generation cancelled by user.', timestamp: Date.now() });
                            break;
                        }
                        try {
                            // Normalize path
                            const relativePath = filePath.replace(/^\/+/, '').replace(/^\.\//, '');
                            const { cleanDirs, cleanFile } = normalizeGeneratedPath(relativePath);
                            const key = [...cleanDirs, cleanFile].join('/') || cleanFile;
                            if (streamed.has(key)) {
                                // Already written during streaming; skip duplicate
                                continue;
                            }
                            // Block nested manifest
                            if (cleanDirs.length > 0 && cleanFile === '__manifest__.py') {
                                send({ command: 'generationWarning', sender: 'ai', text: `⚠️ Skipped nested manifest: ${relativePath}` , filePath: relativePath, timestamp: Date.now() });
                                continue;
                            }
                            // Root-only constraint for __init__.py and __manifest__.py
                            if (cleanDirs.length === 0 && !(cleanFile === '__init__.py' || cleanFile === '__manifest__.py')) {
                                // Non-special file at root is not allowed; remap by extension
                                const ext = (cleanFile.split('.').pop() || '').toLowerCase();
                                if (ext === 'py') {
                                    cleanDirs.push('models');
                                } else if (ext === 'xml') {
                                    cleanDirs.push('views');
                                } else if (ext === 'csv') {
                                    cleanDirs.push('security');
                                }
                            }
                            const dirUri = cleanDirs.length ? vscode.Uri.joinPath(folderUri, ...cleanDirs) : folderUri;
                            const dirPathFs = dirUri.fsPath;
                            if (!announcedDirs.has(dirPathFs)) {
                                await vscode.workspace.fs.createDirectory(dirUri);
                                announcedDirs.add(dirPathFs);
                                send({ command: 'generationMessage', sender: 'ai', text: `📂 Ensured folder: \`${dirPathFs}\``, timestamp: Date.now() });
                            } else {
                                await vscode.workspace.fs.createDirectory(dirUri);
                            }
                            const fullPath = vscode.Uri.joinPath(dirUri, cleanFile);
                            const fullFsPath = fullPath.fsPath;
                            await vscode.workspace.fs.writeFile(fullPath, Buffer.from(String(content), 'utf8'));
                            // Verify immediately that the file exists on disk
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
                            // Open file in editor for batch-written files as well
                            try {
                                if (!openedDocs.has(fullFsPath)) {
                                    const doc = await vscode.workspace.openTextDocument(fullPath);
                                    await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: false });
                                    openedDocs.add(fullFsPath);
                                }
                            } catch (openErr) {
                                send({ command: 'generationWarning', sender: 'ai', text: `⚠️ Failed to open in editor: ${[...cleanDirs, cleanFile].join('/') || cleanFile} → ${String((openErr as Error)?.message || openErr)}`, filePath: fullFsPath, timestamp: Date.now() });
                            }
                            // On first successful write, reveal the module folder to show files appearing immediately
                            if (!firstRevealDone) {
                                firstRevealDone = true;
                                try { await vscode.commands.executeCommand('revealInOS', folderUri); } catch { }
                                try { await vscode.commands.executeCommand('revealInExplorer', folderUri); } catch { }
                            }
                            // Do not auto-open files here (we now open files immediately in chat flow per-file). Keeping sidebar flow silent.
                        } catch (err) {
                            const relativePath = (filePath || '').toString();
                            send({ command: 'generationWarning', sender: 'ai', text: `⚠️ Failed to create ${relativePath}: ${(err as Error).message}`, filePath: relativePath, timestamp: Date.now() });
                        }
                    }

                    // Step 6: Summary
                    const summaryMessage = `🎉 **Module Generation Complete!**\n\n**${moduleName}** module processed for Odoo ${version}.\n\n**Total Files Planned:** ${fileCount}\n**Successfully Created:** ${written}\n**📁 Base Folder:** \`${folderUri.fsPath}\``;
                    send({ command: 'generationComplete', sender: 'ai', text: summaryMessage, modulePath: folderUri.fsPath, filesCreated: written, totalFiles: fileCount, timestamp: Date.now() });
                    // Reveal the generated module folder in the Explorer for quick access
                    try { await vscode.commands.executeCommand('revealInExplorer', folderUri); } catch { }
                } catch (error) {
                    const msg = (error as Error).message || String(error);
                    if (msg.startsWith('Odoo validation failed:')) {
                        const reason = msg.replace(/^Odoo validation failed:\s*/, '').trim();
                        this._view?.webview.postMessage({
                            command: 'generationMessage',
                            sender: 'ai',
                            text: `❗ Your request doesn't look like an Odoo module task.\n\nI can generate Odoo modules, models, views, menus, and related files.\n\nReason: ${reason}\n\nTry something like:\n- "Real estate management module with properties, owners, and leases"\n- "Sales commission module for Odoo 17 with rules and reports"\n- "Helpdesk module with SLA timers and email gateway"`,
                            timestamp: Date.now()
                        });
                        this._view?.webview.postMessage({
                            command: 'generationMessage',
                            sender: 'ai',
                            text: 'Tip: Configure provider and model in Assista X Settings if needed (Command Palette → Assista X: Settings).',
                            timestamp: Date.now()
                        });
                    } else {
                        this._view?.webview.postMessage({ command: 'aiReply', text: `Error: ${msg}` });
                    }
                }
            }
        });
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const nonce = getNonce();
        const historyCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'history.css'));
        const historyJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'history.js'));
        const mainJsUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.js'));
        const mainCssUri = webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'media', 'main.css'));
        const templatePath = vscode.Uri.joinPath(this._extensionUri, 'media', 'webview.html').fsPath;
        try {
            const raw = fs.readFileSync(templatePath, 'utf8');
            return raw
                .replace(/\{\{cspSource\}\}/g, String(webview.cspSource))
                .replace(/\{\{nonce\}\}/g, String(nonce))
                .replace(/\{\{historyCssUri\}\}/g, String(historyCssUri))
                .replace(/\{\{historyJsUri\}\}/g, String(historyJsUri))
                .replace(/\{\{mainCssUri\}\}/g, String(mainCssUri))
                .replace(/\{\{mainJsUri\}\}/g, String(mainJsUri));
        } catch (e) {
            // Fallback minimal HTML if template load fails
            return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${String(mainCssUri)}"></head><body><div id="messages">Template load failed.</div><script nonce="${nonce}" src="${String(historyJsUri)}"></script><script nonce="${nonce}" src="${String(mainJsUri)}"></script></body></html>`;
        }
    }
}
