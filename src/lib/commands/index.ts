/**
 * Command registration hub
 * Centralizes all command handler registrations
 */
import * as vscode from 'vscode';
import { registerWelcomePanelCommand } from './welcome.js';
import { registerEditProjectCommand } from './editProject.js';
import { registerFileOperationsCommands } from './fileOperations.js';
import { registerApplyEditsCommand } from './applyEdits.js';
import { registerGenerateModuleCommand } from './generateModule.js';
import { registerSettingsCommands } from './settings.js';
import type { AssistaXProvider } from '../webview/AssistaXProvider.js';

export function registerAllCommands(
    context: vscode.ExtensionContext,
    provider: AssistaXProvider
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Register welcome panel
    disposables.push(registerWelcomePanelCommand(context, provider));

    // Register edit project command
    disposables.push(registerEditProjectCommand(context, provider));

    // Register file operations commands
    disposables.push(...registerFileOperationsCommands(context));

    // Register apply edits command
    disposables.push(registerApplyEditsCommand(context, provider));

    // Register generate module command
    disposables.push(registerGenerateModuleCommand(context, provider));

    // Register settings and utility commands
    disposables.push(...registerSettingsCommands(context, provider));

    // Register open view command
    disposables.push(
        vscode.commands.registerCommand('assistaX.open', () => {
            vscode.commands.executeCommand('workbench.view.extension.assistaXSidebar');
        })
    );

    return disposables;
}

