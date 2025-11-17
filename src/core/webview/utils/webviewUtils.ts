import * as vscode from 'vscode';
import * as fs from 'fs';
import { getSettingsModalHtml } from '../settings/settingsHtml.js';
import { getHistoryHtml } from '../history/historyHtml.js';

function getNonce(): string {
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let text = '';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}

export function getHtmlForWebview(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): string {
    const nonce = getNonce();
    const outPath = vscode.Uri.joinPath(extensionUri, 'out', 'core', 'webview', 'ui', 'main.js').fsPath;
    const scriptPath = fs.existsSync(outPath)
        ? ['out', 'core', 'webview', 'ui', 'main.js']
        : ['src', 'core', 'webview', 'ui', 'main.js'];

    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, ...scriptPath));

    return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Assista X</title>
    <style>
      :root {
        color-scheme: var(--vscode-color-scheme, dark light);
      }
      body {
        margin: 0;
        padding: 0;
        font-family: var(--vscode-font-family, Sans-Serif);
        // background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        display: flex;
        flex-direction: column;
        height: 100vh;
      }
      /* Force VS Code UI font in chat area */
      #messages,
      #messages .message,
      .chatbox textarea,
      .chatbox-toolbar,
      .chip-btn,
      .icon-btn {
        font-family: var(--vscode-font-family, Sans-Serif);
      }
      .top-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.1));
        background: var(--vscode-sideBar-background);
      }
      .top-bar .title {
        font-weight: 600;
        font-size: 14px;
      }
      .top-bar button {
        border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
        background: var(--vscode-button-secondaryBackground, transparent);
        color: var(--vscode-button-secondaryForeground, inherit);
        border-radius: 6px;
        padding: 4px 10px;
        font-size: 12px;
        cursor: pointer;
      }
      .top-bar button:hover {
        background: var(--vscode-button-secondaryHoverBackground, rgba(255,255,255,0.08));
      }
      #messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .message-row {
        display: flex;
      }
      .message.user {
        margin-left: auto;
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
      .message.ai {
        margin-right: auto;
        background: var(--vscode-editorWidget-background);
      }
      .message.system {
        margin: 0 auto;
        background: transparent;
        color: var(--vscode-descriptionForeground);
      }
      .message.error {
        margin: 0 auto;
        background: rgba(255, 0, 0, 0.15);
        color: var(--vscode-errorForeground);
      }
      .message {
        padding: 12px 16px;
        border-radius: 12px;
        max-width: 80%;
        word-break: break-word;
        white-space: pre-wrap;
        box-shadow: 0 2px 6px rgba(0,0,0,0.12);
      }
      .message.markdown {
        white-space: normal;
        line-height: 1.5;
      }
      .message.markdown p {
        margin: 0 0 0.65em;
      }
      .message.markdown p:last-child {
        margin-bottom: 0;
      }
      .message.markdown pre {
        background: var(--vscode-editor-background);
        color: inherit;
        padding: 12px;
        border-radius: 8px;
        overflow-x: auto;
        margin: 0.75em 0;
        font-size: 12px;
        line-height: 1.45;
      }
      .message.markdown code {
        font-family: var(--vscode-editor-font-family, "SFMono-Regular", Consolas, "Liberation Mono", monospace);
        background: var(--vscode-editor-background);
        padding: 0.1em 0.35em;
        border-radius: 4px;
        font-size: 0.95em;
      }
      .message.markdown pre code {
        padding: 0;
        background: transparent;
        font-size: 12px;
      }
      .message.markdown ul,
      .message.markdown ol {
        padding-left: 1.4em;
        margin: 0.5em 0 0.75em;
      }
      .message.markdown li + li {
        margin-top: 0.35em;
      }
      .message.markdown blockquote {
        border-left: 3px solid var(--vscode-editorLineNumber-foreground, rgba(255,255,255,0.25));
        margin: 0.75em 0;
        padding-left: 0.85em;
        color: var(--vscode-descriptionForeground);
      }
      .message.markdown table {
        border-collapse: collapse;
        width: 100%;
        margin: 0.75em 0;
        font-size: 12px;
      }
      .message.markdown th,
      .message.markdown td {
        border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.1));
        padding: 6px 8px;
        text-align: left;
      }
      .message.markdown a {
        color: var(--vscode-textLink-foreground, #3794ff);
        text-decoration: none;
      }
      .message.markdown a:hover {
        text-decoration: underline;
      }
      /* Input bar container at the bottom */
      .input-bar {
        padding: 12px;
        border-top: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.1));
        background: var(--vscode-sideBar-background);
      }
      /* Chatbox styled like the reference */
      .chatbox {
        background: var(--vscode-input-background, #1f1f1f);
        border: 1px solid var(--vscode-input-border, #3a3a3a);
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(0,0,0,0.25);
        overflow: visible;
      }
      .chatbox textarea {
        width: 100%;
        background: transparent;
        border: none;
        outline: none;
        padding: 12px 14px 8px 14px;
        font-family: inherit;
        font-size: 13px;
        color: inherit;
        resize: none;
      }
      .chatbox-toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 8px 8px 8px;
      }
      .chatbox-toolbar .left,
      .chatbox-toolbar .right { display: flex; align-items: center; gap: 8px; }
      /* Tighter spacing between Code chip and Model chip */
      .chatbox-toolbar .left { gap: 6px; }
      /* Tighter spacing on the right icon cluster */
      .chatbox-toolbar .right { gap: 6px; }
      .chatbox-toolbar .right .icon-btn { padding: 4px; }
      .chatbox-toolbar .right .icon-svg { width: 14px; height: 14px; }
      .icon-btn { display: inline-flex; align-items: center; justify-content: center; padding: 6px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--vscode-descriptionForeground); cursor: pointer; }
      .icon-btn:hover { background: var(--vscode-editorWidget-background); }
      .chip-btn { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; color: var(--vscode-descriptionForeground); background: transparent; border: none; cursor: pointer; padding: 2px 4px; border-radius: 6px; }
      .chip-btn:hover { color: inherit; background: var(--vscode-editorWidget-background); }
      .menu { position: relative; }
      .dropdown { position: absolute; bottom: 100%; left: 0; margin-bottom: 8px; width: 260px; background: var(--vscode-editorWidget-background); border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.12)); border-radius: 8px; box-shadow: 0 16px 40px rgba(0,0,0,0.35); display: none; overflow: hidden; z-index: 9999; }
      .dropdown.visible { display: block; }
      .dropdown .section-title { padding: 8px 10px; font-size: 11px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08)); }
      .dropdown button.item { width: 100%; text-align: left; padding: 8px 10px; background: transparent; color: inherit; border: none; display: flex; align-items: center; justify-content: space-between; cursor: pointer; }
      .dropdown button.item:hover { background: rgba(255,255,255,0.06); }
      .dropdown .item.custom { border-top: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.08)); justify-content: flex-start; gap: 8px; }
      .send-btn { padding: 6px; border-radius: 9999px; }
      .send-btn[disabled] { opacity: 0.5; cursor: not-allowed; }
      .icon-svg { width: 16px; height: 16px; display: inline-block; }
      textarea {
        flex: 1;
        resize: none;
        border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
        border-radius: 8px;
        padding: 10px 12px;
        font-family: inherit;
        font-size: 13px;
        color: inherit;
        background: var(--vscode-input-background);
      }
      textarea:focus {
        outline: 1px solid var(--vscode-focusBorder);
        border-color: var(--vscode-focusBorder);
      }
      button {
        border: none;
        border-radius: 8px;
        padding: 0 16px;
        font-size: 13px;
        cursor: pointer;
      }
      /* Keep send button unstyled (no blue background) */
      #sendBtn { background: transparent; color: inherit; }
      #sendBtn.hidden {
        display: none;
      }
      #stopBtn {
        background: var(--vscode-errorForeground);
        color: var(--vscode-editor-background);
        display: none;
      }
      #stopBtn.visible {
        display: inline-flex;
      }
      .settings-overlay {
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.45);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 20;
      }
      .settings-overlay.visible {
        display: flex;
      }
      .settings-modal {
        width: min(480px, 90vw);
        background: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.1));
        border-radius: 10px;
        box-shadow: 0 16px 40px rgba(0,0,0,0.35);
        padding: 16px 20px 20px;
      }
      .settings-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .settings-header h2 {
        margin: 0;
        font-size: 16px;
      }
      .settings-header button {
        background: transparent;
        color: inherit;
        font-size: 18px;
        padding: 4px 8px;
      }
      .settings-section {
        margin-bottom: 16px;
      }
      .settings-section h3 {
        font-size: 14px;
        margin: 0 0 8px 0;
      }
      .settings-group {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-bottom: 12px;
      }
      .settings-group label {
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
      }
      .settings-group input {
        width: 100%;
        box-sizing: border-box;
        border-radius: 6px;
        border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
        background: var(--vscode-input-background);
        color: inherit;
        padding: 8px;
        font-size: 13px;
      }
      .settings-group small {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
      }
      .radio-group {
        display: flex;
        gap: 12px;
        margin: 6px 0 12px;
      }
      .radio-group label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
      }
      .settings-actions {
        display: flex;
        justify-content: flex-end;
        gap: 8px;
        margin-top: 16px;
      }
      .settings-actions button {
        padding: 6px 14px;
      }
      .settings-actions .primary {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
      .settings-actions .secondary {
        background: transparent;
        border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.4));
        color: inherit;
      }
      .settings-status {
        font-size: 11px;
        color: var(--vscode-descriptionForeground);
      }
      .settings-status.configured {
        color: var(--vscode-testing-iconPassed, #4caf50);
      }
      .settings-status.missing {
        color: var(--vscode-errorForeground);
      }
      .settings-message {
        font-size: 12px;
        margin-bottom: 8px;
        min-height: 16px;
      }
      .settings-message.error {
        color: var(--vscode-errorForeground);
      }
      .settings-message.success {
        color: var(--vscode-testing-iconPassed, #56c);
      }

      /* New full-page Settings styles */
      #settingsPage {
        padding: 20px;
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
      }
      .settings-container { max-width: 800px; margin: 0 auto; }
      .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 30px;
        padding-bottom: 15px;
        border-bottom: 1px solid var(--vscode-panel-border, #333);
      }
      .header h1 { font-size: 24px; font-weight: 400; }
      .header-buttons { display: flex; gap: 10px; }
      .btn { padding: 8px 16px; border: none; border-radius: 3px; cursor: pointer; font-size: 13px; font-weight: 500; }
      .btn-save { background-color: var(--vscode-button-background, #0e639c); color: var(--vscode-button-foreground, #fff); }
      .btn-save:hover { filter: brightness(1.05); }
      .btn-done { background-color: var(--vscode-sideBar-background, #3c3c3c); color: var(--vscode-editor-foreground, #ccc); }
      .btn-done:hover { filter: brightness(1.1); }
      .section { margin-bottom: 30px; }
      .section-title { font-size: 13px; margin-bottom: 8px; font-weight: 400; }
      .section-description { font-size: 12px; color: var(--vscode-descriptionForeground, #888); margin-bottom: 15px; }
      .input-group { margin-bottom: 20px; }
      .input-label { font-size: 13px; margin-bottom: 8px; display: block; }
      .link { color: var(--vscode-textLink-foreground, #3794ff); text-decoration: none; margin-left: 10px; font-size: 12px; }
      .link:hover { text-decoration: underline; }
      select, input[type="text"], input[type="password"] {
        width: 100%; padding: 8px 12px; background-color: var(--vscode-input-background, #3c3c3c);
        border: 1px solid var(--vscode-input-border, #3c3c3c); color: inherit; border-radius: 3px; font-size: 13px; outline: none;
      }
      select:focus, input:focus { border-color: var(--vscode-focusBorder, #007acc); }
      .inline-buttons { display: flex; gap: 5px; margin-left: 10px; }
      .icon-btn { background: none; border: none; color: inherit; cursor: pointer; padding: 4px 8px; border-radius: 3px; font-size: 14px; }
      .icon-btn:hover { background-color: var(--vscode-editorWidget-background, #3c3c3c); }
      .profile-row { display: flex; align-items: center; margin-bottom: 15px; }
      .profile-row select { flex: 1; }
      .checkbox-group { display: flex; align-items: center; margin-bottom: 12px; }
      .checkbox-group input[type="checkbox"] { width: auto; margin-right: 10px; cursor: pointer; }
      .checkbox-group label { font-size: 13px; cursor: pointer; }
      .info-text { font-size: 12px; color: var(--vscode-descriptionForeground, #888); margin-top: 5px; }
      .info-box { background-color: var(--vscode-editorWidget-background, #252526); padding: 15px; border-radius: 4px; margin-top: 15px; font-size: 12px; line-height: 1.6; }
      .info-box ul { list-style: none; padding-left: 15px; }
      .info-box li { margin: 5px 0; }
      .info-box li::before { content: "✓"; color: var(--vscode-testing-iconPassed, #4ec9b0); margin-right: 8px; }
      .error-message { background-color: #5a1d1d; border-left: 3px solid #f48771; padding: 10px; margin: 10px 0; font-size: 12px; color: #f48771; border-radius: 3px; }
      .expandable { cursor: pointer; display: flex; align-items: center; gap: 5px; font-size: 13px; margin-top: 15px; padding: 8px 0; }
      .arrow { transition: transform 0.2s; }
      .arrow.expanded { transform: rotate(90deg); }
    </style>
  </head>
  <body>
    
    <div id="welcomeScreen" style="display:none;" aria-hidden="true"></div>
    <div id="messages"></div>
    ${getSettingsModalHtml()}
    ${getHistoryHtml()}
    <div class="input-bar">
      <div class="chatbox">
        <textarea id="chatInput" rows="1" placeholder="Ask anything (Ctrl+L)" style="max-height:200px; min-height:44px"></textarea>
        <div class="chatbox-toolbar">
          <div class="left">
            <div class="menu" id="modeMenu">
              <button class="chip-btn" id="modeToggle" title="Mode">
                <span id="modeIcon">
                  <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="16 18 22 12 16 6"/>
                    <polyline points="8 6 2 12 8 18"/>
                  </svg>
                </span>
                <span id="modeLabel">Code</span>
              </button>
              <div class="dropdown" id="modeDropdown">
                <button class="item" data-mode="code"><span>Code</span><span class="desc" style="opacity:.6;font-size:11px">Cascade can write and edit code</span></button>
                <button class="item" data-mode="chat"><span>Chat</span><span class="desc" style="opacity:.6;font-size:11px">Chat with Cascade</span></button>
              </div>
            </div>
            <div class="menu" id="modelMenu">
              <button class="chip-btn" id="modelToggle" title="Model">
                <span id="modelLabel">GPT-5 (low reasoning)</span>
              </button>
              <div class="dropdown" id="modelDropdown">
                <div class="section-title">Recently Used</div>
                <button class="item" data-model="gpt5-low"><span>GPT-5 (low reasoning)</span><span style="opacity:.6;font-size:11px">0.5x</span></button>
                <button class="item" data-model="gpt5-high"><span>GPT-5 (high reasoning)</span><span style="opacity:.6;font-size:11px">3x</span></button>
                <div class="section-title">Recommended</div>
                <button class="item" data-model="gpt4"><span>GPT-4</span><span style="opacity:.6;font-size:11px">2x</span></button>
                <button class="item" data-model="sonnet-4.5"><span>Claude Sonnet 4.5</span><span style="opacity:.6;font-size:11px">2x</span></button>
                <button class="item" data-model="sonnet-4-thinking"><span>Claude Sonnet 4.5 Thinking</span><span style="opacity:.6;font-size:11px">3x</span></button>
                <button class="item custom" data-action="custom-api"><span>Use custom API key…</span></button>
              </div>
            </div>
          </div>
          <div class="right">
            <button class="icon-btn" id="mentionBtn" title="Mention"><span style="font-weight:600; font-size:13px;">@</span></button>
            <button class="icon-btn send-btn" id="stopBtn" type="button" title="Stop">
              <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="6" y="6" width="12" height="12" rx="1"/>
              </svg>
            </button>
            <button class="icon-btn send-btn" id="sendBtn" type="button" title="Send">
              <svg class="icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 2L11 13"/>
                <path d="M22 2l-7 20-4-9-9-4 20-7z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
    <script nonce="${nonce}" type="module" src="${scriptUri}"></script>
  </body>
</html>`;
}
