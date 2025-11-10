/**
 * Chat panel webview for streaming generation updates
 */
import * as vscode from 'vscode';

export class AssistaXChatPanel {
    public static currentPanel: AssistaXChatPanel | undefined;
    private readonly panel: vscode.WebviewPanel;
    private disposables: vscode.Disposable[] = [];
    private readonly context: vscode.ExtensionContext;

    public static createOrShow(context: vscode.ExtensionContext) {
        const column = vscode.ViewColumn.Beside;
        if (AssistaXChatPanel.currentPanel) {
            AssistaXChatPanel.currentPanel.panel.reveal(column);
            return;
        }
        const panel = vscode.window.createWebviewPanel(
            'assistaXChat',
            'Assista X Chat',
            { viewColumn: column, preserveFocus: false },
            {
                enableScripts: true,
                retainContextWhenHidden: true
            }
        );
        AssistaXChatPanel.currentPanel = new AssistaXChatPanel(panel, context);
    }

    private constructor(panel: vscode.WebviewPanel, context: vscode.ExtensionContext) {
        this.panel = panel;
        this.context = context;
        this.panel.webview.html = this.getHtml();
        this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

        this.panel.webview.onDidReceiveMessage(async (msg) => {
            if (msg?.type === 'userMessage') {
                const text: string = (msg.text || '').toString();
                this.appendAssistant(`Received: ${text}`);
                await this.handleUserMessage(text);
            }
        }, undefined, this.disposables);
    }

    private appendAssistant(text: string) {
        this.panel.webview.postMessage({ type: 'assistantMessage', text });
    }

    private appendEvent(event: any) {
        this.panel.webview.postMessage({ type: 'progress', event });
    }

