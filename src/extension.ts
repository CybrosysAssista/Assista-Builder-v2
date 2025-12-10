import * as vscode from 'vscode';
import { AssistaXProvider } from './core/webview/AssistaXProvider.js';
import { registerAllCommands } from './core/commands/index.js';
import { OdooEnvironmentService } from './core/utils/odooDetection.js';
import { restoreDecorations } from './core/utils/decorationUtils.js';

export function activate(context: vscode.ExtensionContext) {
    const odooEnvService = new OdooEnvironmentService(context);

    const provider = new AssistaXProvider(
        context.extensionUri,
        context,
        odooEnvService
    );

    const registration = vscode.window.registerWebviewViewProvider(
        AssistaXProvider.viewType,
        provider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );

    context.subscriptions.push(registration);

    // Restore decorations when switching editors
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                restoreDecorations(editor);
            }
        })
    );

    const commandDisposables = registerAllCommands(context, provider);
    context.subscriptions.push(...commandDisposables);

    context.subscriptions.push(odooEnvService);
}

export function deactivate() { }
