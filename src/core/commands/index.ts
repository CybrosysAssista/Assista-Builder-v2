import * as vscode from 'vscode';
import type { AssistaCoderProvider } from '../webview/AssistaCoderProvider.js';

export function registerAllCommands(
    context: vscode.ExtensionContext,
    provider: AssistaCoderProvider
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(
        vscode.commands.registerCommand('assistaCoder.open', () => {
            vscode.commands.executeCommand('workbench.view.extension.assistaCoderSidebar');
        })
    );

    disposables.push(
        vscode.commands.registerCommand('assistaCoder.settings', async () => {
            await vscode.commands.executeCommand('assistaCoder.open');
            provider.showSettings();
        })
    );

    disposables.push(
        vscode.commands.registerCommand('assistaCoder.newChat', async () => {
            await vscode.commands.executeCommand('assistaCoder.open');
            await provider.startNewChat();
        })
    );

    disposables.push(
        vscode.commands.registerCommand('assistaCoder.openHistory', async () => {
            await vscode.commands.executeCommand('assistaCoder.open');
            provider.showHistory();
        })
    );

    return disposables;
}

