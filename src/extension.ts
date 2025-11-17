import * as vscode from 'vscode';
import { AssistaXProvider } from './core/webview/AssistaXProvider.js';
import { registerAllCommands } from './core/commands/index.js';

export function activate(context: vscode.ExtensionContext) {
    const provider = new AssistaXProvider(context.extensionUri, context);

    const registration = vscode.window.registerWebviewViewProvider(
        AssistaXProvider.viewType,
        provider,
        { webviewOptions: { retainContextWhenHidden: true } }
    );

    context.subscriptions.push(registration);

    const commandDisposables = registerAllCommands(context, provider);
    context.subscriptions.push(...commandDisposables);
}

export function deactivate() { }
