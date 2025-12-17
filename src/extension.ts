import * as vscode from 'vscode';
import { AssistaCoderProvider } from './core/webview/AssistaCoderProvider.js';
import { registerAllCommands } from './core/commands/index.js';
import { OdooEnvironmentService } from './core/utils/odooDetection.js';
import { restoreDecorations } from './core/utils/decorationUtils.js';

export function activate(context: vscode.ExtensionContext) {
    const odooEnvService = new OdooEnvironmentService();

    const provider = new AssistaCoderProvider(
        context.extensionUri,
        context,
        odooEnvService
    );

    const registration = vscode.window.registerWebviewViewProvider(
        AssistaCoderProvider.viewType,
        provider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );

    // Restore decorations when switching editors
    context.subscriptions.push(
        vscode.window.onDidChangeActiveTextEditor(editor => {
            if (editor) {
                restoreDecorations(editor);
            }
        })
    );

    context.subscriptions.push(registration);

    const commandDisposables = registerAllCommands(context, provider);
    context.subscriptions.push(...commandDisposables);

    context.subscriptions.push(odooEnvService);
}

export function deactivate() { }
