/**
 * Main webview provider for Assista X sidebar
 * Refactored to use modular message handlers
 */
import * as vscode from 'vscode';
import {
    ContextHandler,
    SettingsHandler,
    PlanHandler,
    GenerationHandler,
    EditHandler,
    FlowControlHandler,
    MessageHandler
} from './handlers/index.js';
import { getHtmlForWebview } from './utils/webviewUtils.js';

export class AssistaXProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'assistaXView';
    private _view?: vscode.WebviewView;
    private _activeFlowId?: number;
    private _cancelRequested: boolean = false;
    private _fromWelcomeGenerate: boolean = false;
    private _pendingAction: { type: string; data?: any } | undefined;
    private _planConfirmResolver?: (v: { approved: boolean; allowCreate: boolean }) => void;
    private _planConfirmTimer?: NodeJS.Timeout;

    // Message handlers
    private readonly handlers: MessageHandler[];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        private readonly _context: vscode.ExtensionContext
    ) {
        // Initialize handlers
        this.handlers = [
            new ContextHandler(),
            new SettingsHandler(this._context),
            new PlanHandler(this._context, () => this.isCancelRequested(), () => this.resetCancel()),
            new GenerationHandler(this._context, () => this.isCancelRequested(), () => this.resetCancel()),
            new EditHandler(this._context),
            new FlowControlHandler(() => this.requestCancel())
        ];
    }

    // Cancel helpers
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
        let retries = 40;
        const id = setInterval(() => {
            if (this._view) {
                clearInterval(id);
                post();
            } else if (--retries <= 0) {
                clearInterval(id);
            }
        }, 150);
    }

    public sendMessage(message: any) {
        if (this._activeFlowId != null && typeof message === 'object' && message && message.flowId == null) {
            message.flowId = this._activeFlowId;
        }
        const post = () => this._view?.webview.postMessage(message);
        if (this._view) {
            post();
            return;
        }
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

    public async waitForPlanConfirmation(timeoutMs: number = 60000): Promise<{ approved: boolean; allowCreate: boolean } | undefined> {
        this._planConfirmResolver = undefined;
        if (this._planConfirmTimer) {
            clearTimeout(this._planConfirmTimer);
            this._planConfirmTimer = undefined;
        }
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

        webviewView.webview.html = getHtmlForWebview(webviewView.webview, this._extensionUri);

        webviewView.webview.onDidReceiveMessage(async message => {
            // Track current flow id from webview
            if (typeof message?.flowId === 'number') {
                this._activeFlowId = message.flowId;
            }

            // Try handlers first (they return true if handled)
            for (const handler of this.handlers) {
                try {
                    // Pass provider object with access to provider instance for state management
                    const providerObj: any = { 
                        sendMessage: this.sendMessage.bind(this), 
                        _view: this._view, 
                        _context: this._context,
                        _providerInstance: this // Allow handlers to access provider instance for state updates
                    };
                    if (await handler.handle(message, providerObj)) {
                        return; // Handler processed the message
                    }
                } catch (error) {
                    console.error(`[Assista X] Handler error:`, error);
                }
            }

            // Handle remaining messages that don't fit into handlers
            await this.handleOtherMessages(message);
        });
    }

    private async handleOtherMessages(message: any) {
        // Mark generation from welcome (tracked by provider state)
        if (message?.command === 'markGenerateFromWelcome') {
            this._fromWelcomeGenerate = true;
            return;
        }

        // Plan confirmation messages
        if (message?.type === 'plan.confirm') {
            const allowCreate = !!message?.allowCreate;
            const resolver = this._planConfirmResolver;
            this._planConfirmResolver = undefined;
            if (this._planConfirmTimer) {
                clearTimeout(this._planConfirmTimer);
                this._planConfirmTimer = undefined;
            }
            resolver?.({ approved: true, allowCreate });
                    return;
                }

        if (message?.type === 'plan.cancel') {
            const resolver = this._planConfirmResolver;
            this._planConfirmResolver = undefined;
            if (this._planConfirmTimer) {
                clearTimeout(this._planConfirmTimer);
                this._planConfirmTimer = undefined;
            }
            resolver?.({ approved: false, allowCreate: false });
                    return;
                }

        // Legacy confirm bar buttons (for plan confirmation)
        if (message?.type === 'confirmProceed') {
            const resolver = this._planConfirmResolver;
            this._planConfirmResolver = undefined;
            if (this._planConfirmTimer) {
                clearTimeout(this._planConfirmTimer);
                this._planConfirmTimer = undefined;
            }
            resolver?.({ approved: true, allowCreate: false });
            return;
        }

        if (message?.type === 'confirmCancel') {
            const resolver = this._planConfirmResolver;
            this._planConfirmResolver = undefined;
            if (this._planConfirmTimer) {
                clearTimeout(this._planConfirmTimer);
                this._planConfirmTimer = undefined;
            }
            resolver?.({ approved: false, allowCreate: false });
            return;
        }

        // Confirm proceed/cancel for pending actions (legacy)
        if (message.type === 'confirmCancel' && this._pendingAction) {
            this.setPendingAction(undefined);
            this._view?.webview.postMessage({ type: 'clearConfirm' });
            return;
        }

        if (message.type === 'confirmProceed' && this._pendingAction) {
            const action = this._pendingAction;
            this.setPendingAction(undefined);
            this._view?.webview.postMessage({ type: 'clearConfirm' });
            
            // Handle specific action types
            if (action?.type === 'altNumberModule') {
                await this.handleAltNumberModule();
            } else if (action?.type === 'generateModuleFromPlan') {
                await this.handleGenerateModuleFromPlan(action.data);
            } else if (action?.type === 'modifyExisting') {
                await this.handleModifyExisting(action.data);
            }
            return;
        }
    }

    // Legacy action handlers (kept for compatibility)
    private async handleAltNumberModule() {
        try {
                        const moduleName = await vscode.window.showInputBox({
                            title: 'New Module Technical Name',
                            prompt: 'Enter the module name to create (e.g., partner_alt_number)',
                            value: 'partner_alt_number',
                            ignoreFocusOut: true,
                            validateInput: v => v && /^[a-z0-9_]+$/.test(v) ? undefined : 'Use lowercase letters, numbers, and underscores'
                        });
            if (!moduleName) return;

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
            if (!dest || !dest[0]) return;

                        const baseDir = dest[0];
                        const moduleRoot = vscode.Uri.joinPath(baseDir, moduleName);
                        const { ensureDirectory, writeFileContent } = await import('../services/fileService.js');
                        await ensureDirectory(moduleRoot);

                        const write = async (relPath: string, content: string) => {
                            const parts = relPath.split('/').filter(Boolean);
                            const file = parts.pop()!;
                            const dirUri = parts.length ? vscode.Uri.joinPath(moduleRoot, ...parts) : moduleRoot;
                            await ensureDirectory(dirUri);
                            const fileUri = vscode.Uri.joinPath(dirUri, file);
                            await writeFileContent(fileUri, content);
                        };

                        const { formatModuleNameForDisplay } = await import('../utils/moduleName.js');
                        const manifest = `{
    'name': '${formatModuleNameForDisplay(moduleName)}',
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

    private async handleGenerateModuleFromPlan(data: any) {
        // This is handled by the generation handler - delegate to command
        try {
            await vscode.commands.executeCommand('assistaX.generateOdooModule');
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to generate from plan: ${(err as Error).message}`);
                    }
                }

    private async handleModifyExisting(data: any) {
        // This is handled by the edit handler - delegate to command
        try {
            await vscode.commands.executeCommand('assistaX.applyEditsFromPrompt', { userPrompt: data?.prompt || '' });
                    } catch (err) {
                        vscode.window.showErrorMessage(`Failed to modify existing project: ${(err as Error).message}`);
        }
    }
}
