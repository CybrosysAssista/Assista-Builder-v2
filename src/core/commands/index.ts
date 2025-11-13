import * as vscode from 'vscode';
import type { AssistaXProvider } from '../webview/AssistaXProvider.js';

export function registerAllCommands(
    context: vscode.ExtensionContext,
    provider: AssistaXProvider
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand('assistaX.open', () => {
            vscode.commands.executeCommand('workbench.view.extension.assistaXSidebar');
        })
    );

    disposables.push(
        vscode.commands.registerCommand('assistaX.settings', async () => {
            await vscode.commands.executeCommand('assistaX.open');
            provider.showSettings();
        })
    );

    disposables.push(
        vscode.commands.registerCommand('assistaX.newChat', async () => {
            await vscode.commands.executeCommand('assistaX.open');
            await provider.startNewChat();
        })
    );

    disposables.push(
        vscode.commands.registerCommand('assistaX.openHistory', async () => {
            await vscode.commands.executeCommand('assistaX.open');
            await provider.showHistoryPicker();
        })
    );

    return disposables;
}

