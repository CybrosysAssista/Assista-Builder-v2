/**
 * Settings and utility command handlers
 */
import * as vscode from 'vscode';
import { detectOdooReleaseVersion } from '../utils/odooVersion.js';
import { AssistaXProvider } from '../webview/AssistaXProvider.js';
import { AssistaXChatPanel } from '../webview/AssistaXChatPanel.js';

export function registerSettingsCommands(
    context: vscode.ExtensionContext,
    provider: AssistaXProvider
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    disposables.push(vscode.commands.registerCommand('assistaX.createManifest', async () => {
        try {
            const moduleName = await vscode.window.showInputBox({
                title: 'Module Technical Name',
                prompt: 'Enter the technical name for the module (e.g., estate)',
                value: 'estate',
                ignoreFocusOut: true,
                validateInput: v => v && /^[a-z0-9_]+$/.test(v) ? undefined : 'Use lowercase letters, numbers, and underscores'
            });
            if (!moduleName) { return; }

            const detectedVer = String(context.workspaceState.get('assistaX.odooVersion') || '17.0');
            const version = await vscode.window.showInputBox({
                title: 'Odoo Version',
                prompt: 'Enter Odoo version',
                value: detectedVer,
                ignoreFocusOut: true
            }) || detectedVer;

            const targetUris = await vscode.window.showOpenDialog({
                title: 'Select destination folder',
                canSelectFiles: false,
                canSelectFolders: true,
                canSelectMany: false,
                openLabel: 'Select'
            });
            if (!targetUris || !targetUris[0]) { return; }
            const folderUri = targetUris[0];

            // Minimal manifest content
            const { formatModuleNameForDisplay } = await import('../utils/moduleName.js');
            const manifest = `{
    'name': '${formatModuleNameForDisplay(moduleName)}',
    'summary': 'Real Estate Management',
    'version': '${version}',
    'category': 'Real Estate',
    'author': 'Your Company',
    'website': 'https://example.com',
    'license': 'LGPL-3',
    'depends': [],
    'data': [],
    'installable': True,
    'application': True,
}`;

            // Write to <selected>/<moduleName>/__manifest__.py
            const relativePath = `${moduleName}/__manifest__.py`;
            const segments = relativePath.split('/');
            const fileName = segments.pop()!;
            const dirUri = segments.length ? vscode.Uri.joinPath(folderUri, ...segments) : folderUri;

            // Ensure subdirectories exist before writing file
            const { ensureDirectory, writeFileContent } = await import('../services/fileService.js');
            await ensureDirectory(dirUri);

            const fullPath = vscode.Uri.joinPath(dirUri, fileName);
            await writeFileContent(fullPath, manifest);

            vscode.window.showInformationMessage(`Created ${relativePath}`);
        } catch (err) {
            vscode.window.showErrorMessage(`Failed to create manifest: ${(err as Error).message}`);
        }
    }));

    // Command to open settings overlay within the main Assista X view
    disposables.push(vscode.commands.registerCommand('assistaX.settings', async () => {
        // Focus the main view and request it to open the in-webview settings overlay
        await vscode.commands.executeCommand('assistaXView.focus');
        vscode.window.showInformationMessage('Assista X: Opening settings…');
        console.log('[Assista X] Settings command invoked: posting openSettings');
        provider.openSettings();
        // Additional fallbacks in case of race conditions
        setTimeout(() => { console.log('[Assista X] Retry openSettings @200ms'); provider.openSettings(); }, 200);
        setTimeout(() => { console.log('[Assista X] Retry openSettings @600ms'); provider.openSettings(); }, 600);
        setTimeout(() => { console.log('[Assista X] Retry openSettings @1000ms'); provider.openSettings(); }, 1000);
    }));

    // New: Show detected Odoo version (on-demand detection if missing)
    disposables.push(vscode.commands.registerCommand('assistaX.showDetectedVersion', async () => {
        let ver = String(context.workspaceState.get('assistaX.odooVersion') || '');
        let src = String(context.workspaceState.get('assistaX.releasePyPath') || '');
        if (!ver) {
            const info = await detectOdooReleaseVersion();
            if (info) {
                ver = info.version || '';
                src = info.file?.fsPath || '';
                await context.workspaceState.update('assistaX.odooVersion', ver);
                await context.workspaceState.update('assistaX.releasePyPath', src);
                await context.workspaceState.update('assistaX.isOdooProject', !!ver);
            }
        }
        if (ver) {
            vscode.window.showInformationMessage(`Detected Odoo version: ${ver}${src ? ` (from ${src})` : ''}`);
        } else {
            vscode.window.showWarningMessage('No release.py found or version could not be parsed.');
        }
    }));

    // "More" command handler (required by package.json contributes.commands)
    disposables.push(vscode.commands.registerCommand('assistaX.more', async () => {
        const actions = [
            { label: '$(history) History', id: 'history' },
            { label: '$(gear) Settings', id: 'settings' },
            { label: '$(comment-discussion) Open Chat Panel', id: 'openChat' },
            { label: '$(info) Show Detected Odoo Version', id: 'showVersion' },
            { label: '$(rocket) Generate Odoo Module', id: 'generate' },
            { label: '$(file-code) Create __manifest__.py', id: 'manifest' },
            { label: '$(eye) Focus Assista X View', id: 'focus' },
        ];
        const pick = await vscode.window.showQuickPick(actions, {
            placeHolder: 'Assista X — More',
            ignoreFocusOut: true
        });
        if (!pick) return;
        switch (pick.id) {
            case 'history':
                await vscode.commands.executeCommand('assistaXView.focus');
                provider.openSettings();
                setTimeout(() => provider.sendMessage({ command: 'openHistory' }), 50);
                break;
            case 'settings':
                await vscode.commands.executeCommand('assistaX.settings');
                break;
            case 'openChat':
                await vscode.commands.executeCommand('assistaX.openChat');
                break;
            case 'showVersion':
                await vscode.commands.executeCommand('assistaX.showDetectedVersion');
                break;
            case 'generate':
                await vscode.commands.executeCommand('assistaX.generateOdooModule');
                break;
            case 'manifest':
                await vscode.commands.executeCommand('assistaX.createManifest');
                break;
            case 'focus':
                await vscode.commands.executeCommand('assistaXView.focus');
                break;
        }
    }));

    // Open History command
    disposables.push(vscode.commands.registerCommand('assistaX.openHistory', async () => {
        await vscode.commands.executeCommand('assistaXView.focus');
        try {
            provider.sendMessage({ command: 'openHistory' });
        } catch (e) {
            try {
                provider.openSettings();
                setTimeout(() => provider.sendMessage({ command: 'openHistory' }), 100);
            } catch { }
        }
    }));

    // Open Chat command
    disposables.push(vscode.commands.registerCommand('assistaX.openChat', async () => {
        AssistaXChatPanel.createOrShow(context);
    }));

    // Add folder / new chat command
    disposables.push(vscode.commands.registerCommand('assistaX.addFolder', async () => {
        await vscode.commands.executeCommand('assistaXView.focus');
        try {
            provider.sendMessage({ command: 'newChat' });
        } catch {
            try {
                provider.openSettings();
                setTimeout(() => provider.sendMessage({ command: 'newChat' }), 120);
            } catch { }
        }
    }));

    return disposables;
}
