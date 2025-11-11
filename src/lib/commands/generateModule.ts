import * as vscode from 'vscode';

export function registerGenerateModuleCommand(
    _context: vscode.ExtensionContext,
    _provider: unknown
): vscode.Disposable {
    return vscode.commands.registerCommand('assistaX.generateOdooModule', async () => {
        vscode.window.showWarningMessage('Module generation has been removed in this simplified build.');
    });
}
