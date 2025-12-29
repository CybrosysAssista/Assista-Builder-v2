import * as vscode from 'vscode';
import { AssistaCoderProvider } from './core/webview/AssistaCoderProvider.js';
import { registerAllCommands } from './core/commands/index.js';
import { OdooEnvironmentService } from './core/utils/odooDetection.js';

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


    context.subscriptions.push(registration);

    const commandDisposables = registerAllCommands(context, provider);
    context.subscriptions.push(...commandDisposables);

    context.subscriptions.push(odooEnvService);
}

export function deactivate() { }
