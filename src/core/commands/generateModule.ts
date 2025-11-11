import * as vscode from 'vscode';
import { AssistaXProvider } from '../webview/AssistaXProvider.js';

export function registerGenerateModuleCommand(
    _context: vscode.ExtensionContext,
    _provider: AssistaXProvider
): vscode.Disposable {
    return vscode.commands.registerCommand('assistaX.generateOdooModule', async () => {
        vscode.window.showWarningMessage('Module generation has been removed in this simplified build.');
    });
}

