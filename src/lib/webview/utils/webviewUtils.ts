import * as vscode from 'vscode';
import * as fs from 'fs';
import { getNonce } from '../utils.js';

export function getHtmlForWebview(
    webview: vscode.Webview,
    extensionUri: vscode.Uri
): string {
    const nonce = getNonce();
    const outPath = vscode.Uri.joinPath(extensionUri, 'out', 'lib', 'webview', 'ui', 'main.js').fsPath;
    const scriptPath = fs.existsSync(outPath)
        ? ['out', 'lib', 'webview', 'ui', 'main.js']
        : ['src', 'lib', 'webview', 'ui', 'main.js'];

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
        background: var(--vscode-editor-background);
        color: var(--vscode-editor-foreground);
        display: flex;
        flex-direction: column;
        height: 100vh;
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
      .input-bar {
        display: flex;
        gap: 8px;
        padding: 12px;
        border-top: 1px solid var(--vscode-panel-border, rgba(255,255,255,0.1));
        background: var(--vscode-sideBar-background);
      }
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
      #sendBtn {
        background: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }
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
    </style>
  </head>
  <body>
    <header class="top-bar">
      <div class="title">Assista X</div>
      <button id="settingsBtn" type="button">Settings</button>
    </header>
    <div id="welcomeScreen" style="display:none;" aria-hidden="true"></div>
    <div id="messages"></div>
    <div id="settingsOverlay" class="settings-overlay" aria-hidden="true">
      <div class="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settingsTitle">
        <div class="settings-header">
          <h2 id="settingsTitle">Settings</h2>
          <button id="closeSettingsBtn" type="button" aria-label="Close settings">×</button>
        </div>
        <form id="settingsForm">
          <div id="settingsMessage" class="settings-message"></div>
          <div class="settings-section">
            <h3>Active Provider</h3>
            <div class="radio-group">
              <label><input type="radio" name="activeProvider" value="google"> Gemini (Google)</label>
              <label><input type="radio" name="activeProvider" value="openrouter"> OpenRouter</label>
            </div>
          </div>
          <div class="settings-section">
            <h3>Gemini (Google)</h3>
            <div class="settings-group">
              <label for="googleKey">API Key <span id="googleStatus" class="settings-status"></span></label>
              <input id="googleKey" type="password" placeholder="Enter Gemini API key" autocomplete="off" />
              <small>Leave blank to keep the existing key.</small>
            </div>
            <div class="settings-group">
              <label for="googleModel">Model</label>
              <input id="googleModel" type="text" placeholder="gemini-1.5-pro-latest" />
            </div>
          </div>
          <div class="settings-section">
            <h3>OpenRouter</h3>
            <div class="settings-group">
              <label for="openrouterKey">API Key <span id="openrouterStatus" class="settings-status"></span></label>
              <input id="openrouterKey" type="password" placeholder="Enter OpenRouter API key" autocomplete="off" />
              <small>Leave blank to keep the existing key.</small>
            </div>
            <div class="settings-group">
              <label for="openrouterModel">Model</label>
              <input id="openrouterModel" type="text" placeholder="anthropic/claude-3.5-sonnet" />
            </div>
          </div>
          <div class="settings-actions">
            <button type="button" class="secondary" id="cancelSettingsBtn">Cancel</button>
            <button type="submit" class="primary" id="saveSettingsBtn">Save</button>
          </div>
        </form>
      </div>
    </div>
    <div class="input-bar">
      <textarea id="chatInput" rows="1" placeholder="Ask anything..."></textarea>
      <button id="stopBtn" type="button">Stop</button>
      <button id="sendBtn" type="button">Send</button>
    </div>
    <script nonce="${nonce}" src="${scriptUri}"></script>
  </body>
</html>`;
}

