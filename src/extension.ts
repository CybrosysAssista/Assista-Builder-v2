import * as vscode from 'vscode';
import { detectOdooReleaseVersion } from './lib/utils/odooVersion';
import { createActiveFileBroadcaster } from './lib/services/activeFile';
import { AssistaXProvider } from './lib/webview/AssistaXProvider.js';

export function activate(context: vscode.ExtensionContext) {
    console.log('Assista X extension is being activated');

    const provider = new AssistaXProvider(context.extensionUri, context);

    // Register the webview view provider
    const registration = vscode.window.registerWebviewViewProvider(
        'assistaXView', // This must match the ID in package.json
        provider,
        {
            webviewOptions: {
                retainContextWhenHidden: true
            }
        }
    );

    context.subscriptions.push(registration);

    // Register all command handlers (includes welcome, edit, and other commands)
    import('./lib/commands/index.js').then(({ registerAllCommands }) => {
        const commandDisposables = registerAllCommands(context, provider);
        context.subscriptions.push(...commandDisposables);
    }).catch(err => console.error('[Assista X] Failed to load commands:', err));

    // Setup active file tracking service (used by commands)
    createActiveFileBroadcaster(provider, context);

    // All commands are now registered via registerAllCommands above
    // The following commands have been extracted to modules:
    // - showWelcomePanel → lib/commands/welcome.ts
    // - editOdooProject → lib/commands/editProject.ts
    // - insertContent, searchAndReplace → lib/commands/fileOperations.ts
    // - applyEditsFromPrompt → lib/commands/applyEdits.ts
    // - generateOdooModule → lib/commands/generateModule.ts
    // - createManifest, settings, showDetectedVersion, more, openHistory, openChat, addFolder → lib/commands/settings.ts

    // Try to detect Odoo project version from release.py on activation (non-blocking)
    detectOdooReleaseVersion()
        .then((info: { version: string | null; file?: vscode.Uri } | null) => {
            if (info) {
                context.workspaceState.update('assistaX.odooVersion', info.version || '');
                context.workspaceState.update('assistaX.releasePyPath', info.file?.fsPath || '');
                context.workspaceState.update('assistaX.isOdooProject', !!info.version);
                if (info.version) {
                    console.log(`[Assista X] Detected Odoo version: ${info.version} via ${info.file?.fsPath}`);
                }
            }
        })
        .catch((err: unknown) => console.warn('[Assista X] Odoo detection failed:', err));

    console.log('Assista X extension activated successfully');
}

export function deactivate() { }