    private async handleUserMessage(text: string) {
        // 0) Try a simple, targeted in-editor edit before invoking module generation.
        // Example: "change the field name x_custom_field to Alternative Number"
        try {
            const handled = await this.trySimpleFieldLabelEdit(text);
            if (handled) {
                return; // edit applied; no need to proceed with generation flow
            }
        } catch (e) {
            // Non-fatal: fall back to normal generation flow
            console.warn('trySimpleFieldLabelEdit failed:', e);
        }

        // Basic parsing: detect targeted files with `/file path1,path2` or backticked paths
        let targetFiles: string[] | undefined = undefined;
        const fileCmd = text.match(/\/file\s+(.+)/i);
        if (fileCmd) {
            targetFiles = fileCmd[1].split(/[ ,\n]+/).map(s => s.trim()).filter(Boolean);
        } else {
            const backticked = [...text.matchAll(/`([^`]+\.[a-zA-Z0-9]+)`/g)].map(m => m[1]);
            if (backticked.length) targetFiles = backticked;
        }

        // Ask for module name (allow inline override) and optionally honor inline version hint
        const moduleMatch = text.match(/\bmodule[:=]\s*([\w_]+)/i);
        const versionMatch = text.match(/\bversion[:=]\s*([\d.]+)/i);
        const moduleName = moduleMatch?.[1] || await vscode.window.showInputBox({ prompt: 'Module Name (e.g., school_management)', ignoreFocusOut: true });
        if (!moduleName) { this.appendAssistant('Cancelled: module name required.'); return; }
        const version = versionMatch?.[1] || '17.0';

        // Prompt for parent directory, create subfolder moduleName
        const selected = await vscode.window.showOpenDialog({
            openLabel: 'Select parent folder for module',
            canSelectFiles: false,
            canSelectFolders: true,
            canSelectMany: false
        });
        if (!selected || selected.length === 0) { this.appendAssistant('Cancelled: no parent folder selected.'); return; }
        const parentDir = selected[0];
        const folderUri = vscode.Uri.joinPath(parentDir, moduleName);

        // Progress bridge
        const progressCb = (event: { type: string; payload?: any }) => this.appendEvent(event);

        try {
            this.appendAssistant('Starting validation and specification generation...');
            // Import AI module
            const { generateOdooModule } = await import('../ai/index.js');
            const result = await generateOdooModule(
                text,
                version,
                moduleName,
                this.context,
                targetFiles ? { targetFiles } : undefined,
                progressCb,
                () => false // cancel check
            );

            const files = result.files || {};
            const progressInfo = result.progressInfo || {};

            // Ensure destination folder exists
            const { ensureDirectory, writeFileContent } = await import('../services/fileService.js');
            try { await ensureDirectory(folderUri); } catch { }

            // Write files
            for (const [relPath, content] of Object.entries(files)) {
                const dest = vscode.Uri.joinPath(folderUri, relPath);
                // Ensure parent dirs
                const parts = relPath.split('/');
                if (parts.length > 1) {
                    const dir = vscode.Uri.joinPath(folderUri, ...parts.slice(0, -1));
                    try { await ensureDirectory(dir); } catch { }
                }
                const fileStr = typeof content === 'string' ? content : String(content);
                await writeFileContent(dest, fileStr);
                this.appendEvent({ type: 'file.written', payload: { path: relPath } });
                // Open the file immediately after generation (non-preview, do not steal focus)
                try {
                    await vscode.window.showTextDocument(dest, { preview: false, preserveFocus: true });
                } catch { }
            }

            this.appendAssistant(`Done. Generated ${Object.keys(files).length} file(s).`);
            this.panel.webview.postMessage({ command: 'statusBubble', action: 'hide' });
            this.panel.webview.postMessage({ type: 'summary', info: progressInfo || {} });
        } catch (err) {
            this.appendAssistant(`Error: ${String(err)}`);
        }
    }

    /**
     * Attempt a direct in-place edit on the currently open editor when the user asks to
     * change a field label. This avoids creating new files and updates the active document.
     *
     * Supported phrasing examples:
     *  - "change the field name x_custom_field to Alternative Number"
     *  - "rename field x_custom_field to 'Alternative Number'"
     *
     * Behavior:
     *  - If a Python file is active, search for a field definition like:
     *      x_custom_field = fields.Char(..., string='Old Label', ...)
     *    and replace the string value with the requested label.
     *
     * Returns true if an edit was performed, false otherwise.
     */
    private async trySimpleFieldLabelEdit(userText: string): Promise<boolean> {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return false;

        // Only attempt on Python files (models)
        const doc = editor.document;
        if (doc.languageId !== 'python') return false;

        const text = doc.getText();

        // Extract field technical name and new label from the user message
        // Examples matched:
        //  - change the field name x_custom_field to Alternative Number
        //  - change field x_custom_field to "Alternative Number"
        //  - rename field x_custom_field to 'Alternative Number'
        const intentRe = /\b(?:change|rename)\s+(?:the\s+)?field(?:\s+name)?\s+([a-zA-Z_][\w]*)\s+to\s+(["']?)([^"'\n]+)\2/i;
        const m = intentRe.exec(userText);
        if (!m) return false;
        const fieldName = m[1];
        const newLabel = m[3].trim();

        if (!fieldName || !newLabel) return false;

        // Regex to find a fields.* definition for the given field with a string= kwarg.
        // Capture groups:
        // 1: prefix up to and including string=
        // 2: opening quote
        // 3: current label content
        // 4: closing quote (same as opening)
        const fieldDefRe = new RegExp(
            String.raw`${fieldName}\s*=\s*fields\.[A-Za-z_]+\s*\([^\)]*?string\s*=\s*(["'])[^"']*\1`,
            'ms'
        );

        // To perform a precise replacement, use a slightly different regex with multiple groups
        const replacerRe = new RegExp(
            String.raw`(${fieldName}\s*=\s*fields\.[A-Za-z_]+\s*\([^\)]*?string\s*=\s*)(["'])([^"']*)(\2)`,
            'ms'
        );

        const match = replacerRe.exec(text);
        if (!match) {
            this.appendAssistant(`Could not locate a string= label for field "${fieldName}" in the active file. Please ensure the file with the field definition is open.`);
            return false;
        }

        const fullMatch = match[0];
        const prefix = match[1];
        const quote = match[2];
        const oldLabel = match[3];
        const suffixQuote = match[4];

        const updated = `${prefix}${quote}${newLabel}${suffixQuote}`;

        const start = match.index;
        const end = start + fullMatch.length;
        const startPos = doc.positionAt(start);
        const endPos = doc.positionAt(end);

        const edit = new vscode.WorkspaceEdit();
        edit.replace(doc.uri, new vscode.Range(startPos, endPos), updated);

        const applied = await vscode.workspace.applyEdit(edit);
        if (applied) {
            await doc.save();
            this.appendAssistant(`Updated label for ${fieldName} to "${newLabel}" in the active file.`);
            this.appendEvent({ type: 'file.written', payload: { path: doc.uri.fsPath } });
            return true;
        } else {
            this.appendAssistant('Failed to apply edit to the active document.');
            return false;
        }
    }

    private getHtml() {
        const nonce = String(Date.now());
        return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline' vscode-resource:; script-src 'nonce-${nonce}';" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Assista X Chat</title>
  <style>
    body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); background: var(--vscode-editor-background); margin: 0; }
    .container { display: flex; flex-direction: column; height: 100vh; }
    .messages { flex: 1; overflow: auto; padding: 12px; }
    .msg { margin: 8px 0; padding: 10px 12px; border-radius: 8px; max-width: 90%; }
    .assistant { background: var(--vscode-editor-inactiveSelectionBackground); align-self: flex-start; color: var(--vscode-foreground); }
    .user { background: var(--vscode-editor-selectionBackground); align-self: flex-end; color: var(--vscode-foreground); }
    .assistant { background: var(--vscode-editor-inactiveSelectionBackground); align-self: flex-start; }
    .user { background: var(--vscode-editor-selectionBackground); align-self: flex-end; }
    .input { display: flex; padding: 8px; border-top: 1px solid var(--vscode-editorGroup-border); }
    .input textarea { flex: 1; resize: vertical; min-height: 38px; max-height: 120px; }
    .input button { margin-left: 8px; }
    .chip { display:inline-block; padding:2px 6px; border-radius: 6px; background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); font-size: 11px; margin-right:6px; }
    .mono { font-family: var(--vscode-editor-font-family); white-space: pre-wrap; }
  </style>
  </head>
<body>
  <div class="container">
    <div id="messages" class="messages"></div>
    <div id="confirm" class="confirm-bar">
      <div id="confirmLabel" class="label">Proceed with the planned changes?</div>
      <div class="confirm-actions">
        <button id="proceed" class="btn primary">Proceed</button>
        <button id="cancel" class="btn ghost">Cancel</button>
      </div>
    </div>
    <div class="input">
      <textarea id="input" placeholder="Describe your module… Use /file <path> for targeted files. e.g. /file my_module/__manifest__.py"></textarea>
      <button id="send">Send</button>
    </div>
  </div>
</body>
</html>`;
    }

    public dispose() {
        AssistaXChatPanel.currentPanel = undefined;
        while (this.disposables.length) {
            const d = this.disposables.pop();
            try { d?.dispose(); } catch { }
        }
        this.panel.dispose();
    }
}
