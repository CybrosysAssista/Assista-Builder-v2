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


    context.subscriptions.push(registration);

    const commandDisposables = registerAllCommands(context, provider);
    context.subscriptions.push(...commandDisposables);

    context.subscriptions.push(odooEnvService);

    // Listen for editor changes to restore decorations
    const activeEditorListener = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) {
            restoreDecorations(editor);
        }
    });

    const visibleEditorsListener = vscode.window.onDidChangeVisibleTextEditors(editors => {
        editors.forEach(editor => {
            restoreDecorations(editor);
        });
    });

    context.subscriptions.push(activeEditorListener, visibleEditorsListener);

    const documentChangeListener = vscode.workspace.onDidChangeTextDocument(event => {
        const editors = vscode.window.visibleTextEditors.filter(e => e.document === event.document);
        editors.forEach(editor => {
            restoreDecorations(editor);
        });
    });

    context.subscriptions.push(documentChangeListener);
}

export function deactivate() { }
