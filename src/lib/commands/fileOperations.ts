/**
 * File operation command handlers
 */
import * as vscode from 'vscode';

export function registerFileOperationsCommands(
    context: vscode.ExtensionContext
): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];

    // Insert content into the active file (line: 0 appends at end; positive inserts before that 1-based line)
    disposables.push(vscode.commands.registerCommand('assistaX.insertContent', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Assista X: No active editor. Open a file first.');
            return;
        }
        const doc = editor.document;
        const uri = doc.uri;
        try { await vscode.workspace.fs.stat(uri); } catch {
            vscode.window.showWarningMessage('Assista X: Target file does not exist on disk.');
            return;
        }
        const lineStr = await vscode.window.showInputBox({
            title: 'Insert line (1-based). Use 0 to append at end',
            prompt: 'Line number to insert before (1-based). 0 appends at the end.',
            value: '0',
            ignoreFocusOut: true
        });
        if (lineStr == null) return;
        const lineNum = Number(lineStr);
        if (!Number.isInteger(lineNum) || lineNum < 0) {
            vscode.window.showErrorMessage('Assista X: Invalid line number.');
            return;
        }
        const content = await vscode.window.showInputBox({
            title: 'Content to insert',
            prompt: 'Paste or type the content to insert (newlines supported with Shift+Enter).',
            ignoreFocusOut: true,
            value: ''
        });
        if (content == null) return;
        const lastLine = doc.lineCount; // 1-based when comparing
        const insertPos = lineNum === 0 ? new vscode.Position(lastLine, 0) : new vscode.Position(Math.max(0, Math.min(lineNum - 1, lastLine)), 0);
        await editor.edit(edit => { edit.insert(insertPos, content + (content.endsWith('\n') ? '' : '\n')); });
        vscode.window.showInformationMessage('Assista X: Content inserted.');
    }));

    // Search and replace in the active file with optional regex and line ranges
    disposables.push(vscode.commands.registerCommand('assistaX.searchAndReplace', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showWarningMessage('Assista X: No active editor. Open a file first.');
            return;
        }
        const doc = editor.document;
        try { await vscode.workspace.fs.stat(doc.uri); } catch {
            vscode.window.showWarningMessage('Assista X: Target file does not exist on disk.');
            return;
        }
        const search = await vscode.window.showInputBox({ title: 'Search', prompt: 'Text or regex pattern to search for', ignoreFocusOut: true });
        if (!search) return;
        const replace = await vscode.window.showInputBox({ title: 'Replace', prompt: 'Replacement text', ignoreFocusOut: true, value: '' });
        if (replace == null) return;
        const useRegex = (await vscode.window.showQuickPick(['No (literal)', 'Yes (regex)'], { title: 'Use regex?', ignoreFocusOut: true }))?.startsWith('Yes');
        const ignoreCase = (await vscode.window.showQuickPick(['No (case-sensitive)', 'Yes (ignore case)'], { title: 'Ignore case?', ignoreFocusOut: true }))?.startsWith('Yes');
        const rangeStr = await vscode.window.showInputBox({ title: 'Optional line range', prompt: 'Format: start:end (1-based). Leave empty for whole file.', ignoreFocusOut: true, value: '' });
        let startLine = 1, endLine = doc.lineCount;
        if (rangeStr && /\d+:\d+/.test(rangeStr)) {
            const [a, b] = rangeStr.split(':').map(n => Math.max(1, Math.min(Number(n) || 1, doc.lineCount)));
            startLine = Math.min(a, b); endLine = Math.max(a, b);
        }
        const text = doc.getText(new vscode.Range(new vscode.Position(startLine - 1, 0), new vscode.Position(endLine, 0)));
        const flags = ignoreCase ? 'gi' : 'g';
        let pattern: RegExp;
        try { pattern = useRegex ? new RegExp(search, flags) : new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags); } catch (e) {
            vscode.window.showErrorMessage('Assista X: Invalid regex pattern.');
            return;
        }
        const replaced = text.replace(pattern, replace);
        if (replaced === text) {
            vscode.window.showInformationMessage('Assista X: No matches found in the specified range.');
            return;
        }
        await editor.edit(edit => {
            edit.replace(new vscode.Range(new vscode.Position(startLine - 1, 0), new vscode.Position(endLine, 0)), replaced);
        });
        vscode.window.showInformationMessage('Assista X: Replacements applied.');
    }));

    return disposables;
}

