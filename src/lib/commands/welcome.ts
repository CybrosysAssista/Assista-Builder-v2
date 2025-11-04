/**
 * Welcome panel command handler
 */
import * as vscode from 'vscode';
import type { AssistaXProvider } from '../webview/AssistaXProvider.js';

export function registerWelcomePanelCommand(context: vscode.ExtensionContext, provider: AssistaXProvider): vscode.Disposable {
    const showWelcomePanelCmd = vscode.commands.registerCommand('assistaX.showWelcomePanel', async () => {
        try {
            const panel = vscode.window.createWebviewPanel(
                'assistaXWelcome',
                'Assista X — Welcome',
                { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
                {
                    enableScripts: true,
                    retainContextWhenHidden: false,
                    localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'media')]
                }
            );

            const nonce = String(Date.now());
            const cssUri = panel.webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'media', 'main.css'));

            // Minimal welcome-only HTML that reuses our styles and mirrors the in-sidebar welcome
            panel.webview.html = `<!DOCTYPE html>
            <html lang="en">
            <head>
              <meta charset="UTF-8">
              <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${panel.webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
              <meta name="viewport" content="width=device-width, initial-scale=1.0" />
              <title>Assista X — Welcome</title>
              <link rel="stylesheet" href="${cssUri}" />
            </head>
            <body>
              <div class="main-content" style="display:flex">
                <div class="welcome-screen active" id="welcomeScreen" aria-hidden="false" style="display:flex">
                  <div class="ws-logo">
                    <div class="ws-logo-badge" aria-hidden="true">
                      <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor" aria-hidden="true">
                        <path d="M12 2l2.39 4.84L20 8.27l-3.9 3.8.92 5.37L12 15.9l-4.98 2.62.92-5.37L4 8.27l5.61-1.43L12 2z"/>
                      </svg>
                    </div>
                    <h1 class="ws-title">Ask Assista X</h1>
                    <p class="ws-sub">Assista X is powered by AI, so mistakes are possible. Review output carefully before use.</p>
                  </div>
                  <div class="ws-options">
                    <button class="ws-card" id="wsNewProjectBtn" type="button">
                      <div class="ws-card-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19 3H5a2 2 0 0 0-2 2v3h2V5h14v14h-3v2h3a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/><path d="M3 21h10a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2zm1-9h8v2H4v-2zm0 4h8v2H4v-2z"/></svg>
                      </div>
                      <span class="ws-card-label">Generate New Project</span>
                    </button>
                    <button class="ws-card" id="wsEditProjectBtn" type="button">
                      <div class="ws-card-icon" aria-hidden="true">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25z"/><path d="M20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>
                      </div>
                      <span class="ws-card-label">Edit Existing Project</span>
                    </button>
                  </div>
                  <div class="ws-footer">
                    <div class="ws-tip"><span>📎</span><span>or type # to attach context</span></div>
                    <div class="ws-tip"><span>@</span><span>to chat with extensions</span></div>
                    <div class="ws-tip"><span>/</span><span>to use commands</span></div>
                  </div>
                </div>
              </div>
              <script nonce="${nonce}">
                const vscode = acquireVsCodeApi();
                function byId(id){ return document.getElementById(id); }
                const genBtn = byId('wsNewProjectBtn');
                const editBtn = byId('wsEditProjectBtn');
                if (genBtn) genBtn.addEventListener('click', ()=>{ try { vscode.postMessage({ command: 'welcome.selectGenerate' }); } catch {} });
                if (editBtn) editBtn.addEventListener('click', ()=>{ try { vscode.postMessage({ command: 'welcome.selectEdit' }); } catch {} });
              </script>
            </body>
            </html>`;

            panel.webview.onDidReceiveMessage(async (msg) => {
                try {
                    if (!msg || !msg.command) return;
                    // Mark welcome as shown so we don't auto-open again next activation
                    try { await context.globalState.update('assistaX.hasShownWelcomePanel', true); } catch {}
                    // Always focus the sidebar view, then route to the same flows as the in-sidebar welcome
                    try { await vscode.commands.executeCommand('assistaXView.focus'); } catch {}
                    switch (msg.command) {
                        case 'welcome.selectGenerate': {
                            try { provider.sendMessage({ command: 'switchMode', mode: 'generate', keepSession: false }); } catch {}
                            break;
                        }
                        case 'welcome.selectEdit': {
                            try { provider.sendMessage({ command: 'switchMode', mode: 'edit', keepSession: true }); } catch {}
                            try { provider.sendMessage({ command: 'requestActiveFile' }); } catch {}
                            try { await vscode.commands.executeCommand('assistaX.editOdooProject'); } catch {}
                            break;
                        }
                        default: break;
                    }
                } finally {
                    try { panel.dispose(); } catch {}
                }
            });
        } catch (e) {
            try { console.warn('[Assista X] Failed to show Welcome panel:', e); } catch {}
        }
    });
    context.subscriptions.push(showWelcomePanelCmd);

    // On first activation, automatically show the Welcome panel in the editor (once),
    // but only if the editor area is empty (no files open). If editors are open, do nothing.
    try {
        const hasShown = context.globalState.get<boolean>('assistaX.hasShownWelcomePanel');
        const noEditorsOpen = (vscode.window.visibleTextEditors || []).length === 0;
        if (!hasShown && noEditorsOpen) {
            // Delay slightly to allow VS Code to finish restoring UI
            setTimeout(() => {
                try { vscode.commands.executeCommand('assistaX.showWelcomePanel'); } catch {}
            }, 300);
        }
    } catch {}
    
    return showWelcomePanelCmd;
}

